// src/renderer/engine/PracticeEngine.ts
// REWRITE: Fix các bug:
//   1. Step mode dùng manual note scheduling thay vì Tone.js Part
//   2. Verdict flash tự clear sau FLASH_DURATION_MS
//   3. Follow mode có timeout tự mark miss nếu user không bấm
//   4. pendingPresses reset khi chuyển nốt mới

import * as Tone from 'tone';
import type { NoteEvent, ParsedMusic } from '../types/music';
import type { NoteResult, NoteVerdict, SessionStats, PracticeMode } from '../types/practice';
import { EMPTY_STATS } from '../types/practice';

const LATE_THRESHOLD_MS  = 250;   // ms — bấm sau threshold này → late
const FOLLOW_MISS_MS     = 1200;  // ms — follow mode: quá giờ này không bấm → miss
const FLASH_DURATION_MS  = 600;   // ms — bao lâu thì màu correct/wrong/late tắt
const SCORE_CORRECT      = 100;
const SCORE_LATE         = 40;
const SCORE_COMBO_BONUS  = 10;

export type VerdictFlashCallback = (
  midi: number[],
  verdict: 'correct' | 'wrong' | 'late',
  clearAfterMs: number,
) => void;

export interface PracticeCallbacks {
  onNoteResult:    (result: NoteResult, stats: SessionStats) => void;
  onExpectedChange:(midi: number[]) => void;   // nốt tiếp theo user cần bấm
  onVerdictFlash:  VerdictFlashCallback;       // flash màu phím
  onStepAdvance:   (nextNoteIndex: number) => void;
  onSessionEnd:    (stats: SessionStats) => void;
}

export class PracticeEngine {
  private music:     ParsedMusic | null = null;
  private mode:      PracticeMode = 'view';
  private callbacks: PracticeCallbacks;

  private currentNoteIdx: number = 0;
  private noteOnWallTime: number = 0;    // Date.now() khi note reach user
  private stats:          SessionStats = { ...EMPTY_STATS };
  private results:        NoteResult[] = [];
  private pendingPresses: number[] = [];
  private active:         boolean = false;

  private missTimer:  ReturnType<typeof setTimeout> | null = null;
  private flashTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(callbacks: PracticeCallbacks) {
    this.callbacks = callbacks;
  }

  // ── Setup ──────────────────────────────────────────────────────────────────

  loadMusic(music: ParsedMusic): void {
    this.music = music;
    this.reset();
  }

  setMode(mode: PracticeMode): void {
    this.mode = mode;
  }

  // ── Session ────────────────────────────────────────────────────────────────

  start(): void {
    if (!this.music) return;
    this.reset();
    this.active = true;
  }

  stop(): void {
    this._clearTimers();
    this.active = false;
  }

  reset(): void {
    this._clearTimers();
    this.currentNoteIdx = 0;
    this.noteOnWallTime = 0;
    this.stats          = { ...EMPTY_STATS, totalNotes: this.music?.notes.length ?? 0 };
    this.results        = [];
    this.pendingPresses = [];
    this.active         = false;
  }

  // ── Called by PlaybackStore khi Transport đến note mới ────────────────────
  // Đây là hook chính — được gọi từ Tone.getDraw().schedule trong PlaybackEngine

  onNoteReached(noteIndex: number): void {
    if (!this.active || this.mode === 'view') return;

    this._clearTimers();
    this.currentNoteIdx = noteIndex;
    this.noteOnWallTime = Date.now();
    this.pendingPresses = [];

    const expected = this._getExpectedMidi(noteIndex);
    this.callbacks.onExpectedChange(expected);

    if (this.mode === 'step') {
      // Step: pause ngay sau khi note hiện ra, chờ user bấm
      // Dùng setTimeout nhỏ để audio note kịp phát trước khi pause
      setTimeout(() => {
        if (this.active && this.mode === 'step') {
          Tone.getTransport().pause();
        }
      }, 50);

    } else if (this.mode === 'follow') {
      // Follow: set timer miss nếu user không bấm đúng hạn
      this.missTimer = setTimeout(() => {
        if (!this.active || this.mode !== 'follow') return;
        // Chưa bấm gì → mark miss (wrong)
        const allPressed = expected.every(m => this.pendingPresses.includes(m));
        if (!allPressed) {
          this._recordResult('wrong', expected, [], FOLLOW_MISS_MS);
          this.callbacks.onVerdictFlash(expected, 'wrong', FLASH_DURATION_MS);
        }
      }, FOLLOW_MISS_MS);
    }
  }

  // ── User bấm phím ─────────────────────────────────────────────────────────

  onUserKeyPress(midiNote: number): void {
    if (!this.active || this.mode === 'view' || !this.music) return;

    const timingMs = Date.now() - this.noteOnWallTime;
    const expected = this._getExpectedMidi(this.currentNoteIdx);
    if (!expected.length) return;

    // Thêm vào pending nếu chưa có
    if (!this.pendingPresses.includes(midiNote)) {
      this.pendingPresses.push(midiNote);
    }

    // Bấm nốt không nằm trong expected → wrong ngay
    if (!expected.includes(midiNote)) {
      this._recordResult('wrong', expected, [midiNote], timingMs);
      this.callbacks.onVerdictFlash([midiNote], 'wrong', FLASH_DURATION_MS);
      if (this.mode === 'step') {
        // Step mode: wrong → clear pending, chờ lại
        this.pendingPresses = [];
        this.noteOnWallTime = Date.now(); // reset timing
      }
      return;
    }

    // Kiểm tra đã bấm đủ chord chưa
    const allPressed = expected.every(m => this.pendingPresses.includes(m));
    if (!allPressed) return; // chờ thêm nốt chord

    // Đủ chord → evaluate
    this._clearTimers();

    const verdict: NoteVerdict = timingMs > LATE_THRESHOLD_MS ? 'late' : 'correct';
    this._recordResult(verdict, expected, [...this.pendingPresses], timingMs);
    this.callbacks.onVerdictFlash(expected, verdict, FLASH_DURATION_MS);

    if (this.mode === 'step') {
      const nextIdx = this._nextNoteIdx(this.currentNoteIdx);
      this.callbacks.onStepAdvance(nextIdx);

      if (nextIdx >= this.music.notes.length) {
        this._endSession();
      } else {
        // Advance đến note tiếp theo
        this.currentNoteIdx = nextIdx;
        this.noteOnWallTime = Date.now();
        this.pendingPresses = [];
        const nextExpected = this._getExpectedMidi(nextIdx);
        this.callbacks.onExpectedChange(nextExpected);
        // Resume Transport một chút để phát note, rồi pause lại
        Tone.getTransport().start();
        setTimeout(() => {
          if (this.active && this.mode === 'step') {
            Tone.getTransport().pause();
          }
        }, 300); // đủ thời gian để note phát
      }
    }
  }

  // ── Song end ──────────────────────────────────────────────────────────────

  onSongEnd(): void {
    if (!this.active) return;
    this._endSession();
  }

  // ── Getters ───────────────────────────────────────────────────────────────

  get isActive():     boolean      { return this.active; }
  get practiceMode(): PracticeMode { return this.mode; }
  get currentStats(): SessionStats { return { ...this.stats }; }

  getExpectedMidiAt(noteIndex: number): number[] {
    return this._getExpectedMidi(noteIndex);
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private _getExpectedMidi(idx: number): number[] {
    if (!this.music) return [];
    const notes = this.music.notes;
    if (idx >= notes.length) return [];

    const base = notes[idx];
    const group = [base.midiNote];
    let i = idx + 1;
    while (
      i < notes.length &&
      notes[i].chordGroupId === base.chordGroupId &&
      notes[i].isChord
    ) {
      group.push(notes[i].midiNote);
      i++;
    }
    return group;
  }

  private _nextNoteIdx(idx: number): number {
    if (!this.music) return idx + 1;
    const notes = this.music.notes;
    const base  = notes[idx];
    let i = idx + 1;
    // Skip các nốt cùng chord
    while (
      i < notes.length &&
      notes[i].chordGroupId === base.chordGroupId &&
      notes[i].isChord
    ) {
      i++;
    }
    return i;
  }

  private _recordResult(
    verdict: NoteVerdict,
    expectedMidi: number[],
    pressedMidi: number[],
    timingMs: number,
  ): void {
    const result: NoteResult = {
      noteIndex: this.currentNoteIdx,
      expectedMidi,
      pressedMidi,
      verdict,
      timingMs,
    };
    this.results.push(result);

    const s = this.stats;
    if (verdict === 'correct') {
      s.correct++;
      s.currentCombo++;
      s.score += SCORE_CORRECT + s.currentCombo * SCORE_COMBO_BONUS;
    } else if (verdict === 'late') {
      s.late++;
      s.currentCombo++;
      s.score += SCORE_LATE;
    } else {
      s.wrong++;
      s.currentCombo = 0;
    }

    s.maxCombo = Math.max(s.maxCombo, s.currentCombo);
    const evaluated = s.correct + s.wrong + s.late;
    s.accuracy = evaluated > 0
      ? Math.round(((s.correct + s.late * 0.5) / evaluated) * 100)
      : 0;
    const prevTotal = (evaluated - 1) * s.avgTimingMs;
    s.avgTimingMs   = Math.round((prevTotal + timingMs) / evaluated);

    this.callbacks.onNoteResult(result, { ...s });
  }

  private _endSession(): void {
    this._clearTimers();
    this.active = false;
    this.callbacks.onSessionEnd({ ...this.stats });
  }

  private _clearTimers(): void {
    if (this.missTimer)  { clearTimeout(this.missTimer);  this.missTimer  = null; }
    if (this.flashTimer) { clearTimeout(this.flashTimer); this.flashTimer = null; }
  }
}
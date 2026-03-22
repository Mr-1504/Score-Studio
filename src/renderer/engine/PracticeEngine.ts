import type { NoteEvent, ParsedMusic } from '../types/music';
import type { NoteResult, NoteVerdict, SessionStats, PracticeMode } from '../types/practice';
import { EMPTY_STATS } from '../types/practice';

const LATE_MS_FOLLOW  = 300;   // ms: follow mode — phải bấm nhanh
const LATE_MS_STEP    = 3000;  // ms: step mode — có thời gian đọc nốt, 3s mới tính late
const MISS_MS         = 2000;  // ms: follow mode, quá này → miss
const FLASH_MS        = 500;   // ms: màu flash tắt sau bao lâu
const SCORE_CORRECT   = 100;
const SCORE_LATE      = 40;
const SCORE_COMBO_BONUS = 10;

export type VerdictFlashCb = (
  midi: number[],
  verdict: 'correct' | 'wrong' | 'late',
  ms: number,
) => void;

export interface PracticeCallbacks {
  onNoteResult:    (result: NoteResult, stats: SessionStats) => void;
  onExpectedChange:(midi: number[]) => void;
  onVerdictFlash:  VerdictFlashCb;
  onStepAdvance:   (nextGroupIndex: number) => void;
  onSessionEnd:    (stats: SessionStats) => void;
}

export class PracticeEngine {
private music:      ParsedMusic | null = null;
  private mode:       PracticeMode = 'view';
  private cb:         PracticeCallbacks;
  private groups:     NoteEvent[][] = [];  // chord groups

  private active      = false;
  private curGroup    = 0;
  private noteOnTime  = 0;
  private pending:    number[] = [];
  private stats:      SessionStats = { ...EMPTY_STATS };
  private missTimer:  ReturnType<typeof setTimeout> | null = null;

  constructor(cb: PracticeCallbacks) { this.cb = cb; }

  // ── Setup ─────────────────────────────────────────────────────────────────

  loadMusic(music: ParsedMusic): void {
    this.music  = music;
    this.groups = this._buildGroups(music);
    this._reset();
  }

  setMode(m: PracticeMode): void { this.mode = m; }

  start(): void {
    this._reset();
    this.active     = true;
    this.noteOnTime = Date.now(); // prevent unix-timestamp timing when pressed before first note
    console.log('[Practice] started, mode:', this.mode, 'groups:', this.groups.length);
    this.cb.onExpectedChange(this._expected(0));
  }

  stop(): void {
    this._clearMiss();
    this.active = false;
  }

  // ── Called từ PlaybackEngine khi note phát ────────────────────────────────

  onNoteReached(noteIndex: number): void {
    if (!this.active || this.mode === 'view') return;

    // Tìm group tương ứng với noteIndex này
    const gi = this.groups.findIndex(g => g.some(n => n.noteIndex === noteIndex));
    if (gi === -1) return;

    this._clearMiss();
    this.curGroup  = gi;
    this.noteOnTime = Date.now();
    this.pending   = [];

    this.cb.onExpectedChange(this._expected(gi));
    console.log('[Practice] note reached, group:', gi, 'expected:', this._expected(gi));

    if (this.mode === 'follow') {
      this.missTimer = setTimeout(() => {
        if (!this.active) return;
        const got = this._expected(this.curGroup).every(m => this.pending.includes(m));
        if (!got) {
          this._record('wrong', this._expected(this.curGroup), [], MISS_MS);
          this.cb.onVerdictFlash(this._expected(this.curGroup), 'wrong', FLASH_MS);
        }
      }, MISS_MS);
    }
  }

  // ── Called khi user bấm phím ──────────────────────────────────────────────

  onUserKeyPress(midi: number): void {
    if (!this.active || this.mode === 'view') return;

    const timing   = Date.now() - this.noteOnTime;
    const expected = this._expected(this.curGroup);
    console.log('[Practice] key press:', midi, 'expected:', expected, 'timing:', timing);

    if (!expected.length) {
      console.warn('[Practice] no expected notes!');
      return;
    }

    // Bấm nốt không nằm trong chord → wrong
    if (!expected.includes(midi)) {
      this._record('wrong', expected, [midi], timing);
      this.cb.onVerdictFlash([midi], 'wrong', FLASH_MS);
      if (this.mode === 'step') {
        // Reset để cho bấm lại
        this.pending    = [];
        this.noteOnTime = Date.now();
      }
      return;
    }

    if (!this.pending.includes(midi)) this.pending.push(midi);

    // Chưa đủ chord
    if (!expected.every(m => this.pending.includes(m))) return;

    // Đủ chord!
    this._clearMiss();
    const lateMs   = this.mode === 'step' ? LATE_MS_STEP : LATE_MS_FOLLOW;
    const verdict: NoteVerdict = timing > lateMs ? 'late' : 'correct';
    this._record(verdict, expected, [...this.pending], timing);
    this.cb.onVerdictFlash(expected, verdict, FLASH_MS);

    const next = this.curGroup + 1;

    if (this.mode === 'step') {
      if (next >= this.groups.length) {
        this._end();
      } else {
        // Báo PlaybackEngine phát note tiếp
        this.cb.onStepAdvance(next);
        this.curGroup   = next;
        this.noteOnTime = Date.now();
        this.pending    = [];
        this.cb.onExpectedChange(this._expected(next));
      }
    }
    // Follow: nhạc tự chạy, không làm gì thêm
  }

  onSongEnd(): void {
    if (this.active) this._end();
  }

  get isActive()    { return this.active; }
  get groupCount()  { return this.groups.length; }
  get practiceMode() { return this.mode; }
  get currentStats() { return { ...this.stats }; }

  getExpectedMidiAt(gi: number): number[] {
    return this._expected(gi);
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private _expected(gi: number): number[] {
    if (gi < 0 || gi >= this.groups.length) return [];
    return this.groups[gi].map(n => n.midiNote);
  }

  private _buildGroups(music: ParsedMusic): NoteEvent[][] {
    const result: NoteEvent[][] = [];
    const notes = music.notes;
    let i = 0;
    while (i < notes.length) {
      const base = notes[i];
      const g    = [base];
      let j = i + 1;
      while (j < notes.length &&
             notes[j].chordGroupId === base.chordGroupId &&
             notes[j].isChord) {
        g.push(notes[j]); j++;
      }
      result.push(g);
      i = j;
    }
    return result;
  }

  private _record(
    verdict: NoteVerdict,
    expected: number[],
    pressed: number[],
    timing: number,
  ): void {
    const result: NoteResult = {
      noteIndex:    this.groups[this.curGroup]?.[0]?.noteIndex ?? this.curGroup,
      expectedMidi: expected,
      pressedMidi:  pressed,
      verdict,
      timingMs:     timing,
    };

    const s = this.stats;
    if (verdict === 'correct') {
      s.correct++; s.currentCombo++;
      s.score += SCORE_CORRECT + s.currentCombo * SCORE_COMBO_BONUS;
    } else if (verdict === 'late') {
      s.late++; s.currentCombo++;
      s.score += SCORE_LATE;
    } else {
      s.wrong++; s.currentCombo = 0;
    }
    s.maxCombo = Math.max(s.maxCombo, s.currentCombo);
    const ev = s.correct + s.wrong + s.late;
    s.accuracy     = ev > 0 ? Math.round(((s.correct + s.late * 0.5) / ev) * 100) : 0;
    s.avgTimingMs  = ev > 0 ? Math.round(((ev - 1) * s.avgTimingMs + timing) / ev) : 0;

    console.log('[Practice] verdict:', verdict, 'stats:', s.correct, s.wrong, s.late, 'score:', s.score);
    this.cb.onNoteResult(result, { ...s });
  }

  private _end(): void {
    this._clearMiss();
    this.active = false;
    this.cb.onSessionEnd({ ...this.stats });
  }

  private _reset(): void {
    this._clearMiss();
    this.curGroup   = 0;
    this.noteOnTime = 0;
    this.pending    = [];
    this.active     = false;
    this.stats      = { ...EMPTY_STATS, totalNotes: this.groups.length };
  }

  private _clearMiss(): void {
    if (this.missTimer) { clearTimeout(this.missTimer); this.missTimer = null; }
  }
}
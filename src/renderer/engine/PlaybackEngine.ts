import * as Tone from 'tone';
import type { NoteEvent, ParsedMusic, PlaybackStatus } from '../types/music';

export type NoteOnCallback   = (notes: NoteEvent[], beatPosition: number, noteIndex: number) => void;
export type NoteOffCallback  = (midiNotes: number[]) => void;
export type PositionCallback = (currentSec: number, currentBeat: number) => void;
export type StatusCallback   = (status: PlaybackStatus) => void;
export type EndCallback      = () => void;

interface EngineCallbacks {
  onNoteOn:   NoteOnCallback;
  onNoteOff:  NoteOffCallback;
  onPosition: PositionCallback;
  onStatus:   StatusCallback;
  onEnd:      EndCallback;
}

function midiToToneName(midi: number): string {
  const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  return `${names[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

const SAMPLE_NOTES = [
  'A0','C1','A1','C2','A2','C3','A3','C4','A4','C5','A5','C6','A6','C7',
];

async function buildSoundfontSampler(
  onProgress?: (loaded: number, total: number) => void,
): Promise<Tone.Sampler> {
  const audioCtx = Tone.getContext().rawContext as AudioContext;
  const total = SAMPLE_NOTES.length;
  let loaded = 0;

  const results = await Promise.all(
    SAMPLE_NOTES.map(async (note) => {
      try {
        const bytes: number[] | null = await window.electron.fetchSoundfontNote(note);
        if (!bytes) { loaded++; onProgress?.(loaded, total); return { note, buf: null }; }
        const uint8    = new Uint8Array(bytes);
        const audioBuf = await audioCtx.decodeAudioData(uint8.buffer.slice(0));
        loaded++; onProgress?.(loaded, total);
        return { note, buf: audioBuf };
      } catch (e) {
        loaded++; onProgress?.(loaded, total);
        return { note, buf: null };
      }
    }),
  );

  const sampler = new Tone.Sampler();
  results.forEach(({ note, buf }) => { if (buf) (sampler as any).add(note, buf); });
  sampler.chain(new Tone.Volume(8), new Tone.Limiter(-1), Tone.getDestination());
  return sampler;
}

function buildFallbackSynth(): Tone.PolySynth {
  const synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.002, decay: 1.0, sustain: 0.1, release: 1.5 },
  });
  synth.maxPolyphony = 24;
  synth.chain(
    new Tone.Compressor({ threshold: -18, ratio: 4 }),
    new Tone.Reverb({ decay: 1.5, wet: 0.2 }),
    new Tone.Volume(12),
    new Tone.Limiter(-1),
    Tone.getDestination(),
  );
  return synth;
}

// ─── Engine ───────────────────────────────────────────────────────────────────

export class PlaybackEngine {
  private instrument: Tone.Sampler | Tone.PolySynth | null = null;
  private music: ParsedMusic | null = null;
  private callbacks: EngineCallbacks;

  private _status: PlaybackStatus = 'idle';
  private _speed = 1.0;
  private _stepMode = false;  // true = step mode, phát từng note

  // Follow mode scheduling
  private parts: Tone.Part[]         = [];
  private positionLoop: Tone.Loop | null = null;
  private activeNoteTimers = new Map<number, ReturnType<typeof setTimeout>>();
  private pausedAtSec = 0;

  // Step mode state
  private _stepNoteIndex = 0;
  private _stepNoteGroups: NoteEvent[][] = [];  // pre-grouped chords

  constructor(callbacks: EngineCallbacks) {
    this.callbacks = callbacks;
  }

  // ── Instrument ────────────────────────────────────────────────────────────

  async loadInstrument(onProgress?: (l: number, t: number) => void): Promise<void> {
    if (this.instrument) return;
    this._setStatus('loading');
    await Tone.start();
    const hasIPC = typeof window.electron?.fetchSoundfontNote === 'function';
    if (hasIPC) {
      try { this.instrument = await buildSoundfontSampler(onProgress); }
      catch { this.instrument = buildFallbackSynth(); }
    } else {
      this.instrument = buildFallbackSynth();
    }
    this._setStatus('idle');
  }

  // ── Load music ────────────────────────────────────────────────────────────

  loadMusic(music: ParsedMusic): void {
    this.stop();
    this.music = music;
    this.pausedAtSec = 0;
    // Pre-group notes thành chord groups cho step mode
    this._stepNoteGroups = this._buildNoteGroups(music);
    this._setStatus('idle');
  }

  setStepMode(enabled: boolean): void {
    this._stepMode = enabled;
  }

  // ── Play (follow mode) ────────────────────────────────────────────────────

  async play(): Promise<void> {
    if (!this.instrument || !this.music) return;
    if (this._status === 'playing') return;

    await Tone.start();

    if (this._stepMode) {
      // Step mode: phát note đầu tiên rồi dừng
      await this._playStepNote(this._stepNoteIndex);
      return;
    }

    // Follow mode: schedule tất cả notes như cũ
    const music = this.music;
    const speed = this._speed;
    const startOffset = this.pausedAtSec;

    const scaledNotes = music.notes.map(n => ({
      ...n,
      startSec:    n.startSec / speed,
      durationSec: n.durationSec / speed,
    }));

    const grouped = new Map<number, NoteEvent[]>();
    scaledNotes.forEach(n => {
      const key = Math.round(n.startSec * 1000);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(n);
    });

    Tone.getTransport().stop();
    Tone.getTransport().cancel();

    const offsetScaled = startOffset / speed;
    const events: { time: number; notes: NoteEvent[] }[] = [];
    [...grouped.keys()].sort((a, b) => a - b).forEach(msKey => {
      const sec = msKey / 1000;
      if (sec >= offsetScaled) {
        events.push({ time: sec - offsetScaled, notes: grouped.get(msKey)! });
      }
    });

    const instrument = this.instrument;
    const callbacks  = this.callbacks;

    const part = new Tone.Part<{ time: number; notes: NoteEvent[] }>(
      (time, { notes }) => {
        const midiNotes = notes.map(n => n.midiNote);
        const noteIdx   = notes[0]?.noteIndex ?? 0;

        Tone.getDraw().schedule(() => {
          callbacks.onNoteOn(notes, notes[0].startBeat, noteIdx);
        }, time);

        notes.forEach(n => {
          try {
            instrument.triggerAttackRelease(
              midiToToneName(n.midiNote),
              Math.max(n.durationSec, 0.1),
              time, 0.85,
            );
          } catch (_) {}
        });

        const maxDur  = Math.max(...notes.map(n => n.durationSec));
        const nowAudio = Tone.getContext().currentTime;
        const delayMs  = Math.max(0, (time - nowAudio + maxDur) * 1000) + 80;

        const timer = setTimeout(() => {
          callbacks.onNoteOff(midiNotes);
          midiNotes.forEach(m => this.activeNoteTimers.delete(m));
        }, delayMs);

        midiNotes.forEach(m => {
          const prev = this.activeNoteTimers.get(m);
          if (prev) clearTimeout(prev);
          this.activeNoteTimers.set(m, timer);
        });
      },
      events,
    );

    part.start(0);
    this.parts.push(part);

    this.positionLoop = new Tone.Loop(() => {
      const tSec    = Tone.getTransport().seconds;
      const actual  = tSec * speed + startOffset;
      callbacks.onPosition(actual, actual * (music.temposBPM[0]?.bpm ?? 120) / 60);
      if (actual >= music.totalSec + 0.5) this._onEnd();
    }, '32n');
    this.positionLoop.start(0);

    Tone.getTransport().start();
    this._setStatus('playing');
  }

  // ── Step mode: gọi từ PracticeEngine khi user bấm đúng ───────────────────

  async stepAdvance(nextNoteIndex: number): Promise<void> {
    if (!this._stepMode || !this.music) return;
    this._stepNoteIndex = nextNoteIndex;
    if (nextNoteIndex >= this._stepNoteGroups.length) {
      this._onEnd();
      return;
    }
    await this._playStepNote(nextNoteIndex);
  }

  private async _playStepNote(groupIndex: number): Promise<void> {
    if (!this.instrument || !this.music) return;
    const groups = this._stepNoteGroups;
    if (groupIndex >= groups.length) { this._onEnd(); return; }

    const notes    = groups[groupIndex];
    const noteIdx  = notes[0].noteIndex;
    const dur      = Math.max(notes[0].durationSec / this._speed, 0.15);

    this._setStatus('playing');

    // Emit note_on → PracticeEngine sẽ nhận và dừng chờ
    this.callbacks.onNoteOn(notes, notes[0].startBeat, noteIdx);
    this.callbacks.onPosition(notes[0].startSec, notes[0].startBeat);

    // Phát âm
    const now = Tone.now();
    notes.forEach(n => {
      try {
        this.instrument!.triggerAttackRelease(midiToToneName(n.midiNote), dur, now, 0.85);
      } catch (_) {}
    });

    const midiNotes = notes.map(n => n.midiNote);

    // Note off sau duration
    const timer = setTimeout(() => {
      this.callbacks.onNoteOff(midiNotes);
      midiNotes.forEach(m => this.activeNoteTimers.delete(m));
    }, dur * 1000 + 80);
    midiNotes.forEach(m => {
      const prev = this.activeNoteTimers.get(m);
      if (prev) clearTimeout(prev);
      this.activeNoteTimers.set(m, timer);
    });

    // Sau khi phát xong → set status paused (chờ user bấm)
    setTimeout(() => {
      if (this._stepMode && this._status === 'playing') {
        this._setStatus('paused');
      }
    }, dur * 1000 + 100);
  }

  // ── Pause/Stop/Seek ───────────────────────────────────────────────────────

  pause(): void {
    if (this._stepMode) { this._setStatus('paused'); return; }
    if (this._status !== 'playing') return;
    this.pausedAtSec = Tone.getTransport().seconds * this._speed + this.pausedAtSec;
    Tone.getTransport().pause();
    this._cleanupParts();
    this._setStatus('paused');
  }

  stop(): void {
    Tone.getTransport().stop();
    Tone.getTransport().cancel();
    this._cleanupParts();
    this.pausedAtSec = 0;
    this._stepNoteIndex = 0;
    this.activeNoteTimers.forEach(t => clearTimeout(t));
    this.activeNoteTimers.clear();
    this.callbacks.onNoteOff([...Array(128).keys()]);
    this._setStatus('stopped');
  }

  seek(toSec: number): void {
    if (this._stepMode) return; // seek không hỗ trợ trong step mode
    const wasPlaying = this._status === 'playing';
    if (wasPlaying) this.pause();
    this.pausedAtSec = Math.max(0, Math.min(toSec, this.music?.totalSec ?? 0));
    if (wasPlaying) this.play();
  }

  setSpeed(m: number): void {
    const clamped    = Math.max(0.25, Math.min(2.0, m));
    const wasPlaying = this._status === 'playing';
    if (wasPlaying) this.pause();
    this._speed = clamped;
    if (wasPlaying) this.play();
  }

  get speed():      number         { return this._speed; }
  get status():     PlaybackStatus { return this._status; }
  get currentSec(): number         { return this.pausedAtSec; }

  destroy(): void {
    this.stop();
    this.instrument?.dispose();
    this.instrument = null;
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private _buildNoteGroups(music: ParsedMusic): NoteEvent[][] {
    const groups: NoteEvent[][] = [];
    const notes = music.notes;
    let i = 0;
    while (i < notes.length) {
      const base = notes[i];
      const group = [base];
      let j = i + 1;
      while (j < notes.length &&
             notes[j].chordGroupId === base.chordGroupId &&
             notes[j].isChord) {
        group.push(notes[j]);
        j++;
      }
      groups.push(group);
      i = j;
    }
    return groups;
  }

  private _setStatus(s: PlaybackStatus): void {
    this._status = s;
    this.callbacks.onStatus(s);
  }

  private _cleanupParts(): void {
    this.parts.forEach(p => { p.stop(); p.dispose(); });
    this.parts = [];
    if (this.positionLoop) { this.positionLoop.stop(); this.positionLoop.dispose(); this.positionLoop = null; }
  }

  private _onEnd(): void {
    this.stop();
    this.callbacks.onEnd();
  }
}
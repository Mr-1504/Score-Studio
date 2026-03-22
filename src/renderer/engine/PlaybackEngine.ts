// src/renderer/engine/PlaybackEngine.ts
// FIXED:
//   1. SAMPLE_NOTES chỉ gồm nốt thực sự có trên CDN (A + C notes)
//   2. Tone.js timing warning: dùng time parameter đúng cách trong callback
//   3. Thêm get-soundfont-note-list IPC để renderer không hardcode list

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

// Chỉ những nốt THỰC SỰ có trên gleitz/FluidR3_GM CDN
// Tone.Sampler tự interpolate tất cả nốt còn lại
const SAMPLE_NOTES = [
  'A0',
  'C1', 'A1',
  'C2', 'A2',
  'C3', 'A3',
  'C4', 'A4',
  'C5', 'A5',
  'C6', 'A6',
  'C7',
];

// ── Build Sampler từ soundfont qua IPC ────────────────────────────────────────

async function buildSoundfontSampler(
  onProgress?: (loaded: number, total: number) => void,
): Promise<Tone.Sampler> {
  const audioCtx = Tone.getContext().rawContext as AudioContext;
  const total    = SAMPLE_NOTES.length;
  let   loaded   = 0;

  const results = await Promise.all(
    SAMPLE_NOTES.map(async (note) => {
      try {
        const bytes: number[] | null = await window.electron.fetchSoundfontNote(note);
        if (!bytes) { loaded++; onProgress?.(loaded, total); return { note, buf: null }; }

        const uint8    = new Uint8Array(bytes);
        // slice(0) tạo copy của ArrayBuffer — cần thiết vì decodeAudioData consume buffer
        const audioBuf = await audioCtx.decodeAudioData(uint8.buffer.slice(0));
        loaded++;
        onProgress?.(loaded, total);
        return { note, buf: audioBuf };
      } catch (e) {
        console.warn(`[Soundfont] skip ${note}:`, e);
        loaded++;
        onProgress?.(loaded, total);
        return { note, buf: null };
      }
    }),
  );

  // Tạo Sampler rỗng rồi add buffers thủ công
  const sampler = new Tone.Sampler();
  let   added   = 0;
  results.forEach(({ note, buf }) => {
    if (buf) { (sampler as any).add(note, buf); added++; }
  });
  console.log(`[Soundfont] Sampler ready: ${added}/${total} notes loaded`);

  const vol     = new Tone.Volume(8);
  const limiter = new Tone.Limiter(-1);
  sampler.chain(vol, limiter, Tone.getDestination());

  return sampler;
}

// ── Fallback synth ────────────────────────────────────────────────────────────

function buildFallbackSynth(): Tone.PolySynth {
  const synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.002, decay: 1.0, sustain: 0.1, release: 1.5 },
  });
  synth.maxPolyphony = 24;
  const comp    = new Tone.Compressor({ threshold: -18, ratio: 4 });
  const reverb  = new Tone.Reverb({ decay: 1.5, wet: 0.2 });
  const vol     = new Tone.Volume(12);
  const limiter = new Tone.Limiter(-1);
  synth.chain(comp, reverb, vol, limiter, Tone.getDestination());
  return synth;
}

// ─── Engine ───────────────────────────────────────────────────────────────────

export class PlaybackEngine {
  private instrument: Tone.Sampler | Tone.PolySynth | null = null;
  private music: ParsedMusic | null = null;
  private callbacks: EngineCallbacks;

  private _status: PlaybackStatus = 'idle';
  private _speed: number = 1.0;

  private parts: Tone.Part[]         = [];
  private positionLoop: Tone.Loop | null = null;
  private activeNoteTimers = new Map<number, ReturnType<typeof setTimeout>>();
  private pausedAtSec: number        = 0;

  constructor(callbacks: EngineCallbacks) {
    this.callbacks = callbacks;
  }

  async loadInstrument(
    onProgress?: (loaded: number, total: number) => void,
  ): Promise<void> {
    if (this.instrument) return;
    this._setStatus('loading');
    await Tone.start();

    const hasIPC = typeof window.electron?.fetchSoundfontNote === 'function';
    if (hasIPC) {
      try {
        this.instrument = await buildSoundfontSampler(onProgress);
      } catch (err) {
        console.warn('[Engine] Soundfont failed, fallback synth:', err);
        this.instrument = buildFallbackSynth();
      }
    } else {
      this.instrument = buildFallbackSynth();
    }

    this._setStatus('idle');
  }

  loadMusic(music: ParsedMusic): void {
    this.stop();
    this.music       = music;
    this.pausedAtSec = 0;
    this._setStatus('idle');
  }

  async play(): Promise<void> {
    if (!this.instrument || !this.music) return;
    if (this._status === 'playing') return;

    await Tone.start();

    const music       = this.music;
    const speed       = this._speed;
    const startOffset = this.pausedAtSec;

    const scaledNotes = music.notes.map(n => ({
      ...n,
      startSec:    n.startSec    / speed,
      durationSec: n.durationSec / speed,
    }));

    // Group theo ms (chord)
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
      // FIXED: dùng `time` từ callback parameter (Web Audio scheduled time),
      // KHÔNG dùng Tone.now() hay Date.now() bên trong callback
      (time, { notes }) => {
        const midiNotes = notes.map(n => n.midiNote);
        const noteIdx   = notes[0]?.noteIndex ?? 0;

        // UI update dùng Tone.Draw để sync với render frame, không block audio thread
        Tone.getDraw().schedule(() => {
          callbacks.onNoteOn(notes, notes[0].startBeat, noteIdx);
        }, time);

        // Audio: dùng scheduled `time` trực tiếp — đây là cách đúng
        notes.forEach(n => {
          try {
            instrument.triggerAttackRelease(
              midiToToneName(n.midiNote),
              Math.max(n.durationSec, 0.1),
              time,   // ← scheduled time từ Transport, không phải Tone.now()
              0.85,
            );
          } catch (_) {}
        });

        // note_off: tính delay từ audio context time
        const maxDur     = Math.max(...notes.map(n => n.durationSec));
        const nowAudio   = Tone.getContext().currentTime;
        const delayMs    = Math.max(0, (time - nowAudio + maxDur) * 1000) + 80;

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

    // Position update loop
    this.positionLoop = new Tone.Loop(() => {
      const transportSec = Tone.getTransport().seconds;
      const actualSec    = transportSec * speed + startOffset;
      this.callbacks.onPosition(
        actualSec,
        actualSec * (music.temposBPM[0]?.bpm ?? 120) / 60,
      );
      if (actualSec >= music.totalSec + 0.5) this._onEnd();
    }, '32n');
    this.positionLoop.start(0);

    Tone.getTransport().start();
    this._setStatus('playing');
  }

  pause(): void {
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
    this.activeNoteTimers.forEach(t => clearTimeout(t));
    this.activeNoteTimers.clear();
    this.callbacks.onNoteOff([...Array(128).keys()]);
    this._setStatus('stopped');
  }

  seek(toSec: number): void {
    const wasPlaying = this._status === 'playing';
    if (wasPlaying) this.pause();
    this.pausedAtSec = Math.max(0, Math.min(toSec, this.music?.totalSec ?? 0));
    if (wasPlaying) this.play();
  }

  setSpeed(multiplier: number): void {
    const clamped    = Math.max(0.25, Math.min(2.0, multiplier));
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

  private _setStatus(s: PlaybackStatus): void {
    this._status = s;
    this.callbacks.onStatus(s);
  }

  private _cleanupParts(): void {
    this.parts.forEach(p => { p.stop(); p.dispose(); });
    this.parts = [];
    if (this.positionLoop) {
      this.positionLoop.stop();
      this.positionLoop.dispose();
      this.positionLoop = null;
    }
  }

  private _onEnd(): void {
    this.stop();
    this.callbacks.onEnd();
  }
}
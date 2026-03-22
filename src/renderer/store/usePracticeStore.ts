// src/renderer/store/usePracticeStore.ts
// UPDATED: wire onExpectedChange + onVerdictFlash callbacks
//          verdictFlash tự clear sau timeout

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { PracticeEngine } from '../engine/PracticeEngine';
import type { NoteResult, SessionStats, PracticeMode } from '../types/practice';
import type { ParsedMusic } from '../types/music';
import { EMPTY_STATS } from '../types/practice';

interface VerdictFlash {
  midi: number[];
  verdict: 'correct' | 'wrong' | 'late';
}

interface PracticeStore {
  mode:           PracticeMode;
  isActive:       boolean;
  stats:          SessionStats;
  lastResult:     NoteResult | null;
  sessionEnded:   boolean;
  finalStats:     SessionStats | null;

  // Piano visual state
  expectedMidi:   number[];                              // nốt cần bấm tiếp (highlight mờ)
  verdictFlash:   Map<number, 'correct' | 'wrong' | 'late'>; // flash màu phím

  // Actions
  setMode:        (mode: PracticeMode) => void;
  loadMusic:      (music: ParsedMusic) => void;
  startSession:   () => void;
  stopSession:    () => void;
  resetSession:   () => void;
  onUserKeyPress: (midi: number) => void;
  onNoteReached:  (noteIndex: number) => void;
  onSongEnd:      () => void;
  dismissResult:  () => void;
}

// ── Engine singleton ──────────────────────────────────────────────────────────

let _engine: PracticeEngine | null = null;
const _flashTimers = new Map<number, ReturnType<typeof setTimeout>>();

function ensureEngine(): PracticeEngine {
  if (_engine) return _engine;

  _engine = new PracticeEngine({
    onNoteResult: (result, stats) => {
      usePracticeStore.setState({ stats, lastResult: result });
    },

    onExpectedChange: (midi) => {
      usePracticeStore.setState({ expectedMidi: midi });
    },

    onVerdictFlash: (midi, verdict, clearAfterMs) => {
      // Set flash màu
      usePracticeStore.setState(prev => {
        const next = new Map(prev.verdictFlash);
        midi.forEach(m => next.set(m, verdict));
        return { verdictFlash: next };
      });

      // Clear sau timeout
      midi.forEach(m => {
        const prev = _flashTimers.get(m);
        if (prev) clearTimeout(prev);
        const t = setTimeout(() => {
          usePracticeStore.setState(prev => {
            const next = new Map(prev.verdictFlash);
            next.delete(m);
            return { verdictFlash: next };
          });
          _flashTimers.delete(m);
        }, clearAfterMs);
        _flashTimers.set(m, t);
      });
    },

    onStepAdvance: (nextIdx) => {
      const engine = _engine!;
      usePracticeStore.setState({
        expectedMidi: engine.getExpectedMidiAt(nextIdx),
      });
    },

    onSessionEnd: (stats) => {
      usePracticeStore.setState({
        isActive:    false,
        sessionEnded: true,
        finalStats:  stats,
        expectedMidi: [],
      });
    },
  });

  return _engine;
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const usePracticeStore = create<PracticeStore>()(
  subscribeWithSelector((set, _get) => ({
    mode:         'view',
    isActive:     false,
    stats:        { ...EMPTY_STATS },
    lastResult:   null,
    sessionEnded: false,
    finalStats:   null,
    expectedMidi: [],
    verdictFlash: new Map(),

    setMode: (mode) => {
      ensureEngine().setMode(mode);
      set({ mode });
    },

    loadMusic: (music) => {
      const engine = ensureEngine();
      engine.loadMusic(music);
      set({
        stats:        { ...EMPTY_STATS, totalNotes: music.notes.length },
        lastResult:   null,
        sessionEnded: false,
        finalStats:   null,
        expectedMidi: engine.getExpectedMidiAt(0),
        verdictFlash: new Map(),
      });
    },

    startSession: () => {
      const engine = ensureEngine();
      engine.start();
      set({
        isActive:     true,
        sessionEnded: false,
        stats:        { ...EMPTY_STATS },
        verdictFlash: new Map(),
        expectedMidi: engine.getExpectedMidiAt(0),
      });
    },

    stopSession: () => {
      ensureEngine().stop();
      set({ isActive: false });
    },

    resetSession: () => {
      ensureEngine().reset();
      _flashTimers.forEach(t => clearTimeout(t));
      _flashTimers.clear();
      set({
        isActive:     false,
        stats:        { ...EMPTY_STATS },
        lastResult:   null,
        sessionEnded: false,
        finalStats:   null,
        expectedMidi: [],
        verdictFlash: new Map(),
      });
    },

    onUserKeyPress: (midi) => ensureEngine().onUserKeyPress(midi),

    onNoteReached: (noteIndex) => ensureEngine().onNoteReached(noteIndex),

    onSongEnd: () => ensureEngine().onSongEnd(),

    dismissResult: () => set({ sessionEnded: false, finalStats: null }),
  })),
);

// ── Selectors ─────────────────────────────────────────────────────────────────

export const usePracticeMode    = () => usePracticeStore(s => s.mode);
export const usePracticeActive  = () => usePracticeStore(s => s.isActive);
export const usePracticeStats   = () => usePracticeStore(s => s.stats);
export const useExpectedMidi    = () => usePracticeStore(s => s.expectedMidi);
export const useVerdictFlash    = () => usePracticeStore(s => s.verdictFlash);
export const useSessionEnded    = () => usePracticeStore(s => s.sessionEnded);
export const useFinalStats      = () => usePracticeStore(s => s.finalStats);
export const useLastResult      = () => usePracticeStore(s => s.lastResult);

export const useSetMode         = () => usePracticeStore(s => s.setMode);
export const useStartSession    = () => usePracticeStore(s => s.startSession);
export const useStopSession     = () => usePracticeStore(s => s.stopSession);
export const useResetSession    = () => usePracticeStore(s => s.resetSession);
export const useOnUserKeyPress  = () => usePracticeStore(s => s.onUserKeyPress);
export const useOnNoteReached   = () => usePracticeStore(s => s.onNoteReached);
export const useDismissResult   = () => usePracticeStore(s => s.dismissResult);
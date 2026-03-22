
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { PracticeEngine } from '../engine/PracticeEngine';
import type { NoteResult, SessionStats, PracticeMode } from '../types/practice';
import type { ParsedMusic } from '../types/music';
import { EMPTY_STATS } from '../types/practice';

interface PracticeStore {
  mode:          PracticeMode;
  isActive:      boolean;
  stats:         SessionStats;
  lastResult:    NoteResult | null;
  sessionEnded:  boolean;
  finalStats:    SessionStats | null;
  expectedMidi:  number[];
  verdictFlash:  Map<number, 'correct' | 'wrong' | 'late'>;

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

const _flashTimers = new Map<number, ReturnType<typeof setTimeout>>();

// stepAdvance callback — được set từ bridge sau khi init
// Dùng biến thay vì dynamic import để tránh async delay
let _stepAdvanceFn: ((idx: number) => void) | null = null;
let _setStepModeFn: ((en: boolean) => void) | null  = null;

export function setPracticeStepCallbacks(
  stepAdvance: (idx: number) => void,
  setStepMode:  (en: boolean) => void,
) {
  _stepAdvanceFn = stepAdvance;
  _setStepModeFn = setStepMode;
}

export const practiceEngine = new PracticeEngine({
  onNoteResult: (_r, stats) => {
    usePracticeStore.setState({ stats });
  },
  onExpectedChange: (midi) => {
    usePracticeStore.setState({ expectedMidi: midi });
  },
  onVerdictFlash: (midi, verdict, ms) => {
    usePracticeStore.setState(prev => {
      const m = new Map(prev.verdictFlash);
      midi.forEach(k => m.set(k, verdict));
      return { verdictFlash: m };
    });
    midi.forEach(k => {
      const t = _flashTimers.get(k);
      if (t) clearTimeout(t);
      _flashTimers.set(k, setTimeout(() => {
        usePracticeStore.setState(prev => {
          const m = new Map(prev.verdictFlash);
          m.delete(k);
          return { verdictFlash: m };
        });
        _flashTimers.delete(k);
      }, ms));
    });
  },
  onStepAdvance: (nextGroupIndex) => {
    // SYNC call — không dùng async import
    if (_stepAdvanceFn) {
      _stepAdvanceFn(nextGroupIndex);
    } else {
      console.warn('[PracticeEngine] _stepAdvanceFn not registered yet!');
    }
  },
  onSessionEnd: (stats) => {
    usePracticeStore.setState({
      isActive: false, sessionEnded: true,
      finalStats: stats, expectedMidi: [],
    });
  },
});

export const usePracticeStore = create<PracticeStore>()(
  subscribeWithSelector((set) => ({
    mode:         'view',
    isActive:     false,
    stats:        { ...EMPTY_STATS },
    lastResult:   null,
    sessionEnded: false,
    finalStats:   null,
    expectedMidi: [],
    verdictFlash: new Map(),

    setMode: (mode) => {
      practiceEngine.setMode(mode);
      // SYNC — không dùng async
      if (_setStepModeFn) {
        _setStepModeFn(mode === 'step');
      }
      set({ mode });
    },

    loadMusic: (music) => {
      practiceEngine.loadMusic(music);
      console.log('[PracticeStore] loadMusic OK, groups:', practiceEngine.groupCount);
      set({
        stats:        { ...EMPTY_STATS, totalNotes: practiceEngine.groupCount },
        lastResult:   null, sessionEnded: false, finalStats: null,
        expectedMidi: practiceEngine.getExpectedMidiAt(0),
        verdictFlash: new Map(), isActive: false,
      });
    },

    startSession: () => {
      practiceEngine.start();
      console.log('[PracticeStore] startSession groups:', practiceEngine.groupCount, 'active:', practiceEngine.isActive);
      set({
        isActive:     true,
        sessionEnded: false,
        stats:        { ...EMPTY_STATS, totalNotes: practiceEngine.groupCount },
        verdictFlash: new Map(),
        expectedMidi: practiceEngine.getExpectedMidiAt(0),
      });
    },

    stopSession:  () => { practiceEngine.stop(); set({ isActive: false }); },

    resetSession: () => {
      practiceEngine.stop();
      _flashTimers.forEach(t => clearTimeout(t));
      _flashTimers.clear();
      set({
        isActive: false, stats: { ...EMPTY_STATS }, lastResult: null,
        sessionEnded: false, finalStats: null, expectedMidi: [], verdictFlash: new Map(),
      });
    },

    onUserKeyPress: (midi) => {
      console.log('[Practice] keypress:', midi, 'active:', practiceEngine.isActive, 'groups:', practiceEngine.groupCount);
      practiceEngine.onUserKeyPress(midi);
    },
    onNoteReached: (ni) => practiceEngine.onNoteReached(ni),
    onSongEnd:     ()   => practiceEngine.onSongEnd(),
    dismissResult: ()   => set({ sessionEnded: false, finalStats: null }),
  })),
);

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
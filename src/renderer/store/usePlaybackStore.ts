import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { PlaybackEngine } from '../engine/PlaybackEngine';
import { musicXMLParser } from '../engine/MusicXMLParser';
import type { NoteEvent, ParsedMusic, PlaybackStatus } from '../types/music';

interface PlaybackStore {
  music: ParsedMusic | null;
  rawXML: string | null;
  status: PlaybackStatus;
  currentSec: number;
  currentBeat: number;
  activeNotes: number[];
  currentNoteEvents: NoteEvent[];
  currentNoteIndex: number;
  speed: number;
  instrumentLoaded: boolean;
  instrumentError: string | null;
  soundfontProgress: { loaded: number; total: number } | null;

  loadXML:        (xml: string) => void;
  initInstrument: () => Promise<void>;
  play:           () => void;
  pause:          () => void;
  stop:           () => void;
  seek:           (sec: number) => void;
  setSpeed:       (m: number) => void;
  setStepMode:    (enabled: boolean) => void;
  stepAdvance:    (nextGroupIndex: number) => void;
  destroyEngine:  () => void;
}

let _engine: PlaybackEngine | null = null;

function ensureEngine(): PlaybackEngine {
  if (_engine) return _engine;

  _engine = new PlaybackEngine({
    onNoteOn: (notes, _beat, noteIndex) => {
      usePlaybackStore.setState({
        activeNotes:       notes.map(n => n.midiNote),
        currentNoteEvents: notes,
        currentNoteIndex:  noteIndex,
      });
    },
    onNoteOff: (midiNotes) => {
      usePlaybackStore.setState(prev => ({
        activeNotes: prev.activeNotes.filter(m => !midiNotes.includes(m)),
      }));
    },
    onPosition: (sec, beat) => {
      usePlaybackStore.setState({ currentSec: sec, currentBeat: beat });
    },
    onStatus: (status) => {
      usePlaybackStore.setState({ status });
    },
    onEnd: () => {
      usePlaybackStore.setState({
        status: 'stopped', currentSec: 0, currentBeat: 0,
        activeNotes: [], currentNoteEvents: [], currentNoteIndex: -1,
      });
    },
  });

  return _engine;
}

export const usePlaybackStore = create<PlaybackStore>()(
  subscribeWithSelector((set) => ({
    music: null, rawXML: null,
    status: 'idle', currentSec: 0, currentBeat: 0,
    activeNotes: [], currentNoteEvents: [], currentNoteIndex: -1,
    speed: 1.0, instrumentLoaded: false, instrumentError: null, soundfontProgress: null,

    loadXML: (xml) => {
      try {
        const music = musicXMLParser.parse(xml);
        ensureEngine().loadMusic(music);
        set({
          music, rawXML: xml, status: 'idle',
          currentSec: 0, currentBeat: 0,
          activeNotes: [], currentNoteEvents: [], currentNoteIndex: -1,
        });
        // Bridge sẽ tự detect qua subscribe
      } catch (err) { console.error('[PlaybackStore] loadXML:', err); }
    },

    initInstrument: async () => {
      try {
        set({ soundfontProgress: { loaded: 0, total: 14 } });
        await ensureEngine().loadInstrument((l, t) =>
          set({ soundfontProgress: { loaded: l, total: t } }));
        set({ instrumentLoaded: true, instrumentError: null, soundfontProgress: null });
      } catch (err: any) {
        set({ instrumentError: err?.message ?? 'Lỗi soundfont', soundfontProgress: null });
      }
    },

    play:        () => ensureEngine().play(),
    pause:       () => ensureEngine().pause(),
    stop:        () => {
      ensureEngine().stop();
      set({ currentSec: 0, currentBeat: 0, activeNotes: [], currentNoteEvents: [], currentNoteIndex: -1 });
    },
    seek:        (sec) => { ensureEngine().seek(sec); set({ currentSec: sec }); },
    setSpeed:    (m)   => { ensureEngine().setSpeed(m); set({ speed: m }); },
    setStepMode: (en)  => ensureEngine().setStepMode(en),
    stepAdvance: (idx) => ensureEngine().stepAdvance(idx),
    destroyEngine: () => { if (_engine) { _engine.destroy(); _engine = null; } },
  })),
);

export const useActiveNotes       = () => usePlaybackStore(s => s.activeNotes);
export const usePlaybackStatus    = () => usePlaybackStore(s => s.status);
export const useCurrentNoteIndex  = () => usePlaybackStore(s => s.currentNoteIndex);
export const useCurrentSec        = () => usePlaybackStore(s => s.currentSec);
export const usePlaybackDuration  = () => usePlaybackStore(s => s.music?.totalSec ?? 0);
export const useInstrumentReady   = () => usePlaybackStore(s => s.instrumentLoaded);
export const useInstrumentError   = () => usePlaybackStore(s => s.instrumentError);
export const usePlaybackSpeed     = () => usePlaybackStore(s => s.speed);
export const useMusicTitle        = () => usePlaybackStore(s => s.music?.title ?? '');
export const useSoundfontProgress = () => usePlaybackStore(s => s.soundfontProgress);

export const usePlayAction        = () => usePlaybackStore(s => s.play);
export const usePauseAction       = () => usePlaybackStore(s => s.pause);
export const useStopAction        = () => usePlaybackStore(s => s.stop);
export const useSeekAction        = () => usePlaybackStore(s => s.seek);
export const useSetSpeedAction    = () => usePlaybackStore(s => s.setSpeed);
export const useInitInstrument    = () => usePlaybackStore(s => s.initInstrument);
export const useLoadXML           = () => usePlaybackStore(s => s.loadXML);
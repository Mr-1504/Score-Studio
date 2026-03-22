import { create } from 'zustand';
import { LoopEngine, type LoopRegion } from '../engine/LoopEngine';

interface LoopStore {
  enabled:   boolean;
  startSec:  number;
  endSec:    number;

  setRegion: (start: number, end: number) => void;
  enable:    () => void;
  disable:   () => void;
  toggle:    () => void;
  clear:     () => void;
  setTotal:  (sec: number) => void;
}

export const loopEngine = new LoopEngine((r: LoopRegion) => {
  useLoopStore.setState({
    enabled:  r.enabled,
    startSec: r.startSec,
    endSec:   r.endSec,
  });
});

export const useLoopStore = create<LoopStore>()((_set) => ({
  enabled:  false,
  startSec: 0,
  endSec:   0,

  setRegion: (start, end) => loopEngine.setRegion(start, end),
  enable:    ()            => loopEngine.enable(),
  disable:   ()            => loopEngine.disable(),
  toggle:    ()            => loopEngine.toggle(),
  clear:     ()            => loopEngine.clear(),
  setTotal:  (sec)         => loopEngine.setTotalDuration(sec),
}));

export const useLoopEnabled  = () => useLoopStore(s => s.enabled);
export const useLoopStartSec = () => useLoopStore(s => s.startSec);
export const useLoopEndSec   = () => useLoopStore(s => s.endSec);
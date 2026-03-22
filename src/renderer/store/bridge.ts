import { usePlaybackStore } from './usePlaybackStore';
import { usePracticeStore, practiceEngine, setPracticeStepCallbacks } from './usePracticeStore';

// ── Đăng ký sync callbacks ngay khi bridge load ───────────────────────────────
setPracticeStepCallbacks(
  // stepAdvance: PracticeEngine gọi khi user bấm đúng → PlaybackEngine phát note tiếp
  (nextGroupIndex: number) => {
    console.log('[Bridge] stepAdvance →', nextGroupIndex);
    usePlaybackStore.getState().stepAdvance(nextGroupIndex);
  },
  // setStepMode: khi user chuyển mode
  (enabled: boolean) => {
    console.log('[Bridge] setStepMode →', enabled);
    usePlaybackStore.getState().setStepMode(enabled);
  },
);

// ── Subscribe: music thay đổi → load vào PracticeEngine ──────────────────────
usePlaybackStore.subscribe(
  s => s.music,
  (music) => {
    if (!music) return;
    console.log('[Bridge] music loaded, notes:', music.notes.length);
    usePracticeStore.getState().loadMusic(music);
  },
);

// ── Subscribe: note phát → notify PracticeEngine ─────────────────────────────
usePlaybackStore.subscribe(
  s => s.currentNoteIndex,
  (noteIndex) => {
    if (noteIndex < 0) return;
    practiceEngine.onNoteReached(noteIndex);  // gọi thẳng engine, không qua store dispatch
  },
);

// ── Subscribe: bài kết thúc → kết thúc session ───────────────────────────────
usePlaybackStore.subscribe(
  s => s.status,
  (status, prevStatus) => {
    if (status === 'stopped' && prevStatus === 'playing') {
      practiceEngine.onSongEnd();
    }
  },
);

// ── Helpers export cho App.tsx ────────────────────────────────────────────────
export function bridgePlay() {
  const mode = usePracticeStore.getState().mode;
  if (mode !== 'view') {
    console.log('[Bridge] auto-start session, mode:', mode);
    usePracticeStore.getState().startSession();
  }
  usePlaybackStore.getState().play();
}

export function bridgeStop() {
  usePracticeStore.getState().stopSession();
  usePlaybackStore.getState().stop();
}
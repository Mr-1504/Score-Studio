// src/renderer/components/ModeToggle.tsx
// Toggle giữa View / Follow / Step mode

import { usePracticeMode, useSetMode, usePracticeActive, useStopSession } from '../store/usePracticeStore';
import { useStopAction } from '../store/usePlaybackStore';
import type { PracticeMode } from '../types/practice';
import './ModeToggle.css';

const MODES: { id: PracticeMode; label: string; desc: string }[] = [
  { id: 'view',   label: 'View',   desc: 'Xem & nghe' },
  { id: 'follow', label: 'Follow', desc: 'Đánh theo nhạc' },
  { id: 'step',   label: 'Step',   desc: 'Tự tiến từng nốt' },
];

export default function ModeToggle() {
  const mode       = usePracticeMode();
  const setMode    = useSetMode();
  const isActive   = usePracticeActive();
  const stopSession = useStopSession();
  const stopPlay   = useStopAction();

  const handleChange = (newMode: PracticeMode) => {
    if (newMode === mode) return;
    // Dừng session và playback khi đổi mode
    if (isActive) stopSession();
    stopPlay();
    setMode(newMode);
  };

  return (
    <div className="mode-toggle">
      {MODES.map(m => (
        <button
          key={m.id}
          className={`mt-btn${mode === m.id ? ' active' : ''}`}
          onClick={() => handleChange(m.id)}
          title={m.desc}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
// src/renderer/components/ScorePanel.tsx
// Panel bên phải hiển thị score, accuracy, combo real-time

import { usePracticeStats, usePracticeMode, usePracticeActive,
         useStartSession, useStopSession, useResetSession } from '../store/usePracticeStore';
import { usePlayAction, useStopAction } from '../store/usePlaybackStore';
import './ScorePanel.css';

function AccuracyRing({ pct }: { pct: number }) {
  const r   = 28;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const color = pct >= 80 ? '#4ade80' : pct >= 50 ? '#fbbf24' : '#f87171';

  return (
    <svg width="70" height="70" viewBox="0 0 70 70">
      <circle cx="35" cy="35" r={r} fill="none" stroke="#27272a" strokeWidth="5"/>
      <circle
        cx="35" cy="35" r={r}
        fill="none"
        stroke={color}
        strokeWidth="5"
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform="rotate(-90 35 35)"
        style={{ transition: 'stroke-dasharray 0.3s ease' }}
      />
      <text
        x="35" y="39"
        textAnchor="middle"
        fontSize="13"
        fontWeight="600"
        fill={color}
      >
        {pct}%
      </text>
    </svg>
  );
}

export default function ScorePanel() {
  const mode        = usePracticeMode();
  const isActive    = usePracticeActive();
  const stats       = usePracticeStats();
  const startSession = useStartSession();
  const stopSession  = useStopSession();
  const resetSession = useResetSession();
  const play        = usePlayAction();
  const stop        = useStopAction();

  if (mode === 'view') return null;

  const handleStart = () => {
    resetSession();
    startSession();
    play();
  };

  const handleStop = () => {
    stopSession();
    stop();
  };

  const handleReset = () => {
    resetSession();
    stop();
  };

  return (
    <div className="score-panel">
      <div className="sp-header">
        <span className="sp-mode-badge">
          {mode === 'follow' ? 'Follow' : 'Step'}
        </span>
      </div>

      {/* Accuracy ring */}
      <div className="sp-accuracy">
        <AccuracyRing pct={stats.accuracy} />
        <span className="sp-acc-label">Accuracy</span>
      </div>

      {/* Score */}
      <div className="sp-score">
        <span className="sp-score-val">{stats.score.toLocaleString()}</span>
        <span className="sp-score-label">Score</span>
      </div>

      {/* Combo */}
      <div className={`sp-combo${stats.currentCombo >= 10 ? ' hot' : ''}`}>
        <span className="sp-combo-val">×{stats.currentCombo}</span>
        <span className="sp-combo-label">Combo</span>
      </div>

      {/* Note breakdown */}
      <div className="sp-breakdown">
        <div className="sp-stat sp-correct">
          <span className="sp-stat-val">{stats.correct}</span>
          <span className="sp-stat-label">Correct</span>
        </div>
        <div className="sp-stat sp-late">
          <span className="sp-stat-val">{stats.late}</span>
          <span className="sp-stat-label">Late</span>
        </div>
        <div className="sp-stat sp-wrong">
          <span className="sp-stat-val">{stats.wrong}</span>
          <span className="sp-stat-label">Wrong</span>
        </div>
      </div>

      {/* Max combo */}
      <div className="sp-max-combo">
        Best combo: <strong>{stats.maxCombo}</strong>
      </div>

      {/* Controls */}
      <div className="sp-controls">
        {!isActive ? (
          <button className="sp-btn sp-btn-start" onClick={handleStart}>
            Start
          </button>
        ) : (
          <button className="sp-btn sp-btn-stop" onClick={handleStop}>
            Stop
          </button>
        )}
        <button className="sp-btn sp-btn-reset" onClick={handleReset}>
          Reset
        </button>
      </div>
    </div>
  );
}
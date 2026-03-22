// src/renderer/components/ResultModal.tsx
// Modal hiển thị kết quả cuối bài

import { useSessionEnded, useFinalStats, useDismissResult, useResetSession } from '../store/usePracticeStore';
import { useStopAction } from '../store/usePlaybackStore';
import './ResultModal.css';

export default function ResultModal() {
  const sessionEnded  = useSessionEnded();
  const finalStats    = useFinalStats();
  const dismissResult = useDismissResult();
  const resetSession  = useResetSession();
  const stop          = useStopAction();

  if (!sessionEnded || !finalStats) return null;

  const handleClose = () => {
    dismissResult();
  };

  const handlePlayAgain = () => {
    resetSession();
    stop();
    dismissResult();
  };

  const acc     = finalStats.accuracy;
  const grade   = acc >= 95 ? 'S' : acc >= 85 ? 'A' : acc >= 70 ? 'B' : acc >= 50 ? 'C' : 'D';
  const gradeColor = acc >= 95 ? '#fbbf24' : acc >= 85 ? '#4ade80' : acc >= 70 ? '#60a5fa' : acc >= 50 ? '#a78bfa' : '#f87171';

  return (
    <div className="rm-overlay" onClick={handleClose}>
      <div className="rm-modal" onClick={e => e.stopPropagation()}>
        {/* Grade */}
        <div className="rm-grade" style={{ color: gradeColor }}>{grade}</div>
        <div className="rm-title">Session Complete</div>

        {/* Stats grid */}
        <div className="rm-stats">
          <div className="rm-stat">
            <span className="rm-stat-val" style={{ color: '#e4e4e7' }}>
              {finalStats.score.toLocaleString()}
            </span>
            <span className="rm-stat-label">Score</span>
          </div>
          <div className="rm-stat">
            <span className="rm-stat-val" style={{ color: acc >= 80 ? '#4ade80' : '#fbbf24' }}>
              {acc}%
            </span>
            <span className="rm-stat-label">Accuracy</span>
          </div>
          <div className="rm-stat">
            <span className="rm-stat-val" style={{ color: '#6366f1' }}>
              ×{finalStats.maxCombo}
            </span>
            <span className="rm-stat-label">Best Combo</span>
          </div>
          <div className="rm-stat">
            <span className="rm-stat-val" style={{ color: '#a1a1aa' }}>
              {finalStats.avgTimingMs > 0 ? `+${finalStats.avgTimingMs}` : finalStats.avgTimingMs}ms
            </span>
            <span className="rm-stat-label">Avg Timing</span>
          </div>
        </div>

        {/* Note breakdown bar */}
        <div className="rm-breakdown">
          {finalStats.totalNotes > 0 && (
            <div className="rm-bar">
              <div
                className="rm-bar-correct"
                style={{ width: `${(finalStats.correct / finalStats.totalNotes) * 100}%` }}
              />
              <div
                className="rm-bar-late"
                style={{ width: `${(finalStats.late / finalStats.totalNotes) * 100}%` }}
              />
              <div
                className="rm-bar-wrong"
                style={{ width: `${(finalStats.wrong / finalStats.totalNotes) * 100}%` }}
              />
            </div>
          )}
          <div className="rm-bar-legend">
            <span className="rm-legend-correct">{finalStats.correct} correct</span>
            <span className="rm-legend-late">{finalStats.late} late</span>
            <span className="rm-legend-wrong">{finalStats.wrong} wrong</span>
          </div>
        </div>

        {/* Actions */}
        <div className="rm-actions">
          <button className="rm-btn rm-btn-again" onClick={handlePlayAgain}>
            Play Again
          </button>
          <button className="rm-btn rm-btn-close" onClick={handleClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
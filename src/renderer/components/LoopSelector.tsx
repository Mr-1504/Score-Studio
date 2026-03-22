import { useRef, useCallback } from 'react';
import { useLoopStore, useLoopEnabled, useLoopStartSec, useLoopEndSec } from '../store/useLoopStore';
import { useCurrentSec, usePlaybackDuration } from '../store/usePlaybackStore';
import './LoopSelector.css';

interface LoopSelectorProps {
  onSeek?: (sec: number) => void;
}

export default function LoopSelector({ onSeek }: LoopSelectorProps) {
  const duration  = usePlaybackDuration();
  const currentSec = useCurrentSec();
  const loopEnabled = useLoopEnabled();
  const loopStart   = useLoopStartSec();
  const loopEnd     = useLoopEndSec();

  const { setRegion, toggle, clear } = useLoopStore.getState();

  const barRef    = useRef<HTMLDivElement>(null);
  const dragging  = useRef<'start' | 'end' | 'region' | 'new' | null>(null);
  const dragStart = useRef(0);   // pixel x at drag start
  const regionAtDragStart = useRef({ start: 0, end: 0 });

  const pctToSec  = (pct: number) => pct * duration;
  const secToPct  = (sec: number) => duration > 0 ? (sec / duration) * 100 : 0;
  const xToPct    = (x: number) => {
    if (!barRef.current) return 0;
    const rect = barRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (x - rect.left) / rect.width));
  };

  // ── Drag handlers ──────────────────────────────────────────────────────────

  const onMouseDown = useCallback((e: React.MouseEvent, type: 'start' | 'end' | 'region' | 'new') => {
    e.preventDefault();
    e.stopPropagation();
    dragging.current = type;
    dragStart.current = e.clientX;
    regionAtDragStart.current = { start: loopStart, end: loopEnd };

    const onMove = (me: MouseEvent) => {
      if (!dragging.current || !barRef.current) return;
      const pct = xToPct(me.clientX);
      const sec = pctToSec(pct);

      if (dragging.current === 'new') {
        const startSec = pctToSec(xToPct(dragStart.current));
        if (sec > startSec) setRegion(startSec, sec);
        else setRegion(sec, startSec);
      } else if (dragging.current === 'start') {
        setRegion(Math.min(sec, loopEnd - 0.5), loopEnd);
      } else if (dragging.current === 'end') {
        setRegion(loopStart, Math.max(sec, loopStart + 0.5));
      } else if (dragging.current === 'region') {
        const dx = me.clientX - dragStart.current;
        const rect = barRef.current.getBoundingClientRect();
        const dSec = (dx / rect.width) * duration;
        const { start, end } = regionAtDragStart.current;
        const newStart = Math.max(0, Math.min(start + dSec, duration - (end - start)));
        setRegion(newStart, newStart + (end - start));
      }
    };

    const onUp = () => {
      dragging.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [loopStart, loopEnd, duration, setRegion]);

  // Click trên thanh → seek
  const handleBarClick = (e: React.MouseEvent) => {
    if (dragging.current) return;
    const sec = pctToSec(xToPct(e.clientX));
    onSeek?.(sec);
  };

  // Double click → tạo loop region mới
  const handleBarDblClick = (e: React.MouseEvent) => {
    e.preventDefault();
    onMouseDown(e as any, 'new');
  };

  const startPct  = secToPct(loopStart);
  const endPct    = secToPct(loopEnd);
  const curPct    = secToPct(currentSec);
  const hasRegion = loopEnabled && loopEnd > loopStart;

  return (
    <div className="loop-selector">
      {/* Timeline bar */}
      <div
        ref={barRef}
        className="ls-bar"
        onClick={handleBarClick}
        onDoubleClick={handleBarDblClick}
      >
        {/* Progress */}
        <div className="ls-progress" style={{ width: `${curPct}%` }} />

        {/* Loop region */}
        {hasRegion && (
          <>
            <div
              className={`ls-region${loopEnabled ? ' active' : ''}`}
              style={{ left: `${startPct}%`, width: `${endPct - startPct}%` }}
              onMouseDown={e => onMouseDown(e, 'region')}
            />
            {/* Start handle */}
            <div
              className="ls-handle ls-handle-start"
              style={{ left: `${startPct}%` }}
              onMouseDown={e => onMouseDown(e, 'start')}
            />
            {/* End handle */}
            <div
              className="ls-handle ls-handle-end"
              style={{ left: `${endPct}%` }}
              onMouseDown={e => onMouseDown(e, 'end')}
            />
          </>
        )}

        {/* Playhead */}
        <div className="ls-playhead" style={{ left: `${curPct}%` }} />
      </div>

      {/* Loop controls */}
      <div className="ls-controls">
        <button
          className={`ls-loop-btn${loopEnabled ? ' active' : ''}`}
          onClick={toggle}
          title={loopEnabled ? 'Tắt loop' : 'Bật loop'}
          disabled={!hasRegion && !loopEnabled}
        >
          {/* Loop icon */}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="17 1 21 5 17 9"/>
            <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
            <polyline points="7 23 3 19 7 15"/>
            <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
          </svg>
        </button>
        {hasRegion && (
          <span className="ls-region-label">
            {loopStart.toFixed(1)}s – {loopEnd.toFixed(1)}s
          </span>
        )}
        {hasRegion && (
          <button className="ls-clear-btn" onClick={clear} title="Xóa loop">
            ×
          </button>
        )}
        {!hasRegion && (
          <span className="ls-hint">Double-click để chọn đoạn loop</span>
        )}
      </div>
    </div>
  );
}
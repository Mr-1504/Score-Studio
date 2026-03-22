// src/renderer/components/PlaybackBar.tsx
// UPDATED: hiện progress bar khi load soundfont

import { useEffect, useRef } from 'react';
import {
  usePlaybackStatus,
  useCurrentSec,
  usePlaybackDuration,
  useInstrumentReady,
  useInstrumentError,
  useMusicTitle,
  usePlaybackSpeed,
  useSoundfontProgress,
  usePlayAction,
  usePauseAction,
  useStopAction,
  useSeekAction,
  useSetSpeedAction,
  useInitInstrument,
} from '../store/usePlaybackStore';
import './PlaybackBar.css';

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function PlaybackBar() {
  const status           = usePlaybackStatus();
  const currentSec       = useCurrentSec();
  const duration         = usePlaybackDuration();
  const instrumentLoaded = useInstrumentReady();
  const instrumentError  = useInstrumentError();
  const title            = useMusicTitle();
  const speed            = usePlaybackSpeed();
  const sfProgress       = useSoundfontProgress();

  const play           = usePlayAction();
  const pause          = usePauseAction();
  const stop           = useStopAction();
  const seek           = useSeekAction();
  const setSpeed       = useSetSpeedAction();
  const initInstrument = useInitInstrument();

  const initCalled = useRef(false);
  useEffect(() => {
    if (!initCalled.current) {
      initCalled.current = true;
      initInstrument();
    }
  }, []); // eslint-disable-line

  const isPlaying    = status === 'playing';
  const isLoading    = status === 'loading' || sfProgress !== null;
  const hasMusic     = duration > 0;
  const canPlay      = instrumentLoaded && hasMusic && !isLoading;
  const progress     = duration > 0 ? Math.min((currentSec / duration) * 100, 100) : 0;
  const sfPct        = sfProgress ? Math.round((sfProgress.loaded / sfProgress.total) * 100) : 0;

  return (
    <div className="playback-bar">
      {/* Left */}
      <div className="pb-track-info">
        {title && <span className="pb-title">{title}</span>}

        {/* Soundfont loading progress */}
        {sfProgress && (
          <div className="pb-sf-progress">
            <div className="pb-sf-bar">
              <div className="pb-sf-fill" style={{ width: `${sfPct}%` }} />
            </div>
            <span className="pb-sf-label">
              Loading piano sounds… {sfProgress.loaded}/{sfProgress.total}
            </span>
          </div>
        )}

        {instrumentError && <span className="pb-error">⚠ {instrumentError}</span>}
      </div>

      {/* Center */}
      <div className="pb-center">
        <div className="pb-controls">
          <button
            className="pb-btn pb-stop"
            onClick={stop}
            disabled={status === 'idle' || isLoading}
            title="Stop"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <rect x="2" y="2" width="10" height="10" rx="1"/>
            </svg>
          </button>

          <button
            className={`pb-btn pb-play${isPlaying ? ' playing' : ''}`}
            onClick={() => isPlaying ? pause() : play()}
            disabled={!canPlay}
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isLoading ? (
              <span className="pb-spinner" />
            ) : isPlaying ? (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <rect x="3" y="2" width="4" height="12" rx="1"/>
                <rect x="9" y="2" width="4" height="12" rx="1"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4 2.5L13 8L4 13.5Z"/>
              </svg>
            )}
          </button>
        </div>

        <div className="pb-timeline">
          <span className="pb-time">{fmt(currentSec)}</span>
          <div className="pb-slider-wrap">
            <div className="pb-progress-fill" style={{ width: `${progress}%` }} />
            <input
              type="range" className="pb-slider"
              min={0} max={duration || 100} step={0.1} value={currentSec}
              onChange={e => seek(parseFloat(e.target.value))}
              disabled={!hasMusic}
            />
          </div>
          <span className="pb-time">{fmt(duration)}</span>
        </div>
      </div>

      {/* Right */}
      <div className="pb-right">
        <label className="pb-speed-label">
          Speed <span className="pb-speed-value">{speed.toFixed(2)}x</span>
        </label>
        <input
          type="range" className="pb-speed-slider"
          min={0.25} max={1.5} step={0.05} value={speed}
          onChange={e => setSpeed(parseFloat(e.target.value))}
        />
        <div className="pb-speed-presets">
          {[0.5, 0.75, 1.0, 1.25, 1.5].map(s => (
            <button
              key={s}
              className={`pb-preset${speed === s ? ' active' : ''}`}
              onClick={() => setSpeed(s)}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
import { useEffect, useRef } from 'react';
import {
  usePlaybackStatus, useCurrentSec, usePlaybackDuration,
  useInstrumentReady, useInstrumentError, useMusicTitle,
  usePlaybackSpeed, useSoundfontProgress,
  usePauseAction, useStopAction, useSeekAction,
  useSetSpeedAction, useInitInstrument,
} from '../store/usePlaybackStore';
import { useLoopStore, useLoopEnabled, useLoopStartSec, useLoopEndSec, loopEngine } from '../store/useLoopStore';
import LoopSelector from './LoopSelector';
import './PlaybackBar.css';

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface PlaybackBarProps {
  onPlay?: () => void;
}

export default function PlaybackBar({ onPlay }: PlaybackBarProps = {}) {
  const status           = usePlaybackStatus();
  const currentSec       = useCurrentSec();
  const duration         = usePlaybackDuration();
  const instrumentLoaded = useInstrumentReady();
  const instrumentError  = useInstrumentError();
  const title            = useMusicTitle();
  const speed            = usePlaybackSpeed();
  const sfProgress       = useSoundfontProgress();

  const pause          = usePauseAction();
  const stop           = useStopAction();
  const seek           = useSeekAction();
  const setSpeed       = useSetSpeedAction();
  const initInstrument = useInitInstrument();

  // Loop: sync total duration vào LoopEngine
  const setLoopTotal = useLoopStore(s => s.setTotal);
  const loopEnabled  = useLoopEnabled();
  const loopStart    = useLoopStartSec();

  useEffect(() => {
    if (duration > 0) setLoopTotal(duration);
  }, [duration, setLoopTotal]);

  // Loop: khi position vượt loopEnd → seek về loopStart
  useEffect(() => {
    if (!loopEnabled) return;
    if (loopEngine.shouldLoop(currentSec)) {
      seek(loopStart);
    }
  }, [currentSec, loopEnabled, loopStart, seek]);

  const initCalled = useRef(false);
  useEffect(() => {
    if (!initCalled.current) {
      initCalled.current = true;
      initInstrument();
    }
  }, []); // eslint-disable-line

  const isPlaying = status === 'playing';
  const isLoading = status === 'loading' || sfProgress !== null;
  const hasMusic  = duration > 0;
  const canPlay   = instrumentLoaded && hasMusic && !isLoading;

  return (
    <div className="playback-bar">
      {/* Left: track info */}
      <div className="pb-track-info">
        {title && <span className="pb-title">{title}</span>}
        {sfProgress && (
          <div className="pb-sf-progress">
            <div className="pb-sf-bar">
              <div className="pb-sf-fill" style={{ width: `${Math.round(sfProgress.loaded / sfProgress.total * 100)}%` }} />
            </div>
            <span className="pb-sf-label">Loading sounds… {sfProgress.loaded}/{sfProgress.total}</span>
          </div>
        )}
        {instrumentError && <span className="pb-error">⚠ {instrumentError}</span>}
      </div>

      {/* Center: controls + loop timeline */}
      <div className="pb-center">
        <div className="pb-top-row">
          <div className="pb-controls">
            <button className="pb-btn pb-stop" onClick={stop}
              disabled={status === 'idle' || isLoading} title="Stop">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                <rect x="2" y="2" width="10" height="10" rx="1"/>
              </svg>
            </button>

            <button
              className={`pb-btn pb-play${isPlaying ? ' playing' : ''}`}
              onClick={() => isPlaying ? pause() : (onPlay ? onPlay() : undefined)}
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

          <span className="pb-time">{fmt(currentSec)}</span>
          <span className="pb-time-sep">/</span>
          <span className="pb-time pb-time-total">{fmt(duration)}</span>
        </div>

        {/* Loop selector (timeline với drag region) */}
        <LoopSelector onSeek={seek} />
      </div>

      {/* Right: speed */}
      <div className="pb-right">
        <label className="pb-speed-label">
          Speed <span className="pb-speed-value">{speed.toFixed(2)}x</span>
        </label>
        <input type="range" className="pb-speed-slider"
          min={0.25} max={1.5} step={0.05} value={speed}
          onChange={e => setSpeed(parseFloat(e.target.value))}
        />
        <div className="pb-speed-presets">
          {[0.5, 0.75, 1.0, 1.25, 1.5].map(s => (
            <button key={s}
              className={`pb-preset${speed === s ? ' active' : ''}`}
              onClick={() => setSpeed(s)}
            >{s}x</button>
          ))}
        </div>
      </div>
    </div>
  );
}
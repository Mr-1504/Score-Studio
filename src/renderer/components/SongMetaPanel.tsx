import { useMusic } from '../store/usePlaybackStore';
import { useLibraryStore } from '../store/useLibraryStore';
import { useShallow } from 'zustand/react/shallow';
import './SongMetaPanel.css';

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function difficultyLabel(noteCount: number): { label: string; color: string } {
  if (noteCount < 50)  return { label: 'Dễ',       color: '#34c759' };
  if (noteCount < 120) return { label: 'Trung bình', color: '#ff9f0a' };
  if (noteCount < 250) return { label: 'Khó',       color: '#ff6b30' };
  return                      { label: 'Rất khó',   color: '#ff453a' };
}

function sharpFlatDisplay(fifths: number): string {
  if (fifths === 0) return '♮ (không dấu)';
  if (fifths > 0)   return `${fifths}♯`;
  return `${Math.abs(fifths)}♭`;
}

export default function SongMetaPanel() {
  const music        = useMusic();
  const activeSongId = useLibraryStore(s => s.activeSongId);
  const activeSong   = useLibraryStore(s => s.songs.find(s => s.id === activeSongId) ?? null);
  const sessions     = useLibraryStore(
    useShallow(s => s.sessions.filter(sess => sess.songId === activeSongId))
  );

  if (!music) return null;

  // Ưu tiên tên từ Library (user có thể đã sửa), fallback về parsed XML
  const title    = activeSong?.title    || music.title    || 'Untitled';
  const composer = activeSong?.composer || music.composer || '';
  const bpm      = music.temposBPM[0]?.bpm ?? 120;
  const timeSig  = music.timeSignatures[0];
  const keySig   = music.keySignatures?.[0];
  const noteCount = music.notes.length;
  const diff     = difficultyLabel(noteCount);
  const bestSess = sessions.length
    ? sessions.reduce((b, s) => s.stats.score > b.stats.score ? s : b)
    : null;

  return (
    <div className="song-meta">
      {/* Title + composer */}
      {(title || composer) && (
        <div className="sm-header">
          {title    && <div className="sm-title">{title}</div>}
          {composer && <div className="sm-composer">{composer}</div>}
        </div>
      )}

      {/* Stats grid */}
      <div className="sm-grid">
        <div className="sm-stat">
          <span className="sm-val">{Math.round(bpm)}</span>
          <span className="sm-label">BPM</span>
        </div>

        {timeSig && (
          <div className="sm-stat">
            <span className="sm-val">{timeSig.numerator}/{timeSig.denominator}</span>
            <span className="sm-label">Nhịp</span>
          </div>
        )}

        <div className="sm-stat">
          <span className="sm-val">{noteCount}</span>
          <span className="sm-label">Nốt</span>
        </div>

        <div className="sm-stat">
          <span className="sm-val">{formatTime(music.totalSec)}</span>
          <span className="sm-label">Thời lượng</span>
        </div>
      </div>

      {/* Key + difficulty */}
      <div className="sm-tags">
        {keySig && (
          <span className="sm-tag sm-tag-key">
            🎵 {keySig.label} <span className="sm-fifths">({sharpFlatDisplay(keySig.fifths)})</span>
          </span>
        )}
        <span className="sm-tag" style={{ color: diff.color, borderColor: diff.color + '55', background: diff.color + '18' }}>
          {diff.label}
        </span>
      </div>

      {/* Best score */}
      {bestSess && (
        <div className="sm-best">
          <span className="sm-best-label">Kỷ lục</span>
          <span className="sm-best-val">
            {bestSess.stats.accuracy}%
            <span className="sm-best-score"> · {bestSess.stats.score.toLocaleString()}đ</span>
          </span>
        </div>
      )}
    </div>
  );
}
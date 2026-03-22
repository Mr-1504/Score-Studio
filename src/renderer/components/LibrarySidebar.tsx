import { useState, useRef, useEffect } from 'react';
import {
  useLibraryStore, useSongs, useActiveSongId,
  type Song, type PracticeSession,
} from '../store/useLibraryStore';
import './LibrarySidebar.css';

interface LibrarySidebarProps {
  onOpenSong: (song: Song) => void;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

function BestBadge({ session }: { session: PracticeSession | null }) {
  if (!session) return <span className="ls-no-history">Chưa luyện</span>;
  const acc = session.stats.accuracy;
  const color = acc >= 85 ? '#34c759' : acc >= 60 ? '#ff9f0a' : '#ff453a';
  return <span className="ls-best" style={{ color }}>{acc}% · {session.stats.score.toLocaleString()}đ</span>;
}

// ── Inline editable text field ────────────────────────────────────────────────
function InlineEdit({
  value, placeholder, className, onCommit,
}: {
  value: string;
  placeholder: string;
  className: string;
  onCommit: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) onCommit(trimmed);
    else setDraft(value); // revert nếu rỗng hoặc không đổi
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        className={`${className} ls-inline-input`}
        value={draft}
        placeholder={placeholder}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          if (e.key === 'Escape') { setEditing(false); setDraft(value); }
        }}
        onClick={e => e.stopPropagation()}
      />
    );
  }

  return (
    <span
      className={`${className} ls-editable`}
      title="Click để sửa tên"
      onClick={e => { e.stopPropagation(); setDraft(value); setEditing(true); }}
    >
      {value || <span className="ls-placeholder">{placeholder}</span>}
      <span className="ls-edit-icon">✎</span>
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function LibrarySidebar({ onOpenSong }: LibrarySidebarProps) {
  const songs        = useSongs();
  const activeSongId = useActiveSongId();
  const { removeSong, updateSong, getBestSession, getSessionsForSong } = useLibraryStore.getState();

  const [expandedId,    setExpandedId]    = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirmDelete === id) {
      removeSong(id);
      setConfirmDelete(null);
    } else {
      setConfirmDelete(id);
      setTimeout(() => setConfirmDelete(null), 3000);
    }
  };

  if (!songs.length) {
    return (
      <div className="ls-empty">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
        </svg>
        <p>Chưa có bài nào</p>
        <span>Convert ảnh sheet để thêm</span>
      </div>
    );
  }

  return (
    <div className="ls-list">
      {songs.map(song => {
        const best       = getBestSession(song.id);
        const isActive   = song.id === activeSongId;
        const isExpanded = expandedId === song.id;
        const sessions   = isExpanded ? getSessionsForSong(song.id) : [];

        return (
          <div
            key={song.id}
            className={`ls-item${isActive ? ' active' : ''}`}
            onClick={() => onOpenSong(song)}
          >
            <div className="ls-item-header">
              <div className="ls-item-info">

                {/* Tên bài — click để edit */}
                <InlineEdit
                  value={song.title}
                  placeholder="Untitled"
                  className="ls-title"
                  onCommit={v => updateSong(song.id, { title: v })}
                />

                {/* Composer — chỉ hiển thị, không edit */}
                {song.composer && (
                  <span className="ls-composer">{song.composer}</span>
                )}

                <div className="ls-meta">
                  <span className="ls-notes">{song.totalNotes} nốt</span>
                  <span className="ls-dot">·</span>
                  <span className="ls-date">{formatDate(song.createdAt)}</span>
                  <span className="ls-dot">·</span>
                  <span className={`ls-format ls-format-${song.format}`}>{song.format}</span>
                </div>
                <BestBadge session={best} />
              </div>

              <div className="ls-item-actions" onClick={e => e.stopPropagation()}>
                <button
                  className="ls-btn-icon"
                  title="Xem lịch sử"
                  onClick={() => setExpandedId(isExpanded ? null : song.id)}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points={isExpanded ? '18 15 12 9 6 15' : '6 9 12 15 18 9'}/>
                  </svg>
                </button>
                <button
                  className={`ls-btn-icon ls-btn-delete${confirmDelete === song.id ? ' confirm' : ''}`}
                  title={confirmDelete === song.id ? 'Bấm lần nữa để xác nhận' : 'Xóa bài'}
                  onClick={(e) => handleDelete(song.id, e)}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6l-1 14H6L5 6"/>
                    <path d="M10 11v6M14 11v6"/>
                    <path d="M9 6V4h6v2"/>
                  </svg>
                </button>
              </div>
            </div>

            {/* History rows */}
            {isExpanded && (
              <div className="ls-history" onClick={e => e.stopPropagation()}>
                {sessions.length === 0 ? (
                  <div className="ls-history-empty">Chưa có lịch sử</div>
                ) : (
                  sessions.slice(0, 5).map(s => (
                    <div key={s.id} className="ls-session-row">
                      <span className="ls-session-date">{formatDate(s.date)}</span>
                      <span className="ls-session-mode">{s.mode}</span>
                      <span className="ls-session-acc"
                        style={{ color: s.stats.accuracy >= 85 ? '#34c759' : s.stats.accuracy >= 60 ? '#ff9f0a' : '#ff453a' }}>
                        {s.stats.accuracy}%
                      </span>
                      <span className="ls-session-score">{s.stats.score.toLocaleString()}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
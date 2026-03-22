import { create } from 'zustand';
import { persist, subscribeWithSelector } from 'zustand/middleware';
import type { SessionStats } from '../types/practice';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Song {
  id:        string;       // uuid
  title:     string;
  composer:  string;
  format:    'xml' | 'kern';
  rawContent: string;      // MusicXML hoặc kern content
  createdAt: number;       // Date.now()
  totalNotes: number;
}

export interface PracticeSession {
  id:        string;
  songId:    string;
  mode:      'follow' | 'step';
  stats:     SessionStats;
  date:      number;       // Date.now()
  durationSec: number;
}

interface LibraryStore {
  songs:        Song[];
  sessions:     PracticeSession[];
  activeSongId: string | null;

  // Song actions
  addSong:      (song: Omit<Song, 'id' | 'createdAt'>) => Song;
  removeSong:   (id: string) => void;
  updateSong:   (id: string, patch: Partial<Pick<Song, 'title' | 'composer'>>) => void;
  setActiveSong:(id: string | null) => void;
  getActiveSong:() => Song | null;

  // Session actions
  addSession:   (session: Omit<PracticeSession, 'id' | 'date'>) => void;
  getSessionsForSong: (songId: string) => PracticeSession[];
  getBestSession:     (songId: string) => PracticeSession | null;
  clearHistory:       (songId: string) => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useLibraryStore = create<LibraryStore>()(
  subscribeWithSelector(
    persist(
      (set, get) => ({
        songs:        [],
        sessions:     [],
        activeSongId: null,

        addSong: (data) => {
          const song: Song = {
            ...data,
            id:        crypto.randomUUID(),
            createdAt: Date.now(),
          };
          set(s => ({ songs: [song, ...s.songs] }));
          console.log('[Library] added song:', song.title, song.id);
          return song;
        },

        removeSong: (id) => {
          set(s => ({
            songs:    s.songs.filter(s => s.id !== id),
            sessions: s.sessions.filter(s => s.songId !== id),
            activeSongId: s.activeSongId === id ? null : s.activeSongId,
          }));
        },

        updateSong: (id, patch) => {
          set(s => ({
            songs: s.songs.map(song => song.id === id ? { ...song, ...patch } : song),
          }));
        },

        setActiveSong: (id) => set({ activeSongId: id }),

        getActiveSong: () => {
          const { songs, activeSongId } = get();
          return songs.find(s => s.id === activeSongId) ?? null;
        },

        addSession: (data) => {
          const session: PracticeSession = {
            ...data,
            id:   crypto.randomUUID(),
            date: Date.now(),
          };
          set(s => ({ sessions: [session, ...s.sessions] }));
        },

        getSessionsForSong: (songId) =>
          get().sessions.filter(s => s.songId === songId)
            .sort((a, b) => b.date - a.date),

        getBestSession: (songId) => {
          const all = get().sessions.filter(s => s.songId === songId);
          if (!all.length) return null;
          return all.reduce((best, s) =>
            s.stats.score > best.stats.score ? s : best
          );
        },

        clearHistory: (songId) =>
          set(s => ({ sessions: s.sessions.filter(s => s.songId !== songId) })),
      }),
      {
        name:    'score-studio-library',
        version: 1,
        // Không persist rawContent để tiết kiệm space nếu bài quá lớn
        // Nhưng cần lưu để open lại — để nguyên
      },
    ),
  ),
);

// ─── Selectors ────────────────────────────────────────────────────────────────

export const useSongs        = () => useLibraryStore(s => s.songs);
export const useActiveSongId = () => useLibraryStore(s => s.activeSongId);
export const useSessions     = () => useLibraryStore(s => s.sessions);
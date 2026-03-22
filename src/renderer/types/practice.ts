// src/renderer/types/practice.ts

export type PracticeMode = 'view' | 'follow' | 'step';

export type NoteVerdict = 'correct' | 'wrong' | 'late' | 'pending';

export interface NoteResult {
  noteIndex: number;
  expectedMidi: number[];   // các MIDI note cần bấm (chord)
  pressedMidi:  number[];   // user thực sự bấm
  verdict:      NoteVerdict;
  timingMs:     number;     // > 0: trễ, < 0: sớm, 0: perfect
}

export interface SessionStats {
  totalNotes:   number;
  correct:      number;
  wrong:        number;
  late:         number;
  accuracy:     number;      // 0–100
  avgTimingMs:  number;
  maxCombo:     number;
  currentCombo: number;
  score:        number;
}

export const EMPTY_STATS: SessionStats = {
  totalNotes:   0,
  correct:      0,
  wrong:        0,
  late:         0,
  accuracy:     0,
  avgTimingMs:  0,
  maxCombo:     0,
  currentCombo: 0,
  score:        0,
};
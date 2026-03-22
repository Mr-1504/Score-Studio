// src/renderer/components/PianoKeyboard.tsx
// UPDATED: dùng verdictFlash (tự clear) thay vì noteVerdicts (persist mãi)

import { useEffect, useCallback } from 'react';
import { usePlaybackStore } from '../store/usePlaybackStore';
import {
  usePracticeMode,
  useExpectedMidi,
  useVerdictFlash,
  useOnUserKeyPress,
} from '../store/usePracticeStore';
import './PianoKeyboard.css';

// ─── Constants ────────────────────────────────────────────────────────────────

const FIRST_MIDI = 36;
const LAST_MIDI  = 96;

const LAPTOP_KEY_MAP: Record<string, number> = {
  'z': 48, 'x': 50, 'c': 52, 'v': 53, 'b': 55, 'n': 57, 'm': 59,
  's': 49, 'd': 51, 'g': 54, 'h': 56, 'j': 58,
  'q': 60, 'w': 62, 'e': 64, 'r': 65, 't': 67, 'y': 69, 'u': 71, 'i': 72,
  '2': 61, '3': 63, '5': 66, '6': 68, '7': 70,
};

function isBlack(midi: number): boolean {
  return [1, 3, 6, 8, 10].includes(midi % 12);
}

function midiToNoteName(midi: number): string {
  const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  return `${names[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

const ALL_KEYS = (() => {
  const keys: { midi: number; black: boolean; name: string }[] = [];
  for (let m = FIRST_MIDI; m <= LAST_MIDI; m++) {
    keys.push({ midi: m, black: isBlack(m), name: midiToNoteName(m) });
  }
  return keys;
})();

const WHITE_KEYS = ALL_KEYS.filter(k => !k.black);
const WHITE_X    = new Map<number, number>();
WHITE_KEYS.forEach((k, i) => WHITE_X.set(k.midi, i * 36));

function blackKeyX(midi: number): number {
  const lx = WHITE_X.get(midi - 1);
  return lx !== undefined ? lx + 36 - 11 : 0;
}

// ─── Key class ────────────────────────────────────────────────────────────────

function getKeyClass(
  midi: number,
  black: boolean,
  activeSet: Set<number>,
  expectedSet: Set<number>,
  flash: Map<number, 'correct' | 'wrong' | 'late'>,
  isPractice: boolean,
): string {
  const base = black ? 'pk-key pk-black' : 'pk-key pk-white';

  if (isPractice) {
    const v = flash.get(midi);
    if (v === 'correct') return `${base} pk-correct`;
    if (v === 'wrong')   return `${base} pk-wrong`;
    if (v === 'late')    return `${base} pk-late`;
    if (expectedSet.has(midi)) return `${base} pk-expected`;
  }

  if (activeSet.has(midi)) return `${base} pk-active`;
  return base;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface PianoKeyboardProps {
  onKeyPress?: (midi: number) => void;
}

export default function PianoKeyboard({ onKeyPress }: PianoKeyboardProps) {
  const activeNotes    = usePlaybackStore(s => s.activeNotes);
  const mode           = usePracticeMode();
  const expectedMidi   = useExpectedMidi();
  const verdictFlash   = useVerdictFlash();
  const onUserKeyPress = useOnUserKeyPress();

  const isPractice  = mode !== 'view';
  const activeSet   = new Set<number>(activeNotes as number[]);
  const expectedSet = new Set<number>(expectedMidi);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.repeat) return;
    const midi = LAPTOP_KEY_MAP[e.key.toLowerCase()];
    if (!midi) return;
    onKeyPress?.(midi);
    if (isPractice) onUserKeyPress(midi);
  }, [isPractice, onKeyPress, onUserKeyPress]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const totalWidth = WHITE_KEYS.length * 36;

  return (
    <div className="piano-keyboard-wrap">
      <div className="piano-keyboard" style={{ width: totalWidth, position: 'relative', height: 140 }}>

        {WHITE_KEYS.map(k => (
          <div
            key={k.midi}
            className={getKeyClass(k.midi, false, activeSet, expectedSet, verdictFlash, isPractice)}
            style={{ left: WHITE_X.get(k.midi) }}
            title={k.name}
            onMouseDown={() => {
              onKeyPress?.(k.midi);
              if (isPractice) onUserKeyPress(k.midi);
            }}
          >
            {k.name.startsWith('C') && !k.name.includes('#') && (
              <span className="pk-label">{k.name}</span>
            )}
          </div>
        ))}

        {ALL_KEYS.filter(k => k.black).map(k => (
          <div
            key={k.midi}
            className={getKeyClass(k.midi, true, activeSet, expectedSet, verdictFlash, isPractice)}
            style={{ left: blackKeyX(k.midi) }}
            title={k.name}
            onMouseDown={() => {
              onKeyPress?.(k.midi);
              if (isPractice) onUserKeyPress(k.midi);
            }}
          />
        ))}

      </div>

      {isPractice && (
        <div className="pk-hint">
          Z–M: C3–B3 &nbsp;|&nbsp; Q–I: C4–C5 &nbsp;|&nbsp; S D G H J: C3 sharps &nbsp;|&nbsp; 2 3 5 6 7: C4 sharps
        </div>
      )}
    </div>
  );
}
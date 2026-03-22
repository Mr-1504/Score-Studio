import { useEffect, useCallback, useState } from 'react';
import { usePlaybackStore } from '../store/usePlaybackStore';
import {
  usePracticeMode,
  useExpectedMidi,
  useVerdictFlash,
  useOnUserKeyPress,
} from '../store/usePracticeStore';
import './PianoKeyboard.css';

const FIRST_MIDI = 36;
const LAST_MIDI  = 96;

// Full 61-key mapping C2(36) → C7(96)
// Dùng event.code — không bị ảnh hưởng input method tiếng Việt
const CODE_MAP: Record<string, number> = {
  // ── C2 octave (36-47) — hàng số + backtick ──────────────────
  'Backquote': 36,  // C2
  'F1':        37,  // C#2
  'Digit1':    38,  // D2
  'F2':        39,  // D#2
  'Digit2':    40,  // E2
  'Digit3':    41,  // F2
  'F3':        42,  // F#2
  'Digit4':    43,  // G2
  'F4':        44,  // G#2
  'Digit5':    45,  // A2
  'F5':        46,  // A#2
  'Digit6':    47,  // B2

  // ── C3 octave (48-59) — hàng số 7-0 + F6-F10 + Backspace ───
  'Digit7':      48,  // C3
  'F6':          49,  // C#3
  'Digit8':      50,  // D3
  'F7':          51,  // D#3
  'Digit9':      52,  // E3
  'Digit0':      53,  // F3
  'F8':          54,  // F#3
  'Minus':       55,  // G3
  'F9':          56,  // G#3
  'Equal':       57,  // A3
  'F10':         58,  // A#3
  'Backspace':   59,  // B3

  // ── C4 octave (60-71) — hàng Q-U + Tab F11 F12 BracketLeft/Right ──
  'KeyQ':          60,  // C4
  'Tab':           61,  // C#4
  'KeyW':          62,  // D4
  'F11':           63,  // D#4
  'KeyE':          64,  // E4
  'KeyR':          65,  // F4
  'F12':           66,  // F#4
  'KeyT':          67,  // G4
  'BracketLeft':   68,  // G#4
  'KeyY':          69,  // A4
  'BracketRight':  70,  // A#4
  'KeyU':          71,  // B4

  // ── C5 octave (72-83) — hàng I-F + Backslash Delete Insert Home PgUp ──
  'KeyI':        72,  // C5
  'Backslash':   73,  // C#5
  'KeyO':        74,  // D5
  'Delete':      75,  // D#5
  'KeyP':        76,  // E5
  'KeyA':        77,  // F5
  'Insert':      78,  // F#5
  'KeyS':        79,  // G5
  'Home':        80,  // G#5
  'KeyD':        81,  // A5
  'PageUp':      82,  // A#5
  'KeyF':        83,  // B5

  // ── C6 octave (84-95) — hàng G-' + End PgDn arrows ──────────
  'KeyG':        84,  // C6
  'End':         85,  // C#6
  'KeyH':        86,  // D6
  'PageDown':    87,  // D#6
  'KeyJ':        88,  // E6
  'KeyK':        89,  // F6
  'ArrowUp':     90,  // F#6
  'KeyL':        91,  // G6
  'ArrowLeft':   92,  // G#6
  'Semicolon':   93,  // A6
  'ArrowRight':  94,  // A#6
  'Quote':       95,  // B6

  // ── C7 (96) ──────────────────────────────────────────────────
  'ArrowDown':   96,  // C7
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

function getKeyClass(
  midi: number,
  black: boolean,
  activeSet: Set<number>,
  pressedSet: Set<number>,
  expectedSet: Set<number>,
  flash: Map<number, 'correct' | 'wrong' | 'late'>,
  isPractice: boolean,
): string {
  const base = black ? 'pk-key pk-black' : 'pk-key pk-white';

  // Flash verdict (practice) — ưu tiên cao nhất
  if (isPractice) {
    const v = flash.get(midi);
    if (v === 'correct') return `${base} pk-correct`;
    if (v === 'wrong')   return `${base} pk-wrong`;
    if (v === 'late')    return `${base} pk-late`;
  }

  // Phím đang giữ (keyboard hoặc chuột)
  if (pressedSet.has(midi)) return `${base} pk-active`;

  // Expected highlight (practice)
  if (isPractice && expectedSet.has(midi)) return `${base} pk-expected`;

  // Playback active
  if (activeSet.has(midi)) return `${base} pk-active`;

  return base;
}

interface PianoKeyboardProps {
  onKeyPress?: (midi: number) => void;
}

export default function PianoKeyboard({ onKeyPress }: PianoKeyboardProps) {
  const activeNotes    = usePlaybackStore(s => s.activeNotes);
  const mode           = usePracticeMode();
  const expectedMidi   = useExpectedMidi();
  const verdictFlash   = useVerdictFlash();
  const onUserKeyPress = useOnUserKeyPress();

  // Local pressed state — visual feedback ngay lập tức, không phụ thuộc session
  const [pressedKeys, setPressedKeys] = useState<Set<number>>(new Set());

  const isPractice  = mode !== 'view';
  const activeSet   = new Set<number>(activeNotes as number[]);
  const expectedSet = new Set<number>(expectedMidi);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Bỏ qua khi focus vào input/select
    const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
    if (e.repeat) return;

    // Dùng e.code — không bị ảnh hưởng input method
    const midi = CODE_MAP[e.code];
    if (!midi) return;

    e.preventDefault(); // ngăn browser/Electron dùng phím cho việc khác

    setPressedKeys(prev => new Set([...prev, midi]));
    onKeyPress?.(midi);
    if (isPractice) onUserKeyPress(midi);
  }, [isPractice, onKeyPress, onUserKeyPress]);

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    const midi = CODE_MAP[e.code];
    if (!midi) return;
    setPressedKeys(prev => {
      const next = new Set(prev);
      next.delete(midi);
      return next;
    });
  }, []);

  useEffect(() => {
    // document thay vì window — bắt được events trong Electron kể cả khi window không có focus
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleKeyDown, handleKeyUp]);

  const totalWidth = WHITE_KEYS.length * 36;

  return (
    <div
      className="piano-keyboard-wrap"
      onMouseDown={() => {
        // Blur input đang focus để keyboard events không bị chặn
        (document.activeElement as HTMLElement)?.blur?.();
      }}
    >
      <div
        className="piano-keyboard"
        style={{ width: totalWidth, position: 'relative', height: 140 }}
      >
        {WHITE_KEYS.map(k => (
          <div
            key={k.midi}
            className={getKeyClass(
              k.midi, false, activeSet, pressedKeys, expectedSet, verdictFlash, isPractice,
            )}
            style={{ left: WHITE_X.get(k.midi) }}
            title={k.name}
            onMouseDown={ev => {
              ev.preventDefault();
              setPressedKeys(prev => new Set([...prev, k.midi]));
              onKeyPress?.(k.midi);
              if (isPractice) onUserKeyPress(k.midi);
            }}
            onMouseUp={() => setPressedKeys(prev => { const n = new Set(prev); n.delete(k.midi); return n; })}
            onMouseLeave={() => setPressedKeys(prev => { const n = new Set(prev); n.delete(k.midi); return n; })}
          >
            {k.name.startsWith('C') && !k.name.includes('#') && (
              <span className="pk-label">{k.name}</span>
            )}
          </div>
        ))}

        {ALL_KEYS.filter(k => k.black).map(k => (
          <div
            key={k.midi}
            className={getKeyClass(
              k.midi, true, activeSet, pressedKeys, expectedSet, verdictFlash, isPractice,
            )}
            style={{ left: blackKeyX(k.midi) }}
            title={k.name}
            onMouseDown={ev => {
              ev.preventDefault();
              setPressedKeys(prev => new Set([...prev, k.midi]));
              onKeyPress?.(k.midi);
              if (isPractice) onUserKeyPress(k.midi);
            }}
            onMouseUp={() => setPressedKeys(prev => { const n = new Set(prev); n.delete(k.midi); return n; })}
            onMouseLeave={() => setPressedKeys(prev => { const n = new Set(prev); n.delete(k.midi); return n; })}
          />
        ))}
      </div>

      <div className="pk-bottom-row">
        {isPractice && (
          <span className="pk-hint">
            `1-6: C2–B2  |  7-BS: C3–B3  |  Q-U: C4–B4  |  I-F: C5–B5  |  G-': C6–B6
          </span>
        )}
        <span className="pk-focus-hint">
          {pressedKeys.size > 0
            ? `▶ ${[...pressedKeys].map(midiToNoteName).join(', ')}`
            : 'Gõ phím laptop hoặc click phím piano'}
        </span>
      </div>
    </div>
  );
}
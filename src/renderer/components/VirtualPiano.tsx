import React, { useEffect, useState } from 'react';

interface VirtualPianoProps {
  onKeyPress?: (midiNote: number) => void;
  expectedNoteIndex?: number;
}

const VirtualPiano: React.FC<VirtualPianoProps> = ({ onKeyPress }) => {
  const [activeKeys, setActiveKeys] = useState<Set<number>>(new Set());

  // Bản đồ phím cơ bản (từ C4 đến E5)
  const keyMap: { [key: string]: number } = {
    'a': 60, 'w': 61, 's': 62, 'e': 63, 'd': 64, 'f': 65, 't': 66,
    'g': 67, 'y': 68, 'h': 69, 'u': 70, 'j': 71, 'k': 72, 'o': 73, 'l': 74, 'p': 75, ';': 76
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const note = keyMap[e.key.toLowerCase()];
      if (note && !e.repeat) {
        setActiveKeys(prev => new Set(prev).add(note));
        if (onKeyPress) onKeyPress(note);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const note = keyMap[e.key.toLowerCase()];
      if (note) {
        setActiveKeys(prev => {
          const next = new Set(prev);
          next.delete(note);
          return next;
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [onKeyPress]);

  const renderKey = (note: number, isBlack: boolean) => {
    const isActive = activeKeys.has(note);
    return (
      <div 
        key={note} 
        style={{
          width: isBlack ? '25px' : '40px',
          height: isBlack ? '100px' : '150px',
          background: isActive ? '#6366f1' : (isBlack ? '#111827' : '#ffffff'),
          border: '1px solid #374151',
          margin: isBlack ? '0 -12.5px' : '0',
          zIndex: isBlack ? 2 : 1,
          borderRadius: '0 0 4px 4px',
          boxShadow: isActive ? 'inset 0 0 10px rgba(0,0,0,0.5)' : 'none'
        }}
      />
    );
  };

  // Render một dải phím mẫu
  const octaves = [60, 72]; // C4, C5
  return (
    <div style={{ display: 'flex' }}>
      {octaves.map(base => (
        <React.Fragment key={base}>
          {renderKey(base, false)}     {/* C */}
          {renderKey(base + 1, true)}  {/* C# */}
          {renderKey(base + 2, false)} {/* D */}
          {renderKey(base + 3, true)}  {/* D# */}
          {renderKey(base + 4, false)} {/* E */}
          {renderKey(base + 5, false)} {/* F */}
          {renderKey(base + 6, true)}  {/* F# */}
          {renderKey(base + 7, false)} {/* G */}
          {renderKey(base + 8, true)}  {/* G# */}
          {renderKey(base + 9, false)} {/* A */}
          {renderKey(base + 10, true)} {/* A# */}
          {renderKey(base + 11, false)}{/* B */}
        </React.Fragment>
      ))}
      {renderKey(84, false)} {/* C6 */}
    </div>
  );
};

export default VirtualPiano;
export interface NoteEvent {
  id: string;             // unique id: `${measureIdx}-${noteIdx}`
  midiNote: number;       // 60 = C4, 61 = C#4, ...
  pitch: string;          // "C4", "F#3", ...
  startBeat: number;      // thời điểm bắt đầu theo beat (tính từ đầu bài)
  durationBeats: number;  // độ dài tính theo beat
  startSec: number;       // thời điểm bắt đầu theo giây (ở tempo gốc)
  durationSec: number;    // độ dài theo giây (ở tempo gốc)
  measureIndex: number;
  noteIndex: number;      // vị trí trong bài (để sync với OSMD)
  isChord: boolean;       // có phải nốt trong chord không
  chordGroupId: string;   // nốt cùng chord thì cùng groupId
  voice: number;
}

export interface ParsedMusic {
  notes: NoteEvent[];
  temposBPM: TempoChange[];   // danh sách tempo thay đổi
  timeSignatures: TimeSignature[];
  totalBeats: number;
  totalSec: number;           // tính ở tempo đầu tiên
  divisions: number;          // MusicXML divisions per quarter note
  title: string;
  composer: string;
}

export interface TempoChange {
  beat: number;   // bắt đầu từ beat nào
  bpm: number;
}

export interface TimeSignature {
  beat: number;
  numerator: number;
  denominator: number;
}

// Engine state - chỉ đọc từ UI, không write trực tiếp
export type PlaybackStatus = 'idle' | 'playing' | 'paused' | 'stopped' | 'loading';

export interface PlaybackState {
  status: PlaybackStatus;
  currentBeat: number;
  currentSec: number;
  activeNotes: Set<number>;       // MIDI notes đang sound
  currentNoteIndex: number;       // index trong ParsedMusic.notes
  speedMultiplier: number;        // 0.5 → 1.5
  duration: number;               // tổng thời gian (giây, ở tốc độ gốc)
}
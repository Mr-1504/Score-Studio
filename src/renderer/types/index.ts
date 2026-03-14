export type EngineType = 'AUDIVERIS_XML' | 'CUSTOM_MODEL_KERN';

export interface MusicalNote {
  pitch: string;      // VD: C4, D#4
  midiNote: number;   // Mã MIDI (VD: 60 = C4)
  startTime: number;  // Giây
  duration: number;   // Giây
}

export interface MusicData {
  rawContent: string;
  format: 'xml' | 'kern';
  notes?: MusicalNote[]; 
}
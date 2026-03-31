import type { NoteEvent, ParsedMusic, TempoChange, TimeSignature } from '../types/music';

const NOTE_SEMITONES: Record<string, number> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
};

function stepAlterOctaveToMidi(step: string, alter: number, octave: number): number {
  return (octave + 1) * 12 + (NOTE_SEMITONES[step] ?? 0) + Math.round(alter);
}

function midiToPitchName(midi: number): string {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(midi / 12) - 1;
  return `${names[midi % 12]}${octave}`;
}

export class MusicXMLParser {
  parse(xmlString: string): ParsedMusic {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, 'application/xml');

    const parseError = doc.querySelector('parseerror');
    if (parseError) {
      throw new Error(`MusicXML parse error: ${parseError.textContent}`);
    }

    const title    = doc.querySelector('work-title, movement-title')?.textContent?.trim() ?? 'Untitled';
    const composer = doc.querySelector('creator[type="composer"]')?.textContent?.trim() ?? '';

    const divisionsEl = doc.querySelector('divisions');
    const divisions   = divisionsEl ? parseInt(divisionsEl.textContent ?? '1') : 1;

    const temposBPM     = this._parseTempos(doc, divisions);
    const baseBPM       = temposBPM[0]?.bpm ?? 120;
    const timeSignatures = this._parseTimeSignatures(doc, divisions);
    const { notes, totalBeats } = this._parseNotes(doc, divisions, baseBPM);
    const keySignatures = this._parseKeySignatures(doc);

    const totalSec = notes.length > 0
      ? notes[notes.length - 1].startSec + Math.max(0, notes[notes.length - 1].durationSec)
      : 0;

    return {
      notes, temposBPM, timeSignatures, keySignatures,
      totalBeats, totalSec, divisions, title, composer,
    };
  }

  private _parseKeySignatures(doc: Document): import('../types/music').KeySignature[] {
    const MAJOR_KEYS: Record<number, string> = {
      0:'C',  1:'G',   2:'D',  3:'A',  4:'E',  5:'B',   6:'F#', 7:'C#',
      '-1':'F', '-2':'Bb', '-3':'Eb', '-4':'Ab', '-5':'Db', '-6':'Gb', '-7':'Cb',
    };
    const MINOR_KEYS: Record<number, string> = {
      0:'A',  1:'E',   2:'B',  3:'F#', 4:'C#', 5:'G#',  6:'D#', 7:'A#',
      '-1':'D', '-2':'G', '-3':'C', '-4':'F', '-5':'Bb', '-6':'Eb', '-7':'Ab',
    };

    const keys: import('../types/music').KeySignature[] = [];
    const seen = new Set<string>();

    doc.querySelectorAll('key').forEach(k => {
      const fifths = parseInt(k.querySelector('fifths')?.textContent ?? '0');
      const mode   = (k.querySelector('mode')?.textContent ?? 'major') as 'major' | 'minor';
      const root   = mode === 'minor' ? MINOR_KEYS[fifths] : MAJOR_KEYS[fifths];
      const label  = root ? `${root} ${mode}` : `${fifths >= 0 ? '+' : ''}${fifths} fifths`;
      const uid    = `${fifths}-${mode}`;
      if (!seen.has(uid)) { seen.add(uid); keys.push({ fifths, mode, label }); }
    });

    return keys.length ? keys : [{ fifths: 0, mode: 'major', label: 'C major' }];
  }

  private _parseTempos(doc: Document, divisions: number): TempoChange[] {
    const tempos: TempoChange[] = [];
    let currentBeat = 0;
    let foundAny    = false;

    const firstPart = doc.querySelector('part');
    if (!firstPart) return [{ beat: 0, bpm: 120 }];

    firstPart.querySelectorAll('measure').forEach(measure => {
      measure.querySelectorAll('direction').forEach(dir => {
        const perMinute = dir.querySelector('per-minute');
        const soundEl   = dir.querySelector('sound[tempo]');
        let bpm: number | null = null;
        if (perMinute)   bpm = parseFloat(perMinute.textContent ?? '120');
        else if (soundEl) bpm = parseFloat(soundEl.getAttribute('tempo') ?? '120');

        if (bpm !== null && !isNaN(bpm)) {
          tempos.push({ beat: currentBeat, bpm });
          foundAny = true;
        }
      });

      Array.from(measure.children).forEach(child => {
        if (child.tagName === 'note' && !child.querySelector('chord')) {
          currentBeat += parseInt(child.querySelector('duration')?.textContent ?? '0') / divisions;
        } else if (child.tagName === 'backup') {
          currentBeat -= parseInt(child.querySelector('duration')?.textContent ?? '0') / divisions;
        } else if (child.tagName === 'forward') {
          currentBeat += parseInt(child.querySelector('duration')?.textContent ?? '0') / divisions;
        }
      });
    });

    if (!foundAny) tempos.push({ beat: 0, bpm: 120 });
    return tempos.sort((a, b) => a.beat - b.beat);
  }

  private _parseTimeSignatures(doc: Document, _divisions: number): TimeSignature[] {
    const sigs: TimeSignature[] = [];
    const firstPart = doc.querySelector('part');
    if (firstPart) {
      firstPart.querySelectorAll('measure').forEach(measure => {
        const timeSig = measure.querySelector('time');
        if (timeSig) {
          const num = parseInt(timeSig.querySelector('beats')?.textContent     ?? '4');
          const den = parseInt(timeSig.querySelector('beat-type')?.textContent ?? '4');
          if (
            sigs.length === 0 ||
            sigs[sigs.length - 1].numerator   !== num ||
            sigs[sigs.length - 1].denominator !== den
          ) {
            sigs.push({ beat: 0, numerator: num, denominator: den });
          }
        }
      });
    }
    if (sigs.length === 0) sigs.push({ beat: 0, numerator: 4, denominator: 4 });
    return sigs;
  }

  private _parseNotes(
    doc: Document,
    divisions: number,
    baseBPM: number,
  ): { notes: NoteEvent[]; totalBeats: number } {
    const notes: NoteEvent[] = [];
    let maxTotalBeats = 0;
    const beatToSec = (beat: number) => (beat / baseBPM) * 60;

    doc.querySelectorAll('part').forEach(part => {
      let currentBeat = 0;
      let measureIdx = 0;

      part.querySelectorAll('measure').forEach(measure => {
        let chordBeat = currentBeat;

        Array.from(measure.children).forEach(child => {
          if (child.tagName === 'backup') {
            const dur = parseInt(child.querySelector('duration')?.textContent ?? '0');
            currentBeat -= dur / divisions;
          } else if (child.tagName === 'forward') {
            const dur = parseInt(child.querySelector('duration')?.textContent ?? '0');
            currentBeat += dur / divisions;
          } else if (child.tagName === 'note') {
            const isRest    = !!child.querySelector('rest');
            const isChord   = !!child.querySelector('chord');
            const durationDivs  = parseInt(child.querySelector('duration')?.textContent ?? '0');
            const durationBeats = durationDivs / divisions;

            if (!isChord) chordBeat = currentBeat;

            if (isRest) {
              if (!isChord) currentBeat += durationBeats;
              return;
            }

            const pitchEl = child.querySelector('pitch');
            if (!pitchEl) {
              if (!isChord) currentBeat += durationBeats;
              return;
            }

            const step     = pitchEl.querySelector('step')?.textContent   ?? 'C';
            const octave   = parseInt(pitchEl.querySelector('octave')?.textContent ?? '4');
            const alter    = parseFloat(pitchEl.querySelector('alter')?.textContent ?? '0');
            const midiNote = stepAlterOctaveToMidi(step, alter, octave);
            const voice    = parseInt(child.querySelector('voice')?.textContent ?? '1');

            notes.push({
              id:           `${measureIdx}-${notes.length}`,
              midiNote,
              pitch:        midiToPitchName(midiNote),
              startBeat:    chordBeat,
              durationBeats,
              startSec:     beatToSec(chordBeat),
              durationSec:  beatToSec(durationBeats),
              measureIndex: measureIdx,        
              noteIndex:    0,
              isChord,
              chordGroupId: `${measureIdx}-beat-${chordBeat.toFixed(4)}`,
              voice,
            });

            if (!isChord) currentBeat += durationBeats;
          }
        });

        maxTotalBeats = Math.max(maxTotalBeats, currentBeat);
        measureIdx++; 
      });
    });

    notes.sort((a, b) => a.startBeat - b.startBeat || a.measureIndex - b.measureIndex);
    notes.forEach((n, i) => (n.noteIndex = i));

    return { notes, totalBeats: maxTotalBeats };
  }
}

export const musicXMLParser = new MusicXMLParser();
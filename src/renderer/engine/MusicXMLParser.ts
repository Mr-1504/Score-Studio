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

    const title = doc.querySelector('work-title, movement-title')?.textContent?.trim() ?? 'Untitled';
    const composer = doc.querySelector('creator[type="composer"]')?.textContent?.trim() ?? '';

    // Lấy divisions từ measure đầu tiên
    const divisionsEl = doc.querySelector('divisions');
    const divisions = divisionsEl ? parseInt(divisionsEl.textContent ?? '1') : 1;

    // Parse tempo changes
    const temposBPM = this._parseTempos(doc, divisions);
    const baseBPM = temposBPM[0]?.bpm ?? 120;

    // Parse time signatures
    const timeSignatures = this._parseTimeSignatures(doc, divisions);

    // Parse all notes
    const { notes, totalBeats } = this._parseNotes(doc, divisions, baseBPM);

    const totalSec = notes.length > 0
      ? notes[notes.length - 1].startSec + notes[notes.length - 1].durationSec
      : 0;

    return {
      notes,
      temposBPM,
      timeSignatures,
      totalBeats,
      totalSec,
      divisions,
      title,
      composer,
    };
  }

  private _parseTempos(doc: Document, divisions: number): TempoChange[] {
    const tempos: TempoChange[] = [];
    let currentBeat = 0;

    // Default tempo nếu không có direction
    let foundAny = false;

    doc.querySelectorAll('measure').forEach(measure => {
      // Kiểm tra metronome / sound tempo
      measure.querySelectorAll('direction').forEach(dir => {
        const perMinute = dir.querySelector('per-minute');
        const soundEl = dir.querySelector('sound[tempo]');

        let bpm: number | null = null;
        if (perMinute) {
          bpm = parseFloat(perMinute.textContent ?? '120');
        } else if (soundEl) {
          bpm = parseFloat(soundEl.getAttribute('tempo') ?? '120');
        }

        if (bpm !== null && !isNaN(bpm)) {
          tempos.push({ beat: currentBeat, bpm });
          foundAny = true;
        }
      });

      // Tính beat của measure này
      const notes = measure.querySelectorAll('note');
      let maxDuration = 0;
      notes.forEach(note => {
        const isChord = !!note.querySelector('chord');
        if (!isChord) {
          const dur = parseInt(note.querySelector('duration')?.textContent ?? '0') / divisions;
          maxDuration += dur;
        }
      });
      currentBeat += maxDuration;
    });

    if (!foundAny) {
      tempos.push({ beat: 0, bpm: 120 });
    }

    return tempos.sort((a, b) => a.beat - b.beat);
  }

  private _parseTimeSignatures(doc: Document, _divisions: number): TimeSignature[] {
    const sigs: TimeSignature[] = [];
    let currentBeat = 0;

    doc.querySelectorAll('measure').forEach(measure => {
      const timeSig = measure.querySelector('time');
      if (timeSig) {
        const num = parseInt(timeSig.querySelector('beats')?.textContent ?? '4');
        const den = parseInt(timeSig.querySelector('beat-type')?.textContent ?? '4');
        sigs.push({ beat: currentBeat, numerator: num, denominator: den });
      }

      let measureBeats = 0;
      measure.querySelectorAll('note').forEach(note => {
        if (!note.querySelector('chord')) {
          measureBeats += parseInt(note.querySelector('duration')?.textContent ?? '0');
        }
      });
      currentBeat += measureBeats / _divisions;
    });

    if (sigs.length === 0) sigs.push({ beat: 0, numerator: 4, denominator: 4 });
    return sigs;
  }

  private _parseNotes(
    doc: Document,
    divisions: number,
    baseBPM: number,
  ): { notes: NoteEvent[]; totalBeats: number } {
    const notes: NoteEvent[] = [];
    let noteIndex = 0;
    let currentBeat = 0;
    let measureIdx = 0;

    // Hàm chuyển beat → giây theo baseBPM (sẽ được engine adjust theo speedMultiplier)
    const beatToSec = (beat: number) => (beat / baseBPM) * 60;

    doc.querySelectorAll('measure').forEach(measure => {
      const noteEls = measure.querySelectorAll('note');
      let chordBeat = currentBeat; // beat của chord group hiện tại
      let chordGroupId = `${measureIdx}-chord-${noteIndex}`;

      noteEls.forEach((noteEl) => {
        const isRest = !!noteEl.querySelector('rest');
        const isChord = !!noteEl.querySelector('chord');
        const durationEl = noteEl.querySelector('duration');
        const durationDivs = durationEl ? parseInt(durationEl.textContent ?? '0') : 0;
        const durationBeats = durationDivs / divisions;

        if (isChord) {
          // Nốt trong chord: dùng lại beat của nốt trước, không advance beat
          // chordBeat đã được set ở nốt đầu chord
        } else {
          // Nốt thường hoặc đầu chord: advance beat
          chordBeat = currentBeat;
          chordGroupId = `${measureIdx}-chord-${noteIndex}`;
        }

        if (isRest) {
          if (!isChord) currentBeat += durationBeats;
          return;
        }

        const pitchEl = noteEl.querySelector('pitch');
        if (!pitchEl) {
          if (!isChord) currentBeat += durationBeats;
          return;
        }

        const step = pitchEl.querySelector('step')?.textContent ?? 'C';
        const octave = parseInt(pitchEl.querySelector('octave')?.textContent ?? '4');
        const alter = parseFloat(pitchEl.querySelector('alter')?.textContent ?? '0');
        const midiNote = stepAlterOctaveToMidi(step, alter, octave);
        const pitch = midiToPitchName(midiNote);

        const voice = parseInt(noteEl.querySelector('voice')?.textContent ?? '1');

        const startBeat = chordBeat;
        const startSec = beatToSec(startBeat);
        const durationSec = beatToSec(durationBeats);

        notes.push({
          id: `${measureIdx}-${noteIndex}`,
          midiNote,
          pitch,
          startBeat,
          durationBeats,
          startSec,
          durationSec,
          measureIndex: measureIdx,
          noteIndex,
          isChord,
          chordGroupId,
          voice,
        });

        noteIndex++;

        if (!isChord) {
          currentBeat += durationBeats;
        }
      });

      measureIdx++;
    });

    return { notes, totalBeats: currentBeat };
  }
}

export const musicXMLParser = new MusicXMLParser();
import type { NoteEvent, ParsedMusic } from '../types/music';

function getHalfTone(sn: any): number | null {
  const ht =
    sn?.halfTone ??
    sn?.HalfTone ??
    sn?.pitch?.getHalfTone?.() ??
    sn?.pitch?.GetHalfTone?.() ??
    sn?.pitch?.halfTone;
  return typeof ht === 'number' ? ht : null;
}

// Timestamp thường là Fraction/number. Ta cố normalize về number beats (quarterLength)
function toBeat(ts: any): number | null {
  if (ts == null) return null;
  if (typeof ts === 'number') return ts;

  // Fraction trong OSMD thường có RealValue hoặc realValue
  const rv = ts.RealValue ?? ts.realValue ?? ts.realValueStrict;
  if (typeof rv === 'number') return rv;

  // đôi khi là {Numerator, Denominator}
  if (typeof ts.Numerator === 'number' && typeof ts.Denominator === 'number' && ts.Denominator !== 0) {
    return ts.Numerator / ts.Denominator;
  }

  return null;
}

function getTimestampBeat(sn: any): number | null {
  // ưu tiên parentStaffEntry timestamp
  const se = sn?.parentStaffEntry;
  const ts =
    se?.Timestamp ??
    se?.timestamp ??
    sn?.voiceEntry?.Timestamp ??
    sn?.voiceEntry?.timestamp;
  return toBeat(ts);
}

function getDurationBeats(sn: any): number {
  const len = sn?.length;
  const rv = len?.RealValue ?? len?.realValue;
  if (typeof rv === 'number' && rv > 0) return rv;

  // fallback typeLength (ít chuẩn hơn)
  const tl = sn?.typeLength;
  if (typeof tl === 'number' && tl > 0) return tl;

  return 0.25; // fallback cuối
}

function midiToPitchName(midi: number): string {
  const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const octave = Math.floor(midi / 12) - 1;
  return `${names[midi % 12]}${octave}`;
}

/**
 * Extract note events theo timeline chuẩn OSMD.
 * Trả về notes đã sort theo startBeat, và mỗi note có measureIndex theo thứ tự MeasureList (OSMD index).
 */
export function extractParsedMusicFromOSMD(osmd: any): ParsedMusic {
  const notes: NoteEvent[] = [];

  const gs = osmd?.GraphicSheet;
  if (!gs?.MeasureList) {
    return {
      notes: [],
      temposBPM: [{ beat: 0, bpm: 120 }],
      timeSignatures: [{ beat: 0, numerator: 4, denominator: 4 }],
      keySignatures: [{ fifths: 0, mode: 'major', label: 'C major' }],
      totalBeats: 0,
      totalSec: 0,
      divisions: 1,
      title: '',
      composer: '',
    };
  }

  for (let mIdx = 0; mIdx < gs.MeasureList.length; mIdx++) {
    const row = gs.MeasureList[mIdx];
    for (let sIdx = 0; sIdx < row.length; sIdx++) {
      const m = row[sIdx];
      if (!m) continue;

      for (const se of m.staffEntries ?? []) {
        for (const gve of se?.graphicalVoiceEntries ?? []) {
          for (const gn of gve?.notes ?? []) {
            const sn = gn?.sourceNote;
            if (!sn) continue;
            if (sn.isRestFlag) continue;

            const ht = getHalfTone(sn);
            if (ht == null) continue;

            const midi = ht + 12;
            const startBeat = getTimestampBeat(sn);
            if (startBeat == null) continue;

            const durationBeats = getDurationBeats(sn);

            let pitchStr = '';
            try {
              const p = sn?.pitch ?? sn?.Pitch;
              if (p && typeof p.ToString === 'function') {
                const pStr = p.ToString();
                if (typeof pStr === 'string' && /^[A-G]/.test(pStr)) {
                  pitchStr = pStr.replace('-', '');
                }
              }
            } catch(e) {}
            if (!pitchStr) pitchStr = midiToPitchName(midi);

            notes.push({
              id: `${mIdx}-${notes.length}`,
              midiNote: midi,
              pitch: pitchStr,
              startBeat,
              durationBeats,
              // startSec/durationSec sẽ tính sau khi có tempo
              startSec: 0,
              durationSec: 0,
              measureIndex: mIdx, // QUAN TRỌNG: measure index theo OSMD, highlight sẽ khớp
              noteIndex: 0,
              isChord: false, // sẽ tính lại chord group theo startBeat
              chordGroupId: '',
              voice: Number(sn?.voiceEntry?.VoiceId ?? sn?.voiceEntry?.voiceId ?? 1),
            });
          }
        }
      }
    }
  }

  // Sort theo thời gian
  notes.sort((a, b) => a.startBeat - b.startBeat || a.measureIndex - b.measureIndex || a.midiNote - b.midiNote);
  notes.forEach((n, i) => (n.noteIndex = i));

  // Build chordGroupId + isChord
  const EPS = 1e-6;
  let prevStart = -999;
  let groupId = '';
  let groupCount = 0;

  for (let i = 0; i < notes.length; i++) {
    const n = notes[i];
    if (Math.abs(n.startBeat - prevStart) > EPS) {
      prevStart = n.startBeat;
      groupCount++;
      groupId = `beat-${n.startBeat.toFixed(6)}-g${groupCount}`;
      n.isChord = false;
    } else {
      n.isChord = true;
    }
    n.chordGroupId = groupId;
  }

  // Tempo: tạm lấy 120 nếu bạn chưa extract tempo từ OSMD
  const bpm = 120;
  const beatToSec = (beat: number) => (beat / bpm) * 60;

  notes.forEach(n => {
    n.startSec = beatToSec(n.startBeat);
    n.durationSec = beatToSec(n.durationBeats);
  });

  const totalBeats = notes.length ? notes[notes.length - 1].startBeat + notes[notes.length - 1].durationBeats : 0;
  const totalSec = notes.length ? notes[notes.length - 1].startSec + notes[notes.length - 1].durationSec : 0;

  return {
    notes,
    temposBPM: [{ beat: 0, bpm }],
    timeSignatures: [{ beat: 0, numerator: 4, denominator: 4 }],
    keySignatures: [{ fifths: 0, mode: 'major', label: 'C major' }],
    totalBeats,
    totalSec,
    divisions: 1,
    title: '',
    composer: '',
  };
}
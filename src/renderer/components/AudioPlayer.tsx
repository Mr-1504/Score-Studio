import { useState, useEffect, useRef } from 'react';
import Soundfont from 'soundfont-player';
import './AudioPlayer.css';

interface AudioPlayerProps {
    musicXML: string;
    onNotePlay?: (noteIndex: number) => void;
}

interface Note {
    pitch: string;
    midiNote: number;
    duration: number;
    startTime: number;
}

function AudioPlayer({ musicXML, onNotePlay }: AudioPlayerProps) {
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [tempo, setTempo] = useState(120); // BPM
    const [loading, setLoading] = useState(true);
    const [soundfontLoading, setSoundfontLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const instrumentRef = useRef<any>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const notesRef = useRef<Note[]>([]);
    const playbackRef = useRef<number | null>(null);
    const isPlayingRef = useRef(false); // Dùng cái này cho logic core
    const startTimeRef = useRef<number>(0);
    const pauseTimeRef = useRef<number>(0);

    // Parse MusicXML to extract notes
    useEffect(() => {
        const parseMusicXML = () => {
            try {
                setLoading(true);
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(musicXML, 'text/xml');

                const notes: Note[] = [];
                const noteElements = xmlDoc.getElementsByTagName('note');
                let currentTime = 0;

                // Get divisions (timing resolution)
                const divisionsElement = xmlDoc.getElementsByTagName('divisions')[0];
                const divisions = divisionsElement ? parseInt(divisionsElement.textContent || '1') : 1;

                // Get tempo from metronome marking
                const tempoElement = xmlDoc.getElementsByTagName('per-minute')[0];
                const parsedTempo = tempoElement ? parseInt(tempoElement.textContent || '120') : 120;
                setTempo(parsedTempo);

                for (let i = 0; i < noteElements.length; i++) {
                    const noteElement = noteElements[i];

                    // Skip if it's a rest
                    const restElement = noteElement.getElementsByTagName('rest')[0];
                    if (restElement) {
                        const durationElement = noteElement.getElementsByTagName('duration')[0];
                        const duration = durationElement ? parseInt(durationElement.textContent || '0') : 0;
                        currentTime += duration / divisions;
                        continue;
                    }

                    // Get pitch information
                    const pitchElement = noteElement.getElementsByTagName('pitch')[0];
                    if (!pitchElement) continue;

                    const step = pitchElement.getElementsByTagName('step')[0]?.textContent || 'C';
                    const octave = pitchElement.getElementsByTagName('octave')[0]?.textContent || '4';
                    const alter = pitchElement.getElementsByTagName('alter')[0]?.textContent || '0';

                    // Calculate MIDI note number
                    const noteNames: { [key: string]: number } = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
                    const midiNote = (parseInt(octave) + 1) * 12 + noteNames[step] + parseInt(alter);

                    // Get duration
                    const durationElement = noteElement.getElementsByTagName('duration')[0];
                    const noteDuration = durationElement ? parseInt(durationElement.textContent || '0') : 0;

                    const pitch = `${step}${parseInt(alter) > 0 ? '#' : parseInt(alter) < 0 ? 'b' : ''}${octave}`;

                    notes.push({
                        pitch,
                        midiNote,
                        duration: noteDuration / divisions,
                        startTime: currentTime
                    });

                    // Check if it's a chord (chord element present)
                    const chordElement = noteElement.getElementsByTagName('chord')[0];
                    if (!chordElement) {
                        currentTime += noteDuration / divisions;
                    }
                }

                notesRef.current = notes;

                console.log('AudioPlayer parsed notes:', notes.length);
                console.log('First 5 notes:', notes.slice(0, 5).map(n => `${n.pitch} (MIDI ${n.midiNote})`));

                // Calculate total duration in seconds
                if (notes.length > 0) {
                    const lastNote = notes[notes.length - 1];
                    const totalDuration = ((lastNote.startTime + lastNote.duration) * 60) / parsedTempo;
                    setDuration(totalDuration);
                }

                setLoading(false);
            } catch (err) {
                console.error('Error parsing MusicXML:', err);
                setError(`Không thể phân tích bản nhạc: ${err instanceof Error ? err.message : String(err)}`);
                setLoading(false);
            }
        };

        parseMusicXML();
    }, [musicXML]);

    // Load soundfont
    useEffect(() => {
        const loadInstrument = async () => {
            try {
                console.log('Loading soundfont...');
                setSoundfontLoading(true);

                const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
                const ac = new AudioContext();
                audioContextRef.current = ac;

                console.log('AudioContext state:', ac.state);

                const instrument = await Soundfont.instrument(ac, 'acoustic_grand_piano');
                instrumentRef.current = instrument;
                setSoundfontLoading(false);
                console.log('Soundfont loaded successfully!');
                console.log('AudioContext state after load:', ac.state);
            } catch (err) {
                console.error('Error loading soundfont:', err);
                setSoundfontLoading(false);
                setError('Không thể tải âm thanh piano. Kiểm tra kết nối internet.');
            }
        };

        loadInstrument();

        return () => {
            if (instrumentRef.current) {
                // Cleanup if needed
            }
        };
    }, []);

    // Playback logic
    const scheduleNote = (note: Note, delay: number) => {
        if (!instrumentRef.current) {
            console.error('Instrument not available for note scheduling');
            return;
        }

        setTimeout(() => {
            if (instrumentRef.current && isPlayingRef.current) {
                const noteDurationSec = (note.duration * 60) / tempo;
                const noteIndex = notesRef.current.indexOf(note);
                
                console.log('Playing note:', note.pitch, 'MIDI:', note.midiNote, 'at time:', delay, 's');

                // Call highlight BEFORE playing to reduce visual delay
                if (onNotePlay) {
                    onNotePlay(noteIndex);
                }

                try {
                    instrumentRef.current.play(note.midiNote, audioContextRef.current?.currentTime, { duration: noteDurationSec });
                } catch (err) {
                    console.error('Error playing note:', err);
                }
            }
        }, delay * 1000);
    };

    const startPlayback = () => {
        console.log('Starting playback...');

        if (!instrumentRef.current) {
            console.error('No instrument loaded!');
            return;
        }

        if (notesRef.current.length === 0) {
            console.error('No notes to play!');
            return;
        }

        console.log('Playing', notesRef.current.length, 'notes');

        // setIsPlaying(true);
        // const startOffset = pauseTimeRef.current;
        // startTimeRef.current = Date.now() - startOffset * 1000;

        setIsPlaying(true);
        isPlayingRef.current = true; // Cập nhật ref ngay lập tức

        const startOffset = pauseTimeRef.current;
        startTimeRef.current = Date.now() - startOffset * 1000;

        notesRef.current.forEach(note => {
            const noteStartTime = (note.startTime * 60) / tempo;
            if (noteStartTime >= startOffset) {
                scheduleNote(note, noteStartTime - startOffset);
            }
        });

        // Update current time during playback
        // const updateTime = () => {
        //     if (isPlaying) {
        //         const elapsed = (Date.now() - startTimeRef.current) / 1000;
        //         setCurrentTime(elapsed);

        //         if (elapsed >= duration) {
        //             stopPlayback();
        //         } else {
        //             playbackRef.current = requestAnimationFrame(updateTime);
        //         }
        //     }
        // };

        // playbackRef.current = requestAnimationFrame(updateTime);
        const updateTime = () => {
            if (isPlayingRef.current) { // Dùng Ref ở đây
                const elapsed = (Date.now() - startTimeRef.current) / 1000;
                setCurrentTime(elapsed);

                if (elapsed >= duration) {
                    stopPlayback();
                } else {
                    playbackRef.current = requestAnimationFrame(updateTime);
                }
            }
        };
        playbackRef.current = requestAnimationFrame(updateTime);
    };

    // const pausePlayback = () => {
    //     setIsPlaying(false);
    //     pauseTimeRef.current = currentTime;

    //     if (playbackRef.current) {
    //         cancelAnimationFrame(playbackRef.current);
    //         playbackRef.current = null;
    //     }
    // };

    const pausePlayback = () => {
        setIsPlaying(false);
        isPlayingRef.current = false; // Dừng loop ngay lập tức
        pauseTimeRef.current = currentTime;
        if (playbackRef.current) {
            cancelAnimationFrame(playbackRef.current);
        }
    };

    const stopPlayback = () => {
        setIsPlaying(false);
        setCurrentTime(0);
        pauseTimeRef.current = 0;

        if (playbackRef.current) {
            cancelAnimationFrame(playbackRef.current);
            playbackRef.current = null;
        }
    };

    const handlePlayPause = async () => {
        console.log('=== PLAY BUTTON CLICKED ===');
        console.log('Play/Pause clicked');
        console.log('Instrument loaded:', !!instrumentRef.current);
        console.log('Notes count:', notesRef.current.length);
        console.log('Is playing:', isPlaying);
        console.log('Soundfont loading:', soundfontLoading);

        if (!instrumentRef.current) {
            console.error('No instrument! Showing alert...');
            alert('Soundfont chưa load xong. Vui lòng đợi...');
            return;
        }

        // Resume AudioContext if suspended
        if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
            console.log('AudioContext is suspended, resuming...');
            await audioContextRef.current.resume();
            console.log('AudioContext resumed, state:', audioContextRef.current.state);
        }

        if (isPlaying) {
            console.log('Pausing...');
            pausePlayback();
        } else {
            console.log('Starting playback...');
            startPlayback();
        }
    };

    const handleStop = () => {
        stopPlayback();
    };

    const handleTempoChange = (newTempo: number) => {
        const wasPlaying = isPlaying;
        if (wasPlaying) {
            pausePlayback();
        }
        setTempo(newTempo);

        // Recalculate duration
        if (notesRef.current.length > 0) {
            const lastNote = notesRef.current[notesRef.current.length - 1];
            const totalDuration = ((lastNote.startTime + lastNote.duration) * 60) / newTempo;
            setDuration(totalDuration);
        }
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    if (loading) {
        return (
            <div className="audio-player loading">
                <p>Đang chuẩn bị phát nhạc...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="audio-player error">
                <p>❌ {error}</p>
            </div>
        );
    }

    return (
        <div className="audio-player">
            <div className="player-header">
                <h3>🎹 Piano Player</h3>
                <div className="player-status">
                    {soundfontLoading && (
                        <span className="soundfont-loading">⏳ Đang tải âm thanh piano...</span>
                    )}
                    {!soundfontLoading && (
                        <span className="note-count">{notesRef.current.length} nốt nhạc</span>
                    )}
                </div>
            </div>

            <div className="player-controls">
                <button
                    onClick={handlePlayPause}
                    className="control-btn play-pause"
                    disabled={soundfontLoading || !instrumentRef.current}
                    title={soundfontLoading ? 'Đang tải âm thanh piano...' : ''}
                >
                    {soundfontLoading ? '⏳ Loading...' : isPlaying ? '⏸️ Pause' : '▶️ Play'}
                </button>

                <button
                    onClick={handleStop}
                    className="control-btn stop"
                    disabled={!isPlaying && currentTime === 0}
                >
                    ⏹️ Stop
                </button>

                <div className="time-display">
                    <span className="current-time">{formatTime(currentTime)}</span>
                    <span className="separator">/</span>
                    <span className="total-time">{formatTime(duration)}</span>
                </div>
            </div>

            <div className="progress-section">
                <input
                    type="range"
                    min="0"
                    max={duration || 100}
                    value={currentTime}
                    onChange={(e) => {
                        const newTime = parseFloat(e.target.value);
                        setCurrentTime(newTime);
                        pauseTimeRef.current = newTime;
                    }}
                    className="progress-slider"
                />
            </div>

            <div className="tempo-control">
                <label>Tempo: {tempo} BPM</label>
                <input
                    type="range"
                    min="40"
                    max="200"
                    value={tempo}
                    onChange={(e) => handleTempoChange(parseInt(e.target.value))}
                    className="tempo-slider"
                />
            </div>
        </div>
    );
}

export default AudioPlayer;

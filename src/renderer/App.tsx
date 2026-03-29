import { useState, useEffect } from 'react';
import './App.css';
import SmartSheetViewer from './components/SmartSheetViewer';
import PlaybackBar from './components/PlaybackBar';
import PianoKeyboard from './components/PianoKeyboard';
import FallingNotes from './components/FallingNotes';
import ModeToggle from './components/ModeToggle';
import ScorePanel from './components/ScorePanel';
import ResultModal from './components/ResultModal';
import LibrarySidebar from './components/LibrarySidebar';
import SongMetaPanel from './components/SongMetaPanel';
import { useLoadXML } from './store/usePlaybackStore';
import { usePracticeMode, usePracticeStore } from './store/usePracticeStore';
import { useLibraryStore, type Song } from './store/useLibraryStore';
import { bridgePlay } from './store/bridge';
import type { EngineType, MusicData } from './types';

function App() {
  const [engine, setEngine] = useState<EngineType>('AUDIVERIS_XML');
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [conversionState, setConversionState] = useState({
    status: 'idle', message: 'Chọn ảnh sheet nhạc để bắt đầu', progress: 0,
  });
  const [musicData, setMusicData] = useState<MusicData | null>(null);
  const [activeSongId, setActiveSongId] = useState<string | null>(null);

  const loadXML = useLoadXML();
  const practiceMode = usePracticeMode();
  const isReady = !!musicData && conversionState.status === 'ready';

  const { addSong, addSession } = useLibraryStore.getState();

  // Lưu session khi kết thúc
  useEffect(() => {
    const unsub = usePracticeStore.subscribe(
      s => s.sessionEnded,
      (ended) => {
        if (!ended || !activeSongId) return;
        const stats = usePracticeStore.getState().finalStats;
        if (!stats || stats.totalNotes === 0) return;
        const mode = usePracticeStore.getState().mode as 'follow' | 'step';
        addSession({ songId: activeSongId, mode, stats, durationSec: 0 });
        console.log('[App] session saved for song:', activeSongId);
      },
    );
    return unsub;
  }, [activeSongId, addSession]);

  useEffect(() => {
    const handleProgress = (data: any) => {
      if (!data) return;
      setConversionState(prev => ({
        status: data.status === 'FAILED' ? 'error' : 'processing',
        message: data.message || 'Đang xử lý...',
        progress: data.progress || prev.progress,
      }));
    };
    window.electron?.ipcRenderer?.on?.('conversion-progress', handleProgress);
    return () => window.electron?.ipcRenderer?.removeListener?.('conversion-progress', handleProgress);
  }, []);

  const handleSelectFiles = async () => {
    try {
      const files = await window.electron.selectImageFiles();
      if (files?.length) {
        setSelectedFiles(files);
        setConversionState({ status: 'idle', message: `Đã chọn ${files.length} file.`, progress: 0 });
      }
    } catch (e) {
      setConversionState({ status: 'error', message: `Lỗi: ${e}`, progress: 0 });
    }
  };

  const handleConvert = async () => {
    if (!selectedFiles.length) return;
    try {
      setConversionState({ status: 'processing', message: 'Đang gửi dữ liệu...', progress: 10 });
      const result = await window.electron.uploadAndConvert(selectedFiles[0], engine);

      if (engine === 'AUDIVERIS_XML') {
        setConversionState({ status: 'processing', message: 'Đang tải MusicXML...', progress: 90 });
        const dl = await window.electron.downloadMusicXML(result.jobId);
        if (dl.success) {
          const data: MusicData = { rawContent: dl.xmlContent, format: 'xml' };
          setMusicData(data);
          loadXML(dl.xmlContent);
          setConversionState({ status: 'ready', message: 'Sẵn sàng!', progress: 100 });

          // Lưu vào library — parse title từ XML
          const parser = new DOMParser();
          const doc = parser.parseFromString(dl.xmlContent, 'application/xml');
          const title = doc.querySelector('work-title, movement-title')?.textContent?.trim() ?? 'Untitled';
          const composer = doc.querySelector('creator[type="composer"]')?.textContent?.trim() ?? '';
          const noteCount = doc.querySelectorAll('note:not([grace])').length;

          const song = addSong({
            title, composer, format: 'xml',
            rawContent: dl.xmlContent,
            totalNotes: noteCount,
          });
          setActiveSongId(song.id);
          useLibraryStore.getState().setActiveSong(song.id);
        }
      } else {
        const mockKern = `**kern\n*clefG2\n*k[f#]\n*M4/4\n=1\n4c\n4d\n4e\n4f\n==\n*-`;
        setMusicData({ rawContent: mockKern, format: 'kern' });
        setConversionState({ status: 'ready', message: 'Sẵn sàng!', progress: 100 });
      }
    } catch (e: any) {
      setConversionState({ status: 'error', message: `Lỗi: ${e.message}`, progress: 0 });
    }
  };

  // Mở bài từ library
  const handleOpenSong = (song: Song) => {
    setMusicData({ rawContent: song.rawContent, format: song.format });
    loadXML(song.rawContent);
    setActiveSongId(song.id);
    useLibraryStore.getState().setActiveSong(song.id);
    setConversionState({ status: 'ready', message: `Đã mở: ${song.title}`, progress: 100 });
  };

  return (
    <div className="app-layout">

      {/* SIDEBAR TRÁI: Library + Convert controls */}
      <aside className="sidebar">
        <div className="brand">
          <h1>Score Studio</h1>
          <p>Sheet Music Engine</p>
        </div>

        {/* Convert section */}
        <div className="controls-section">
          <div className="form-group">
            <label>Engine</label>
            <select className="engine-select" value={engine}
              onChange={e => setEngine(e.target.value as EngineType)}
              disabled={conversionState.status === 'processing'}>
              <option value="AUDIVERIS_XML">Audiveris (MusicXML)</option>
              <option value="CUSTOM_MODEL_KERN">Custom Model (**kern)</option>
            </select>
          </div>
          <div className="form-group">
            <button onClick={handleSelectFiles} className="btn btn-outline"
              disabled={conversionState.status === 'processing'}>
              📄 Chọn ảnh
            </button>
            {selectedFiles.length > 0 && (
              <div className="file-list">✓ {selectedFiles[0].split(/[/\\]/).pop()}</div>
            )}
          </div>
          <button onClick={handleConvert} className="btn btn-primary"
            disabled={!selectedFiles.length || conversionState.status === 'processing'}>
            {conversionState.status === 'processing' ? 'Đang xử lý...' : 'Convert & Thêm vào thư viện'}
          </button>
          <div className={`status-box status-${conversionState.status}`}>
            <div>{conversionState.message}</div>
            {conversionState.progress > 0 && conversionState.progress < 100 && (
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${conversionState.progress}%` }} />
              </div>
            )}
          </div>
        </div>

        {/* Library list */}
        {/* Metadata bài đang mở */}
        {isReady && <SongMetaPanel />}

        <div className="sidebar-section-title">Thư viện</div>
        <div className="library-container">
          <LibrarySidebar onOpenSong={handleOpenSong} />
        </div>
      </aside>

      {/* MAIN AREA */}
      <div className="main-area">
        {isReady && (
          <div className="top-toolbar">
            <ModeToggle />
          </div>
        )}
        <div className="content-row">
          <div className="workspace-column">
            <main className="workspace">
              {isReady ? (
                <div className="sheet-area">
                  <SmartSheetViewer musicData={musicData!} />
                </div>
              ) : (
                <div className="empty-state">
                  <svg width="64" height="64" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="1">
                    <path d="M9 18V5l12-2v13" />
                    <circle cx="6" cy="18" r="3" />
                    <circle cx="18" cy="16" r="3" />
                  </svg>
                  <p>Chọn bài từ thư viện hoặc convert ảnh mới</p>
                </div>
              )}
            </main>
            {isReady && (
              <div className="piano-area">
                <div style={{ width: 'max-content', margin: '0 auto' }}>
                  <FallingNotes />
                  <PianoKeyboard />
                </div>
              </div>
            )}
            {isReady && <PlaybackBar onPlay={bridgePlay} />}
          </div>
          {isReady && practiceMode !== 'view' && <ScorePanel />}
        </div>
      </div>

      <ResultModal />
    </div>
  );
}

export default App;
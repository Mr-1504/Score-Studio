// src/renderer/App.tsx — Phase 2
// Thêm: ModeToggle, ScorePanel, ResultModal

import { useState, useEffect } from 'react';
import './App.css';
import SmartSheetViewer from './components/SmartSheetViewer';
import PlaybackBar from './components/PlaybackBar';
import PianoKeyboard from './components/PianoKeyboard';
import ModeToggle from './components/ModeToggle';
import ScorePanel from './components/ScorePanel';
import ResultModal from './components/ResultModal';
import { useLoadXML } from './store/usePlaybackStore';
import { usePracticeMode } from './store/usePracticeStore';
import type { EngineType, MusicData } from './types';

function App() {
  const [engine, setEngine] = useState<EngineType>('AUDIVERIS_XML');
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [conversionState, setConversionState] = useState({
    status: 'idle', message: 'Chọn ảnh sheet nhạc để bắt đầu', progress: 0,
  });
  const [musicData, setMusicData] = useState<MusicData | null>(null);

  const loadXML    = useLoadXML();
  const practiceMode = usePracticeMode();
  const isReady    = musicData && conversionState.status === 'ready';

  useEffect(() => {
    const handleProgress = (data: any) => {
      if (!data) return;
      setConversionState(prev => ({
        status:   'processing',
        message:  data.message || 'Đang xử lý...',
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
    } catch (error) {
      setConversionState({ status: 'error', message: `Lỗi: ${error}`, progress: 0 });
    }
  };

  const handleConvert = async () => {
    if (!selectedFiles.length) return;
    try {
      setConversionState({ status: 'processing', message: 'Đang gửi dữ liệu...', progress: 10 });
      const convertResult = await window.electron.uploadAndConvert(selectedFiles[0], engine);

      if (engine === 'AUDIVERIS_XML') {
        setConversionState({ status: 'processing', message: 'Đang tải file MusicXML...', progress: 90 });
        const dl = await window.electron.downloadMusicXML(convertResult.jobId);
        if (dl.success) {
          const data: MusicData = { rawContent: dl.xmlContent, format: 'xml' };
          setMusicData(data);
          loadXML(dl.xmlContent);
          setConversionState({ status: 'ready', message: 'Sẵn sàng phát nhạc!', progress: 100 });
        }
      } else {
        const mockKern = `**kern\n*clefG2\n*k[f#]\n*M4/4\n=1\n4c\n4d\n4e\n4f\n==\n*-`;
        setMusicData({ rawContent: mockKern, format: 'kern' });
        setConversionState({ status: 'ready', message: 'Dữ liệu AI đã sẵn sàng!', progress: 100 });
      }
    } catch (error: any) {
      setConversionState({ status: 'error', message: `Lỗi: ${error.message}`, progress: 0 });
    }
  };

  return (
    <div className="app-layout">

      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="brand">
          <h1>Score Studio</h1>
          <p>Sheet Music Engine</p>
        </div>

        <div className="controls-section">
          <div className="form-group">
            <label>Processing Engine</label>
            <select
              className="engine-select"
              value={engine}
              onChange={e => setEngine(e.target.value as EngineType)}
              disabled={conversionState.status === 'processing'}
            >
              <option value="AUDIVERIS_XML">Audiveris (MusicXML)</option>
              <option value="CUSTOM_MODEL_KERN">Custom Model (**kern)</option>
            </select>
          </div>

          <div className="form-group">
            <label>Input File</label>
            <button
              onClick={handleSelectFiles}
              className="btn btn-outline"
              disabled={conversionState.status === 'processing'}
            >
              📄 Chọn ảnh Sheet nhạc
            </button>
            {selectedFiles.length > 0 && (
              <div className="file-list">✓ {selectedFiles[0].split(/[/\\]/).pop()}</div>
            )}
          </div>

          <button
            onClick={handleConvert}
            className="btn btn-primary"
            disabled={!selectedFiles.length || conversionState.status === 'processing'}
          >
            {conversionState.status === 'processing' ? 'Đang xử lý...' : 'Bắt đầu Chuyển đổi'}
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
      </aside>

      {/* MAIN AREA = toolbar + sheet + piano + playbar + score panel */}
      <div className="main-area">

        {/* Top toolbar: mode toggle */}
        {isReady && (
          <div className="top-toolbar">
            <ModeToggle />
          </div>
        )}

        {/* Content row: sheet + score panel */}
        <div className="content-row">
          <div className="workspace-column">
            <main className="workspace">
              {isReady ? (
                <div className="sheet-area">
                  <SmartSheetViewer musicData={musicData} />
                </div>
              ) : (
                <div className="empty-state">
                  <svg width="64" height="64" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 18V5l12-2v13"/>
                    <circle cx="6" cy="18" r="3"/>
                    <circle cx="18" cy="16" r="3"/>
                  </svg>
                  <p>Không gian làm việc trống. Hãy tải lên một bản nhạc.</p>
                </div>
              )}
            </main>

            {isReady && (
              <div className="piano-area">
                <PianoKeyboard />
              </div>
            )}

            {isReady && <PlaybackBar />}
          </div>

          {/* Score panel — chỉ hiện khi practice mode */}
          {isReady && practiceMode !== 'view' && <ScorePanel />}
        </div>
      </div>

      {/* Result modal (global) */}
      <ResultModal />
    </div>
  );
}

export default App;
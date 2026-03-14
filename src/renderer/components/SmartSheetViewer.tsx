import { forwardRef } from 'react';
import SheetMusicViewer from './SheetMusicViewer';
import type { MusicData } from '../types';

interface SmartSheetViewerProps {
  musicData: MusicData;
  currentNoteIndex?: number;
}

const SmartSheetViewer = forwardRef(({ musicData, currentNoteIndex = -1 }: SmartSheetViewerProps, ref) => {
  if (musicData.format === 'xml') {
    return <SheetMusicViewer ref={ref} musicXML={musicData.rawContent} currentNoteIndex={currentNoteIndex} />;
  }

  if (musicData.format === 'kern') {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h3>Hiển thị định dạng **kern</h3>
        <p>Cần tích hợp thư viện Verovio để render Humdrum/Kern data.</p>
        <pre style={{ textAlign: 'left', background: '#f1f5f9', padding: '1rem', overflow: 'auto', maxHeight: '300px' }}>
          {musicData.rawContent}
        </pre>
      </div>
    );
  }

  return <div>Định dạng không được hỗ trợ</div>;
});

SmartSheetViewer.displayName = 'SmartSheetViewer';
export default SmartSheetViewer;
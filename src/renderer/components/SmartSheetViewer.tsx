import { forwardRef } from 'react';
import SheetMusicViewer from './SheetMusicViewer';
import type { MusicData } from '../types';

interface SmartSheetViewerProps {
  musicData: MusicData;
}

const SmartSheetViewer = forwardRef(({ musicData }: SmartSheetViewerProps, ref) => {
  if (musicData.format === 'xml') {
    return <SheetMusicViewer ref={ref as any} musicXML={musicData.rawContent} />;
  }

  if (musicData.format === 'kern') {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#a1a1aa' }}>
        <h3 style={{ color: '#e4e4e7' }}>Hiển thị định dạng **kern</h3>
        <p>Cần tích hợp Verovio để render. Hiện đang hiển thị raw data:</p>
        <pre style={{
          textAlign: 'left', background: '#18181b', padding: '1rem',
          overflow: 'auto', maxHeight: '300px', borderRadius: '8px',
          fontSize: '12px', color: '#a1a1aa',
        }}>
          {musicData.rawContent}
        </pre>
      </div>
    );
  }

  return <div style={{ color: '#ef4444' }}>Định dạng không được hỗ trợ</div>;
});

SmartSheetViewer.displayName = 'SmartSheetViewer';
export default SmartSheetViewer;
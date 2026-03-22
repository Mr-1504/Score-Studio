import { forwardRef } from 'react';
import SheetMusicViewer from './SheetMusicViewer';
import type { MusicData } from '../types';

interface SmartSheetViewerProps {
  musicData: MusicData;
}

const SmartSheetViewer = forwardRef(({ musicData }: SmartSheetViewerProps, ref) => {
  if (musicData.format === 'xml') {
    return <SheetMusicViewer ref={ref} musicXML={musicData.rawContent} />;
  }

  if (musicData.format === 'kern') {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#8e8e93' }}>
        <p style={{ fontSize: 13 }}>Định dạng **kern — chưa hỗ trợ render (cần Verovio)</p>
        <pre style={{
          textAlign: 'left', background: '#2c2c2e', color: '#c7c7cc',
          padding: '1rem', borderRadius: 8, overflow: 'auto',
          maxHeight: 300, fontSize: 11,
        }}>
          {musicData.rawContent}
        </pre>
      </div>
    );
  }

  return <div style={{ color: '#636366', padding: '2rem' }}>Định dạng không hỗ trợ</div>;
});

SmartSheetViewer.displayName = 'SmartSheetViewer';
export default SmartSheetViewer;
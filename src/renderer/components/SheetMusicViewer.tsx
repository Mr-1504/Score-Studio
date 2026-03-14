import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import './SheetMusicViewer.css';

interface SheetMusicViewerProps {
  musicXML: string;
  currentNoteIndex?: number;
}

const SheetMusicViewer = forwardRef(({ musicXML, currentNoteIndex = -1 }: SheetMusicViewerProps, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1.0);
  const highlightedElementsRef = useRef<SVGElement[]>([]);
  const graphicalNotesRef = useRef<any[]>([]);

  useEffect(() => {
    if (!containerRef.current || !musicXML) return;

    const loadMusicXML = async () => {
      try {
        setLoading(true);
        setError(null);

        // Clear previous content
        if (containerRef.current) {
          containerRef.current.innerHTML = '';
        }

        if (!containerRef.current) return;

        // Initialize OpenSheetMusicDisplay
        const osmd = new OpenSheetMusicDisplay(containerRef.current, {
          autoResize: true,
          backend: 'svg',
          drawTitle: true,
          drawComposer: true,
          drawLyricist: true,
          drawCredits: true,
          drawPartNames: true,
          drawingParameters: 'compact',
        });

        // Load MusicXML string
        await osmd.load(musicXML);
        osmd.zoom = zoom;
        osmd.render();

        osmdRef.current = osmd;

        // Extract all graphical notes from OSMD's internal structure
        // This ensures the order matches the logical order in the XML
        const graphicalNotes: any[] = [];
        if (osmd.GraphicSheet && osmd.GraphicSheet.MeasureList) {
          for (const measureList of osmd.GraphicSheet.MeasureList) {
            for (const measure of measureList) {
              for (const staffEntry of measure.staffEntries) {
                for (const voiceEntry of staffEntry.graphicalVoiceEntries) {
                  for (const note of voiceEntry.notes) {
                    graphicalNotes.push(note);
                  }
                }
              }
            }
          }
        }
        graphicalNotesRef.current = graphicalNotes;
        console.log('Extracted graphical notes:', graphicalNotes.length);

        setLoading(false);

      } catch (err) {
        console.error('Error loading MusicXML:', err);
        setError(`Không thể hiển thị bản nhạc: ${err instanceof Error ? err.message : String(err)}`);
        setLoading(false);
      }
    };

    loadMusicXML();

    return () => {
      osmdRef.current = null;
    };
  }, [musicXML]);

  useEffect(() => {
    if (osmdRef.current) {
      osmdRef.current.zoom = zoom;
      osmdRef.current.render();
    }
  }, [zoom]);

  // Highlight current note using OSMD's GraphicalModel
  useEffect(() => {
    if (!osmdRef.current || currentNoteIndex < 0 || graphicalNotesRef.current.length === 0) return;

    try {
      // Clear previous highlights
      highlightedElementsRef.current.forEach(el => {
        el.style.fill = '';
        el.style.opacity = '';
      });
      highlightedElementsRef.current = [];

      // Get the graphical note at the current index
      const graphicalNote = graphicalNotesRef.current[currentNoteIndex];
      if (!graphicalNote) {
        console.warn('No graphical note found at index:', currentNoteIndex);
        return;
      }

      // Get the SVG element directly from the graphical note
      const svgElement = graphicalNote.getSVGGElement?.() || graphicalNote.getSVGElement?.();
      if (!svgElement) {
        console.warn('No SVG element found for note at index:', currentNoteIndex);
        return;
      }

      // Highlight the note by modifying its SVG element
      // Find the notehead path within the group
      const noteheadPath = svgElement.querySelector('path, circle, ellipse');
      if (noteheadPath) {
        const originalFill = noteheadPath.getAttribute('fill') || '';
        noteheadPath.setAttribute('data-original-fill', originalFill);
        noteheadPath.setAttribute('fill', '#ff6b6b');
        noteheadPath.setAttribute('opacity', '0.9');
        
        highlightedElementsRef.current.push(noteheadPath as SVGElement);
        
        // Scroll to the note
        svgElement.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
        
        console.log('Highlighted note at index:', currentNoteIndex, 'using OSMD GraphicalModel');
      }
    } catch (err) {
      console.error('Error highlighting note:', err);
    }
  }, [currentNoteIndex]);

  useImperativeHandle(ref, () => ({
    highlightNote: (index: number) => {
      console.log('Highlighting note index:', index);
      // Additional highlight logic if needed
    }
  }));

  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev + 0.1, 2.0));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev - 0.1, 0.5));
  };

  const handleZoomReset = () => {
    setZoom(1.0);
  };

  return (
    <div className="sheet-music-viewer">
      <div className="viewer-controls">
        <div className="zoom-controls">
          <button onClick={handleZoomOut} className="zoom-btn" title="Zoom Out">
            🔍−
          </button>
          <span className="zoom-level">{Math.round(zoom * 100)}%</span>
          <button onClick={handleZoomIn} className="zoom-btn" title="Zoom In">
            🔍+
          </button>
          <button onClick={handleZoomReset} className="zoom-btn" title="Reset Zoom">
            Reset
          </button>
        </div>
      </div>

      <div className="viewer-content">
        {loading && (
          <div className="viewer-loading">
            <div className="spinner"></div>
            <p>Đang tải bản nhạc...</p>
          </div>
        )}

        {error && (
          <div className="viewer-error">
            <p>❌ {error}</p>
          </div>
        )}

        <div 
          ref={containerRef} 
          className="sheet-music-container"
          style={{ display: loading || error ? 'none' : 'block' }}
        />
      </div>
    </div>
  );
});

SheetMusicViewer.displayName = 'SheetMusicViewer';

export default SheetMusicViewer;

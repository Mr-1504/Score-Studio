import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import { useCurrentNoteIndex } from '../store/usePlaybackStore';
import { usePracticeMode } from '../store/usePracticeStore';
import { useLibraryStore } from '../store/useLibraryStore';
import './SheetMusicViewer.css';

// Màu highlight
const COLOR_CURRENT  = '#4a9eff';
const COLOR_OPACITY  = '1';

interface SheetMusicViewerProps {
  musicXML: string;
}

const SheetMusicViewer = forwardRef(({ musicXML }: SheetMusicViewerProps, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const osmdRef      = useRef<OpenSheetMusicDisplay | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [zoom,    setZoom]    = useState(1.0);
  const zoomRef = useRef(1.0);

  // Highlight tracking
  const graphicalNotesRef  = useRef<any[]>([]);
  const highlightedRef     = useRef<{ el: Element; origFill: string; origOpacity: string }[]>([]);
  const prevNoteIdxRef     = useRef(-1);

  // Store state
  const currentNoteIndex = useCurrentNoteIndex();
  const practiceMode     = usePracticeMode();

  // Title từ Library (reactive khi user sửa tên)
  const activeSongId = useLibraryStore(s => s.activeSongId);
  const songTitle    = useLibraryStore(s =>
    s.songs.find(song => song.id === activeSongId)?.title ?? ''
  );

  // ── Load OSMD ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!musicXML) return;
    let cancelled = false;
    let observer: ResizeObserver | null = null;

    const doLoad = async (container: HTMLDivElement) => {
      if (cancelled) return;
      container.innerHTML = '';
      osmdRef.current = null;
      graphicalNotesRef.current = [];
      prevNoteIdxRef.current = -1;
      // prevUpcomingRef.current = [];
      highlightedRef.current = [];

      setLoading(true);
      setError(null);

      try {
        const osmd = new OpenSheetMusicDisplay(container, {
          autoResize:        true,
          backend:           'svg',
          drawTitle:         false,  // tự render title từ LibraryStore
          drawComposer:      false,
          drawingParameters: 'default',
        });
        await osmd.load(musicXML);
        if (cancelled) return;

        osmd.zoom = zoomRef.current;
        osmd.render();
        osmdRef.current = osmd;

        // Extract graphical notes
        const gNotes: any[] = [];
        try {
          const gs = (osmd as any).GraphicSheet;
          if (gs?.MeasureList) {
            for (const row of gs.MeasureList) {
              for (const m of row) {
                for (const se of m?.staffEntries ?? []) {
                  for (const gve of se?.graphicalVoiceEntries ?? []) {
                    for (const n of gve?.notes ?? []) gNotes.push(n);
                  }
                }
              }
            }
          }
        } catch (_) {}
        graphicalNotesRef.current = gNotes;
        if (!cancelled) setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(`Lỗi: ${err instanceof Error ? err.message : String(err)}`);
          setLoading(false);
        }
      }
    };

    const tryLoad = () => {
      const container = containerRef.current;
      if (!container) return;
      if (container.offsetWidth > 0) {
        observer?.disconnect();
        doLoad(container);
      } else {
        observer = new ResizeObserver(entries => {
          if (entries[0].contentRect.width > 0) {
            observer?.disconnect();
            doLoad(container);
          }
        });
        observer.observe(container);
      }
    };

    const raf = requestAnimationFrame(tryLoad);
    return () => { cancelled = true; cancelAnimationFrame(raf); observer?.disconnect(); };
  }, [musicXML]);

  // ── Zoom ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    zoomRef.current = zoom;
    if (osmdRef.current) { osmdRef.current.zoom = zoom; osmdRef.current.render(); }
  }, [zoom]);

  useEffect(() => {
    const el = containerRef.current?.parentElement;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setZoom(z => Math.min(2.0, Math.max(0.4, z - e.deltaY * 0.001)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // ── Highlight helpers ─────────────────────────────────────────────────────

  const clearHighlights = () => {
    highlightedRef.current.forEach(({ el, origFill, origOpacity }) => {
      (el as SVGElement).style.fill    = origFill;
      (el as SVGElement).style.opacity = origOpacity;
      (el as SVGElement).style.filter  = '';
    });
    highlightedRef.current = [];
  };

  const highlightNote = (noteIndex: number, color: string, scroll = false) => {
    const gNote = graphicalNotesRef.current[noteIndex];
    if (!gNote) return;
    try {
      const svgEl = gNote.getSVGGElement?.() ?? gNote.getSVGElement?.();
      if (!svgEl) return;
      svgEl.querySelectorAll('path, ellipse, circle').forEach((el: Element) => {
        const svg = el as SVGElement;
        const origFill    = svg.style.fill    || svg.getAttribute('fill')    || '';
        const origOpacity = svg.style.opacity || svg.getAttribute('opacity') || '';
        svg.style.fill    = color;
        svg.style.opacity = COLOR_OPACITY;
        if (color === COLOR_CURRENT) {
          svg.style.filter = 'drop-shadow(0 0 4px rgba(74,158,255,0.7))';
        }
        highlightedRef.current.push({ el, origFill, origOpacity });
      });
      if (scroll) {
        svgEl.scrollIntoView?.({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    } catch (_) {}
  };

  // ── Sync highlights khi currentNoteIndex hoặc expectedMidi thay đổi ──────

  useEffect(() => {
    if (loading || !osmdRef.current) return;

    const sameNote = currentNoteIndex === prevNoteIdxRef.current;
    if (sameNote) return;

    prevNoteIdxRef.current = currentNoteIndex;

    clearHighlights();

    // Highlight current note (xanh lam, scroll)
    if (currentNoteIndex >= 0) {
      highlightNote(currentNoteIndex, COLOR_CURRENT, true);
    }
  }, [currentNoteIndex, practiceMode, loading]);

  // ── Imperative handle ─────────────────────────────────────────────────────

  useImperativeHandle(ref, () => ({
    scrollToCurrentNote: () => {
      const gn = graphicalNotesRef.current[currentNoteIndex];
      const el = gn?.getSVGGElement?.() ?? gn?.getSVGElement?.();
      el?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    },
  }));

  return (
    <div className="sheet-music-viewer">
      <div className="viewer-controls">
        <div className="zoom-controls">
          <button className="zoom-btn" onClick={() => setZoom(z => Math.max(0.4, +(z - 0.1).toFixed(1)))}>−</button>
          <span className="zoom-level">{Math.round(zoom * 100)}%</span>
          <button className="zoom-btn" onClick={() => setZoom(z => Math.min(2.0, +(z + 0.1).toFixed(1)))}>+</button>
          <button className="zoom-btn" onClick={() => setZoom(1.0)}>Reset</button>
        </div>

      </div>

      <div className="viewer-content">
        {/* Custom title — reactive với LibraryStore */}
        {songTitle && !loading && !error && (
          <div className="sheet-custom-title">{songTitle}</div>
        )}

        {loading && (
          <div className="viewer-loading">
            <div className="spinner"/>
            <p>Đang tải bản nhạc…</p>
          </div>
        )}
        {error && <div className="viewer-error"><p>⚠ {error}</p></div>}
        <div
          ref={containerRef}
          className="sheet-music-container"
          style={{ visibility: loading || error ? 'hidden' : 'visible', minHeight: 200 }}
        />
      </div>
    </div>
  );
});

SheetMusicViewer.displayName = 'SheetMusicViewer';
export default SheetMusicViewer;
import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import { useCurrentNoteIndex } from '../store/usePlaybackStore';
import './SheetMusicViewer.css';

interface SheetMusicViewerProps {
  musicXML: string;
}

export interface SheetMusicViewerHandle {
  scrollToCurrentNote: () => void;
}

const SheetMusicViewer = forwardRef<SheetMusicViewerHandle, SheetMusicViewerProps>(
  ({ musicXML }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const osmdRef      = useRef<OpenSheetMusicDisplay | null>(null);
    const [loading, setLoading]   = useState(true);
    const [error,   setError]     = useState<string | null>(null);
    const [zoom,    setZoom]      = useState(1.0);
    const zoomRef = useRef(zoom);

    const graphicalNotesRef  = useRef<any[]>([]);
    const highlightedRef     = useRef<{ el: SVGElement; orig: string }[]>([]);
    const prevIndexRef       = useRef<number>(-1);

    const currentNoteIndex = useCurrentNoteIndex();

    // ── Load OSMD — chờ container có width thực ────────────────────────────
    useEffect(() => {
      if (!musicXML) return;

      let cancelled  = false;
      let observer: ResizeObserver | null = null;

      const doLoad = async (container: HTMLDivElement) => {
        if (cancelled) return;

        // Clear trước
        container.innerHTML = '';
        osmdRef.current     = null;
        graphicalNotesRef.current = [];
        prevIndexRef.current      = -1;
        highlightedRef.current    = [];

        setLoading(true);
        setError(null);

        try {
          const osmd = new OpenSheetMusicDisplay(container, {
            autoResize:        true,
            backend:           'svg',
            drawTitle:         true,
            drawComposer:      true,
            drawingParameters: 'default',  // 'compact' đôi khi gây width=0
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
                      for (const n of gve?.notes ?? []) {
                        gNotes.push(n);
                      }
                    }
                  }
                }
              }
            }
          } catch (e) {
            console.warn('[SheetViewer] extract graphical notes:', e);
          }
          graphicalNotesRef.current = gNotes;

          if (!cancelled) setLoading(false);
        } catch (err) {
          if (!cancelled) {
            setError(`Không thể hiển thị: ${err instanceof Error ? err.message : String(err)}`);
            setLoading(false);
          }
        }
      };

      const tryLoad = () => {
        const container = containerRef.current;
        if (!container) return;

        const w = container.offsetWidth;
        if (w > 0) {
          // Container đã có width — load ngay
          observer?.disconnect();
          doLoad(container);
        } else {
          // Chờ ResizeObserver
          observer = new ResizeObserver(entries => {
            for (const entry of entries) {
              if (entry.contentRect.width > 0) {
                observer?.disconnect();
                doLoad(container);
                break;
              }
            }
          });
          observer.observe(container);
        }
      };

      // Dùng requestAnimationFrame để chắc chắn DOM đã layout
      const raf = requestAnimationFrame(tryLoad);

      return () => {
        cancelled = true;
        cancelAnimationFrame(raf);
        observer?.disconnect();
      };
    }, [musicXML]);

    // ── Zoom ───────────────────────────────────────────────────────────────
    useEffect(() => {
      zoomRef.current = zoom;
      if (osmdRef.current) {
        osmdRef.current.zoom = zoom;
        osmdRef.current.render();
      }
    }, [zoom]);

    // ── Ctrl+Wheel zoom ────────────────────────────────────────────────────
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

    // ── Note highlight sync ────────────────────────────────────────────────
    useEffect(() => {
      if (!osmdRef.current || loading) return;
      if (currentNoteIndex === prevIndexRef.current) return;
      prevIndexRef.current = currentNoteIndex;

      // Clear cũ
      highlightedRef.current.forEach(({ el, orig }) => {
        el.style.fill   = orig;
        el.style.filter = '';
      });
      highlightedRef.current = [];

      if (currentNoteIndex < 0) return;

      const gNote = graphicalNotesRef.current[currentNoteIndex];
      if (!gNote) return;

      try {
        const svgEl =
          gNote.getSVGGElement?.() ??
          gNote.getSVGElement?.() ??
          null;
        if (!svgEl) return;

        const targets = svgEl.querySelectorAll('path, ellipse, circle');
        targets.forEach((el: Element) => {
          const svg = el as SVGElement;
          const orig = svg.getAttribute('fill') ?? svg.style.fill ?? '';
          svg.style.fill   = '#6366f1';
          svg.style.filter = 'drop-shadow(0 0 5px rgba(99,102,241,0.9))';
          highlightedRef.current.push({ el: svg, orig });
        });

        svgEl.scrollIntoView?.({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      } catch (_) { /* ignore */ }
    }, [currentNoteIndex, loading]);

    // ── Imperative handle ──────────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
      scrollToCurrentNote: () => {
        const gNote = graphicalNotesRef.current[currentNoteIndex];
        const el    = gNote?.getSVGGElement?.() ?? gNote?.getSVGElement?.();
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
          {loading && (
            <div className="viewer-loading">
              <div className="spinner" />
              <p>Đang tải bản nhạc…</p>
            </div>
          )}
          {error && (
            <div className="viewer-error"><p>⚠ {error}</p></div>
          )}
          {/* QUAN TRỌNG: không dùng display:none — dùng visibility để OSMD vẫn tính được width */}
          <div
            ref={containerRef}
            className="sheet-music-container"
            style={{ visibility: (loading || error) ? 'hidden' : 'visible', minHeight: 200 }}
          />
        </div>
      </div>
    );
  },
);

SheetMusicViewer.displayName = 'SheetMusicViewer';
export default SheetMusicViewer;
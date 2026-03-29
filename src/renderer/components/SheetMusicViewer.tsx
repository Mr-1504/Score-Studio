// src/renderer/components/SheetMusicViewer.tsx
// ROOT CAUSE (confirmed từ console debug):
//   - OSMD/VexFlow render nốt bằng <g class="vf-notehead"> chứa <path> không có fill attribute
//   - path kế thừa fill từ <g> cha → phải tô trên <g class="vf-notehead">
//   - getSVGGElement() của OSMD trả về <g> wrapper cấp cao hơn vf-notehead
//   - Fix: từ <g> wrapper đó, query xuống .vf-notehead bên trong, tô màu ở đó
//   - Ngoài ra tô luôn .vf-stem, .vf-flag, .vf-beam để nốt highlight trọn vẹn

import { useEffect, useRef, useState, forwardRef, useImperativeHandle, useCallback } from 'react';
import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import { usePlaybackStore, useCurrentNoteIndex } from '../store/usePlaybackStore';
import { usePracticeMode } from '../store/usePracticeStore';
import { useLibraryStore } from '../store/useLibraryStore';
import './SheetMusicViewer.css';

const COLOR_CURRENT = '#4a9eff';

// VexFlow class names cần tô màu khi highlight một nốt
const VF_NOTE_CLASSES = ['.vf-notehead', '.vf-stem', '.vf-flag'];
// Không tô beam vì beam dùng chung cho nhiều nốt

interface SheetMusicViewerProps {
  musicXML: string;
}

interface HighlightEntry {
  el: Element;
  origFill: string;
  origStroke: string;
}

// Lấy tất cả VexFlow elements cần tô màu bên trong một <g> wrapper của OSMD
function getVFNoteElements(gWrapper: SVGElement): Element[] {
  const result: Element[] = [];

  VF_NOTE_CLASSES.forEach(cls => {
    gWrapper.querySelectorAll(cls).forEach(el => result.push(el));
  });

  // Nếu wrapper chính là vf-notehead (một số phiên bản OSMD)
  if (gWrapper.classList.contains('vf-notehead')) {
    result.push(gWrapper);
  }

  // Fallback: nếu không tìm thấy gì, lấy toàn bộ path có fill không phải none
  if (result.length === 0) {
    gWrapper.querySelectorAll('path, rect').forEach(el => {
      const fill = el.getAttribute('fill');
      const computed = window.getComputedStyle(el).fill;
      const isVisible = fill !== 'none' && computed !== 'none' && !computed.includes('0, 0, 0, 0');
      if (isVisible) result.push(el);
    });
  }

  return result;
}

const SheetMusicViewer = forwardRef(({ musicXML }: SheetMusicViewerProps, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0.7);
  const zoomRef = useRef(0.7);

  // key=`${measureIdx}_${midi}` → <g> wrapper elements từ OSMD
  const noteMapRef = useRef<Map<string, SVGElement[]>>(new Map());
  const highlightedRef = useRef<HighlightEntry[]>([]);
  const prevKeyRef = useRef('');

  const _idx = useCurrentNoteIndex();

  const currentNoteEvents = usePlaybackStore(s => s.currentNoteEvents);
  useEffect(() => {
    console.log('[SheetViewer] currentNoteEvents:', currentNoteEvents);
  }, [currentNoteEvents]);
  const _mode = usePracticeMode();

  const activeSongId = useLibraryStore(s => s.activeSongId);
  const songTitle = useLibraryStore(s =>
    s.songs.find(song => song.id === activeSongId)?.title ?? ''
  );

  // ── Load OSMD ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!musicXML) return;
    let cancelled = false;
    let observer: ResizeObserver | null = null;

    const doLoad = async (container: HTMLDivElement) => {
      if (cancelled) return;
      container.innerHTML = '';
      osmdRef.current = null;
      noteMapRef.current = new Map();
      prevKeyRef.current = '';
      highlightedRef.current = [];
      setLoading(true);
      setError(null);

      try {
        const osmd = new OpenSheetMusicDisplay(container, {
          autoResize: true,
          backend: 'svg',
          drawTitle: false,
          drawComposer: false,
          drawingParameters: 'default',
        });
        await osmd.load(musicXML);
        if (cancelled) return;

        osmd.zoom = zoomRef.current;
        osmd.render();
        osmdRef.current = osmd;
        (window as any).__osmd = osmd;

        // ── Build noteMap ──────────────────────────────────────────────────
        const map = new Map<string, SVGElement[]>();

        try {
          const gs = (osmd as any).GraphicSheet;
          if (gs?.MeasureList) {
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

                      const ht =
                        sn.halfTone ??
                        sn.HalfTone ??
                        sn.pitch?.getHalfTone?.() ??
                        sn.pitch?.GetHalfTone?.() ??
                        sn.pitch?.halfTone;
                      if (typeof ht !== 'number') continue;

                      const midi = ht + 12;
                      const gEl = (gn.getSVGGElement?.() ?? gn.getSVGElement?.()) as SVGElement | null;
                      if (!gEl) continue;

                      const key = `${mIdx}_${midi}`;
                      if (!map.has(key)) map.set(key, []);
                      if (!map.get(key)!.includes(gEl)) {
                        map.get(key)!.push(gEl);
                      }
                    }
                  }
                }
              }
            }
          }
        } catch (e) {
          console.warn('[SheetViewer] noteMap build error:', e);
        }

        noteMapRef.current = map;
        console.log('[SheetViewer] noteMap ready, entries:', map.size);
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

  // ── Zoom ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    zoomRef.current = zoom;
    if (osmdRef.current) { osmdRef.current.zoom = zoom; osmdRef.current.render(); }
  }, [zoom]);

  // ── Highlight ─────────────────────────────────────────────────────────────
  const clearHighlights = useCallback(() => {
    highlightedRef.current.forEach(({ el, origFill, origStroke }) => {
      const svg = el as SVGElement;
      if (origFill) svg.setAttribute('fill', origFill);
      else svg.removeAttribute('fill');
      if (origStroke) svg.setAttribute('stroke', origStroke);
      else svg.removeAttribute('stroke');
      svg.style.filter = '';
    });
    highlightedRef.current = [];
  }, []);

  useEffect(() => {
    if (loading) return;

    if (!currentNoteEvents || currentNoteEvents.length === 0) {
      clearHighlights();
      prevKeyRef.current = '';
      return;
    }

    const key = currentNoteEvents.map(n => `${n.measureIndex}_${n.midiNote}`).join('|');
    if (key === prevKeyRef.current) return;
    prevKeyRef.current = key;

    clearHighlights();

    let scrollEl: Element | null = null;

    currentNoteEvents.forEach(n => {
      let gWrappers = noteMapRef.current.get(`${n.measureIndex}_${n.midiNote}`);

      // Fallback ±1 measure
      if (!gWrappers?.length) {
        for (let delta = -5; delta <= 5; delta++) {
          if (delta === 0) continue;
          const found = noteMapRef.current.get(`${n.measureIndex + delta}_${n.midiNote}`);
          if (found?.length) { gWrappers = found; break; }
        }
      }

      if (!gWrappers?.length) return;

      gWrappers.forEach(gWrapper => {
        // Lấy các vf-notehead, vf-stem, vf-flag bên trong wrapper
        const vfEls = getVFNoteElements(gWrapper);

        vfEls.forEach((el, i) => {
          const svg = el as SVGElement;
          const origFill = svg.getAttribute('fill') ?? '';
          const origStroke = svg.getAttribute('stroke') ?? '';

          svg.setAttribute('fill', COLOR_CURRENT);
          // Chỉ thêm glow cho notehead đầu tiên
          if (i === 0) svg.style.filter = 'drop-shadow(0 0 4px rgba(74,158,255,0.8))';

          highlightedRef.current.push({ el, origFill, origStroke });
          if (!scrollEl) scrollEl = el;
        });
      });
    });

    if (scrollEl) {
      (scrollEl as Element).scrollIntoView?.({
        behavior: 'smooth', block: 'nearest', inline: 'center',
      });
    }
  }, [currentNoteEvents, loading, clearHighlights]);

  useImperativeHandle(ref, () => ({
    scrollToCurrentNote: () => {
      if (highlightedRef.current[0]) {
        highlightedRef.current[0].el.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
      }
    },
  }));

  return (
    <div className="sheet-music-viewer">
      <div className="viewer-controls">
        <div className="zoom-controls">
          <button className="zoom-btn" onClick={() => setZoom(z => Math.max(0.4, +(z - 0.1).toFixed(1)))}>−</button>
          <span className="zoom-level">{Math.round(zoom * 100)}%</span>
          <button className="zoom-btn" onClick={() => setZoom(z => Math.min(2.0, +(z + 0.1).toFixed(1)))}>+</button>
          <button className="zoom-btn" onClick={() => setZoom(0.7)}>Reset</button>
        </div>
      </div>

      <div className="viewer-content">
        {songTitle && !loading && !error && (
          <div className="sheet-custom-title">{songTitle}</div>
        )}
        {loading && (
          <div className="viewer-loading">
            <div className="spinner" />
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
import { useEffect, useRef, useState, forwardRef, useImperativeHandle, useCallback } from 'react';
import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import { usePlaybackStore } from '../store/usePlaybackStore';
import { usePracticeMode } from '../store/usePracticeStore';
import { useLibraryStore } from '../store/useLibraryStore';
import './SheetMusicViewer.css';

const COLOR_CURRENT  = '#4a9eff';
const COLOR_OPACITY  = '1';

interface SheetMusicViewerProps {
  musicXML: string;
}

interface HighlightEntry {
  el: Element;
  origFill: string;
  origOpacity: string;
}

const SheetMusicViewer = forwardRef(({ musicXML }: SheetMusicViewerProps, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const osmdRef      = useRef<OpenSheetMusicDisplay | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [zoom,    setZoom]    = useState(1.0);
  const zoomRef = useRef(1.0);

  const highlightedRef = useRef<HighlightEntry[]>([]);
  const prevKeyRef     = useRef('');

  const currentNoteEvents = usePlaybackStore(s => s.currentNoteEvents);
  const music             = usePlaybackStore(s => s.music); // Dùng để đếm thứ tự nốt
  const practiceMode      = usePracticeMode();

  const activeSongId = useLibraryStore(s => s.activeSongId);
  const songTitle    = useLibraryStore(s =>
    s.songs.find(song => song.id === activeSongId)?.title ?? ''
  );

  // ── Load OSMD ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!musicXML) return;
    let cancelled = false;
    let observer: ResizeObserver | null = null;

    const doLoad = async (container: HTMLDivElement) => {
      if (cancelled) return;
      container.innerHTML = '';
      osmdRef.current = null;
      prevKeyRef.current = '';
      highlightedRef.current = [];

      setLoading(true);
      setError(null);

      try {
        const osmd = new OpenSheetMusicDisplay(container, {
          autoResize:        true,
          backend:           'svg',
          drawTitle:         false,
          drawComposer:      false,
          drawingParameters: 'default',
        });
        await osmd.load(musicXML);
        if (cancelled) return;

        osmd.zoom = zoomRef.current;
        osmd.render();
        osmdRef.current = osmd;

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

  // ── Zoom ────────────────────────────────────────────────────
  useEffect(() => {
    zoomRef.current = zoom;
    if (osmdRef.current) { 
      osmdRef.current.zoom = zoom; 
      osmdRef.current.render(); 
      prevKeyRef.current = '';
    }
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

  const clearHighlights = useCallback(() => {
    highlightedRef.current.forEach(({ el, origFill, origOpacity }) => {
      const svg = el as SVGElement;
      if (origFill) svg.style.setProperty('fill', origFill);
      else svg.style.removeProperty('fill');

      if (origOpacity) svg.style.setProperty('opacity', origOpacity);
      else svg.style.removeProperty('opacity');

      svg.style.removeProperty('stroke');
      svg.style.filter = '';
    });
    highlightedRef.current = [];
  }, []);

  // ── Thuật toán Occurrence Tô Màu Chính Xác ────────────────────────────
  useEffect(() => {
    if (loading || !osmdRef.current || !music) return;

    if (!currentNoteEvents || currentNoteEvents.length === 0) {
      clearHighlights();
      prevKeyRef.current = '';
      return;
    }

    const key = currentNoteEvents.map(n => n.id).join('|');
    if (key === prevKeyRef.current) return;
    prevKeyRef.current = key;

    clearHighlights();
    let scrollEl: Element | null = null;
    let foundAny = false;

    const osmd = osmdRef.current;
    const gs = (osmd as any)?.GraphicSheet;
    if (!gs?.MeasureList) return;

    const getSVGsInMeasure = (mIdx: number, midi: number) => {
      const results: SVGElement[] = [];
      if (mIdx < 0 || mIdx >= gs.MeasureList.length) return results;
      
      const row = gs.MeasureList[mIdx];
      if (!row) return results;

      for (const m of row) {
        for (const se of m?.staffEntries ?? []) {
          for (const gve of se?.graphicalVoiceEntries ?? []) {
            for (const gn of gve?.notes ?? []) {
              const sn = gn?.sourceNote;
              if (!sn) continue;
              const ht = sn.halfTone ?? sn.HalfTone ?? sn.pitch?.getHalfTone?.() ?? sn.pitch?.GetHalfTone?.() ?? sn.pitch?.halfTone;
              if (typeof ht === 'number' && ht + 12 === midi) {
                const el = (gn.getSVGGElement?.() ?? gn.getSVGElement?.()) as SVGElement;
                if (el) results.push(el);
              }
            }
          }
        }
      }
      return results;
    };

    currentNoteEvents.forEach(n => {
      const sameNotesInMeasure = music.notes.filter(
        mn => mn.measureIndex === n.measureIndex && mn.midiNote === n.midiNote
      );
      sameNotesInMeasure.sort((a, b) => a.startBeat - b.startBeat);
      const occurrenceIndex = sameNotesInMeasure.findIndex(mn => mn.id === n.id);

      if (occurrenceIndex === -1) return;

      let targetSvg: SVGElement | null = null;
      const svgs = getSVGsInMeasure(n.measureIndex, n.midiNote);
      
      if (svgs.length > occurrenceIndex) {
        targetSvg = svgs[occurrenceIndex];
      } else {
        const svgsNext = getSVGsInMeasure(n.measureIndex + 1, n.midiNote);
        if (svgsNext.length > occurrenceIndex) {
          targetSvg = svgsNext[occurrenceIndex];
        } else {
          const svgsPrev = getSVGsInMeasure(n.measureIndex - 1, n.midiNote);
          if (svgsPrev.length > occurrenceIndex) targetSvg = svgsPrev[occurrenceIndex];
        }
      }

      if (!targetSvg) {
        if (svgs.length > 0) targetSvg = svgs[0];
        else return;
      }

      const allNodes = [targetSvg, ...Array.from(targetSvg.querySelectorAll('path, ellipse, circle, rect, use'))];
      
      allNodes.forEach(node => {
        const tagName = node.tagName.toLowerCase();
        if (['path', 'ellipse', 'circle', 'rect', 'use'].includes(tagName)) {
          const svg = node as SVGElement;
          
          const origFill    = svg.style.getPropertyValue('fill') || svg.getAttribute('fill') || '';
          const origOpacity = svg.style.getPropertyValue('opacity') || svg.getAttribute('opacity') || '';
          
          svg.style.setProperty('fill', COLOR_CURRENT, 'important');
          svg.style.setProperty('opacity', COLOR_OPACITY, 'important');
          svg.style.setProperty('stroke', COLOR_CURRENT, 'important');
          svg.style.filter = 'drop-shadow(0 0 4px rgba(74,158,255,0.7))';

          highlightedRef.current.push({ el: svg, origFill, origOpacity });
          foundAny = true;
          if (!scrollEl) scrollEl = svg;
        }
      });
    });

    if (foundAny && scrollEl) {
      (scrollEl as Element).scrollIntoView?.({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [currentNoteEvents, music, practiceMode, loading, clearHighlights]);

  useImperativeHandle(ref, () => ({
    scrollToCurrentNote: () => {
      if (highlightedRef.current[0]) {
        highlightedRef.current[0].el.scrollIntoView?.({ behavior: 'smooth', block: 'nearest', inline: 'center' });
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
          <button className="zoom-btn" onClick={() => setZoom(1.0)}>Reset</button>
        </div>
      </div>

      <div className="viewer-content">
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
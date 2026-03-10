import { useState, useCallback, useRef, useEffect } from 'react';
import { clampZoom, ZOOM_STEP, ZOOM_MIN, ZOOM_MAX } from './canvas-utils';
import type { ViewportState } from './canvas-utils';

interface UseCanvasViewportOptions {
  /** 初始平移量 */
  initialPan?: { x: number; y: number };
  /** 初始缩放 */
  initialZoom?: number;
}

export function useCanvasViewport(options: UseCanvasViewportOptions = {}) {
  const [viewport, setViewport] = useState<ViewportState>({
    panX: options.initialPan?.x ?? 0,
    panY: options.initialPan?.y ?? 0,
    zoom: options.initialZoom ?? 1,
  });

  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // ── 缩放控制 ──

  const zoomIn = useCallback(() => {
    setViewport(prev => ({ ...prev, zoom: clampZoom(prev.zoom + ZOOM_STEP) }));
  }, []);

  const zoomOut = useCallback(() => {
    setViewport(prev => ({ ...prev, zoom: clampZoom(prev.zoom - ZOOM_STEP) }));
  }, []);

  const zoomReset = useCallback(() => {
    setViewport(prev => ({ ...prev, zoom: 1 }));
  }, []);

  const setZoom = useCallback((zoom: number) => {
    setViewport(prev => ({ ...prev, zoom: clampZoom(zoom) }));
  }, []);

  // ── 平移控制 ──

  const setPan = useCallback((panX: number, panY: number) => {
    setViewport(prev => ({ ...prev, panX, panY }));
  }, []);

  // ── 滚轮缩放（以鼠标位置为中心缩放） ──

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    setViewport(prev => {
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      const newZoom = clampZoom(prev.zoom + delta);
      const ratio = newZoom / prev.zoom;

      // 以鼠标位置为中心缩放
      const newPanX = mouseX - ratio * (mouseX - prev.panX);
      const newPanY = mouseY - ratio * (mouseY - prev.panY);

      return { panX: newPanX, panY: newPanY, zoom: newZoom };
    });
  }, []);

  // ── 中键 / 空格 + 拖拽平移 ──

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // 中键 或 左键 + 空格 (通过 target 判断是否点在空白区域)
    const isMiddle = e.button === 1;
    const isCanvasBg = (e.target as HTMLElement).dataset?.canvasBg === 'true';

    if (isMiddle || isCanvasBg) {
      isPanning.current = true;
      panStart.current = {
        x: e.clientX,
        y: e.clientY,
        panX: viewport.panX,
        panY: viewport.panY,
      };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      e.preventDefault();
    }
  }, [viewport.panX, viewport.panY]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isPanning.current) return;
    const dx = e.clientX - panStart.current.x;
    const dy = e.clientY - panStart.current.y;
    setViewport(prev => ({
      ...prev,
      panX: panStart.current.panX + dx,
      panY: panStart.current.panY + dy,
    }));
  }, []);

  const handlePointerUp = useCallback(() => {
    isPanning.current = false;
  }, []);

  // ── 挂载滚轮事件（需要 passive:false） ──

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // ── CSS transform 字符串 ──

  const viewportStyle: React.CSSProperties = {
    transform: `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.zoom})`,
    transformOrigin: '0 0',
  };

  return {
    viewport,
    setViewport,
    containerRef,
    viewportStyle,
    zoomIn,
    zoomOut,
    zoomReset,
    setZoom,
    setPan,
    zoomPercent: Math.round(viewport.zoom * 100),
    isMinZoom: viewport.zoom <= ZOOM_MIN,
    isMaxZoom: viewport.zoom >= ZOOM_MAX,
    // 事件处理器，绑定到画布容器
    canvasEvents: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
    },
  };
}

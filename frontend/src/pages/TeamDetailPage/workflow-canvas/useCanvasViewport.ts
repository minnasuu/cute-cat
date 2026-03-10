import { useState, useCallback, useRef, useEffect } from 'react';
import { clampZoom, ZOOM_MIN, ZOOM_MAX } from './canvas-utils';
import type { ViewportState } from './canvas-utils';

interface UseCanvasViewportOptions {
  /** 初始平移量 */
  initialPan?: { x: number; y: number };
  /** 初始缩放 */
  initialZoom?: number;
}

/** 缩放灵敏度：滚轮 deltaY 的比例因子 */
const ZOOM_SENSITIVITY = 0.001;
/** 触控板双指缩放灵敏度 */
const TRACKPAD_ZOOM_SENSITIVITY = 0.005;
/** 惯性摩擦系数（0~1，越大惯性越弱） */
const INERTIA_FRICTION = 0.92;
/** 惯性最小速度阈值 */
const INERTIA_MIN_VELOCITY = 0.5;

export function useCanvasViewport(options: UseCanvasViewportOptions = {}) {
  // ── 核心状态用 ref 存储，避免频繁 setState 造成重渲染卡顿 ──
  const viewportRef = useRef<ViewportState>({
    panX: options.initialPan?.x ?? 0,
    panY: options.initialPan?.y ?? 0,
    zoom: options.initialZoom ?? 1,
  });

  // 用 useState 驱动 React 渲染，但通过 rAF 节流更新
  const [viewport, setViewport] = useState<ViewportState>({ ...viewportRef.current });
  const rafId = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── 使用 rAF 批量提交视口变更到 React state ──
  const scheduleUpdate = useCallback(() => {
    if (rafId.current) return; // 已经安排了更新
    rafId.current = requestAnimationFrame(() => {
      rafId.current = 0;
      setViewport({ ...viewportRef.current });
    });
  }, []);

  // ── 平移相关 ──
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  // ── 惯性相关 ──
  const velocity = useRef({ vx: 0, vy: 0 });
  const lastPointer = useRef({ x: 0, y: 0, time: 0 });
  const inertiaRaf = useRef<number>(0);

  // ── 惯性动画 ──
  const startInertia = useCallback(() => {
    if (inertiaRaf.current) cancelAnimationFrame(inertiaRaf.current);

    const animate = () => {
      const { vx, vy } = velocity.current;
      if (Math.abs(vx) < INERTIA_MIN_VELOCITY && Math.abs(vy) < INERTIA_MIN_VELOCITY) {
        velocity.current = { vx: 0, vy: 0 };
        inertiaRaf.current = 0;
        return;
      }

      viewportRef.current = {
        ...viewportRef.current,
        panX: viewportRef.current.panX + vx,
        panY: viewportRef.current.panY + vy,
      };
      velocity.current = {
        vx: vx * INERTIA_FRICTION,
        vy: vy * INERTIA_FRICTION,
      };
      scheduleUpdate();
      inertiaRaf.current = requestAnimationFrame(animate);
    };

    inertiaRaf.current = requestAnimationFrame(animate);
  }, [scheduleUpdate]);

  const stopInertia = useCallback(() => {
    if (inertiaRaf.current) {
      cancelAnimationFrame(inertiaRaf.current);
      inertiaRaf.current = 0;
    }
    velocity.current = { vx: 0, vy: 0 };
  }, []);

  // ── 缩放控制（按钮式） ──

  const zoomIn = useCallback(() => {
    viewportRef.current = { ...viewportRef.current, zoom: clampZoom(viewportRef.current.zoom + 0.1) };
    scheduleUpdate();
  }, [scheduleUpdate]);

  const zoomOut = useCallback(() => {
    viewportRef.current = { ...viewportRef.current, zoom: clampZoom(viewportRef.current.zoom - 0.1) };
    scheduleUpdate();
  }, [scheduleUpdate]);

  const zoomReset = useCallback(() => {
    viewportRef.current = { ...viewportRef.current, zoom: 1 };
    scheduleUpdate();
  }, [scheduleUpdate]);

  const setZoom = useCallback((zoom: number) => {
    viewportRef.current = { ...viewportRef.current, zoom: clampZoom(zoom) };
    scheduleUpdate();
  }, [scheduleUpdate]);

  // ── 平移控制 ──

  const setPan = useCallback((panX: number, panY: number) => {
    viewportRef.current = { ...viewportRef.current, panX, panY };
    scheduleUpdate();
  }, [scheduleUpdate]);

  // ── 滚轮缩放（以鼠标位置为中心，连续平滑缩放） ──

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const prev = viewportRef.current;

    // 区分触控板双指缩放和鼠标滚轮
    // ctrlKey 通常在触控板 pinch 时为 true
    const isTrackpadPinch = e.ctrlKey;
    const sensitivity = isTrackpadPinch ? TRACKPAD_ZOOM_SENSITIVITY : ZOOM_SENSITIVITY;

    // 使用乘法缩放，确保缩放感知均匀
    const zoomFactor = 1 - e.deltaY * sensitivity;
    const newZoom = clampZoom(prev.zoom * zoomFactor);
    const ratio = newZoom / prev.zoom;

    // 以鼠标位置为中心缩放
    const newPanX = mouseX - ratio * (mouseX - prev.panX);
    const newPanY = mouseY - ratio * (mouseY - prev.panY);

    viewportRef.current = { panX: newPanX, panY: newPanY, zoom: newZoom };
    scheduleUpdate();
  }, [scheduleUpdate]);

  // ── 指针事件：拖拽平移 ──

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const isMiddle = e.button === 1;
    const isCanvasBg = (e.target as HTMLElement).dataset?.canvasBg === 'true';

    if (isMiddle || isCanvasBg) {
      // 停止惯性动画
      stopInertia();

      isPanning.current = true;
      const current = viewportRef.current;
      panStart.current = {
        x: e.clientX,
        y: e.clientY,
        panX: current.panX,
        panY: current.panY,
      };
      lastPointer.current = { x: e.clientX, y: e.clientY, time: performance.now() };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      e.preventDefault();
    }
  }, [stopInertia]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isPanning.current) return;

    const dx = e.clientX - panStart.current.x;
    const dy = e.clientY - panStart.current.y;

    viewportRef.current = {
      ...viewportRef.current,
      panX: panStart.current.panX + dx,
      panY: panStart.current.panY + dy,
    };

    // 计算速度（用于惯性）
    const now = performance.now();
    const dt = now - lastPointer.current.time;
    if (dt > 0) {
      // 使用移动平均平滑速度
      const instantVx = (e.clientX - lastPointer.current.x) / Math.max(dt, 1) * 16; // 归一化到每帧
      const instantVy = (e.clientY - lastPointer.current.y) / Math.max(dt, 1) * 16;
      velocity.current = {
        vx: velocity.current.vx * 0.5 + instantVx * 0.5,
        vy: velocity.current.vy * 0.5 + instantVy * 0.5,
      };
    }
    lastPointer.current = { x: e.clientX, y: e.clientY, time: now };

    scheduleUpdate();
  }, [scheduleUpdate]);

  const handlePointerUp = useCallback(() => {
    if (!isPanning.current) return;
    isPanning.current = false;

    // 如果有足够速度，启动惯性滑动
    const { vx, vy } = velocity.current;
    if (Math.abs(vx) > INERTIA_MIN_VELOCITY || Math.abs(vy) > INERTIA_MIN_VELOCITY) {
      startInertia();
    }
  }, [startInertia]);

  // ── 挂载滚轮事件（需要 passive:false） ──

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // ── 清理 rAF ──
  useEffect(() => {
    return () => {
      if (rafId.current) cancelAnimationFrame(rafId.current);
      if (inertiaRaf.current) cancelAnimationFrame(inertiaRaf.current);
    };
  }, []);

  // ── CSS transform ──

  const viewportStyle: React.CSSProperties = {
    transform: `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.zoom})`,
    transformOrigin: '0 0',
    willChange: 'transform', // GPU 加速提示
  };

  return {
    viewport,
    setViewport: (v: ViewportState | ((prev: ViewportState) => ViewportState)) => {
      if (typeof v === 'function') {
        viewportRef.current = v(viewportRef.current);
      } else {
        viewportRef.current = v;
      }
      scheduleUpdate();
    },
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
    canvasEvents: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
    },
  };
}

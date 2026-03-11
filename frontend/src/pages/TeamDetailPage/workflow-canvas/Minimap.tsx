import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import type { ViewportState, NodePositions } from './canvas-utils';
import { NODE_WIDTH, NODE_HEIGHT, START_NODE_SIZE } from './canvas-utils';

interface MinimapProps {
  /** 画布中的节点位置 */
  nodePositions: NodePositions;
  /** 当前视口状态 */
  viewport: ViewportState;
  /** 画布容器尺寸 */
  containerSize: { width: number; height: number };
  /** 步骤总数（用来区分添加按钮节点） */
  stepCount: number;
  /** 设置视口平移 */
  onSetPan: (panX: number, panY: number) => void;
}

const MINIMAP_WIDTH = 160;
const MINIMAP_HEIGHT = 100;
const MINIMAP_PADDING = 12;
const NODE_COLOR = '#a78bfa';      // 紫色
const START_COLOR = '#f97316';     // 橙色
const ADD_COLOR = '#d1d5db';       // 灰色
const VIEWPORT_COLOR = '#3b82f6';  // 蓝色
const BG_COLOR = '#fafafa';
const BORDER_COLOR = '#e5e7eb';

const Minimap: React.FC<MinimapProps> = ({
  nodePositions, viewport, containerSize, stepCount, onSetPan,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDragging = useRef(false);

  // 计算内容边界
  const bounds = useMemo(() => {
    if (nodePositions.size === 0) return { minX: 0, maxX: 800, minY: 0, maxY: 600 };
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    nodePositions.forEach(({ x, y }, index) => {
      const w = index === -1 ? START_NODE_SIZE : NODE_WIDTH;
      const h = index === -1 ? START_NODE_SIZE : NODE_HEIGHT;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x + w);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y + h);
    });
    // 增加内边距
    const padX = (maxX - minX) * 0.15;
    const padY = (maxY - minY) * 0.15;
    return {
      minX: minX - padX,
      maxX: maxX + padX,
      minY: minY - padY,
      maxY: maxY + padY,
    };
  }, [nodePositions]);

  // 内容区域到 minimap 的缩放比例
  const scale = useMemo(() => {
    const contentW = bounds.maxX - bounds.minX || 1;
    const contentH = bounds.maxY - bounds.minY || 1;
    const drawW = MINIMAP_WIDTH - MINIMAP_PADDING * 2;
    const drawH = MINIMAP_HEIGHT - MINIMAP_PADDING * 2;
    return Math.min(drawW / contentW, drawH / contentH);
  }, [bounds]);

  // 内容坐标 → minimap 画布坐标
  const toMinimap = useCallback((cx: number, cy: number) => ({
    x: MINIMAP_PADDING + (cx - bounds.minX) * scale,
    y: MINIMAP_PADDING + (cy - bounds.minY) * scale,
  }), [bounds, scale]);

  // minimap 画布坐标 → 画布平移量
  const fromMinimap = useCallback((mx: number, my: number) => {
    const cx = bounds.minX + (mx - MINIMAP_PADDING) / scale;
    const cy = bounds.minY + (my - MINIMAP_PADDING) / scale;
    // 视口中心 = containerSize / 2, 所以 panX = containerSize.width/2 - cx * zoom
    return {
      panX: containerSize.width / 2 - cx * viewport.zoom,
      panY: containerSize.height / 2 - cy * viewport.zoom,
    };
  }, [bounds, scale, containerSize, viewport.zoom]);

  // 绘制 minimap
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = MINIMAP_WIDTH * dpr;
    canvas.height = MINIMAP_HEIGHT * dpr;
    ctx.scale(dpr, dpr);

    // 清空
    ctx.clearRect(0, 0, MINIMAP_WIDTH, MINIMAP_HEIGHT);

    // 背景
    ctx.fillStyle = BG_COLOR;
    ctx.beginPath();
    ctx.roundRect(0, 0, MINIMAP_WIDTH, MINIMAP_HEIGHT, 8);
    ctx.fill();

    // 绘制连线（简化为直线）
    ctx.strokeStyle = '#d1d5db';
    ctx.lineWidth = 1;
    const positions = Array.from(nodePositions.entries());
    for (let i = 0; i < positions.length - 1; i++) {
      const [idxA, posA] = positions[i];
      const [idxB, posB] = positions[i + 1];
      if (idxA === stepCount) continue; // 跳过添加按钮的连线
      const wA = idxA === -1 ? START_NODE_SIZE : NODE_WIDTH;
      const hA = idxA === -1 ? START_NODE_SIZE : NODE_HEIGHT;
      const wB = idxB === -1 ? START_NODE_SIZE : NODE_WIDTH;
      const fromPt = toMinimap(posA.x + wA / 2, posA.y + hA);
      const toPt = toMinimap(posB.x + wB / 2, posB.y);
      ctx.beginPath();
      ctx.moveTo(fromPt.x, fromPt.y);
      ctx.lineTo(toPt.x, toPt.y);
      ctx.stroke();
    }

    // 绘制节点
    nodePositions.forEach(({ x, y }, index) => {
      const pt = toMinimap(x, y);
      if (index === -1) {
        // 开始节点：小圆
        const r = Math.max(START_NODE_SIZE * scale / 2, 2);
        ctx.fillStyle = START_COLOR;
        ctx.beginPath();
        ctx.arc(pt.x + r, pt.y + r, r, 0, Math.PI * 2);
        ctx.fill();
      } else if (index === stepCount) {
        // 添加按钮：虚线矩形
        const w = Math.max(NODE_WIDTH * scale, 4);
        const h = Math.max(NODE_HEIGHT * scale * 0.6, 2);
        ctx.strokeStyle = ADD_COLOR;
        ctx.setLineDash([2, 2]);
        ctx.strokeRect(pt.x, pt.y, w, h);
        ctx.setLineDash([]);
      } else {
        // 步骤节点
        const w = Math.max(NODE_WIDTH * scale, 4);
        const h = Math.max(NODE_HEIGHT * scale, 2);
        ctx.fillStyle = NODE_COLOR;
        ctx.beginPath();
        ctx.roundRect(pt.x, pt.y, w, h, 2);
        ctx.fill();
      }
    });

    // 绘制视口范围框
    // 视口在画布坐标中的范围: 左上 = (-panX/zoom, -panY/zoom), 尺寸 = (containerW/zoom, containerH/zoom)
    const vpLeft = -viewport.panX / viewport.zoom;
    const vpTop = -viewport.panY / viewport.zoom;
    const vpWidth = containerSize.width / viewport.zoom;
    const vpHeight = containerSize.height / viewport.zoom;

    const vpPt = toMinimap(vpLeft, vpTop);
    const vpW = vpWidth * scale;
    const vpH = vpHeight * scale;

    ctx.strokeStyle = VIEWPORT_COLOR;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = VIEWPORT_COLOR;
    ctx.beginPath();
    ctx.roundRect(vpPt.x, vpPt.y, vpW, vpH, 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = VIEWPORT_COLOR;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(vpPt.x, vpPt.y, vpW, vpH, 2);
    ctx.stroke();
  }, [nodePositions, viewport, containerSize, stepCount, scale, toMinimap]);

  // 点击 / 拖拽定位
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    isDragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const { panX, panY } = fromMinimap(mx, my);
    onSetPan(panX, panY);
  }, [fromMinimap, onSetPan]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const { panX, panY } = fromMinimap(mx, my);
    onSetPan(panX, panY);
  }, [fromMinimap, onSetPan]);

  const handlePointerUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  return (
    <div className="absolute bottom-4 right-4 z-30">
      <canvas
        ref={canvasRef}
        width={MINIMAP_WIDTH}
        height={MINIMAP_HEIGHT}
        style={{
          width: MINIMAP_WIDTH,
          height: MINIMAP_HEIGHT,
          borderRadius: 8,
          border: `1px solid ${BORDER_COLOR}`,
          cursor: 'pointer',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />
    </div>
  );
};

export default Minimap;

// ─────────────────────────────────────────────
// 画布工具函数 & 常量
// ─────────────────────────────────────────────

/** 节点位置映射：key 为步骤 index，value 为画布坐标 */
export type NodePositions = Map<number, { x: number; y: number }>;

/** 画布视口状态 */
export interface ViewportState {
  panX: number;
  panY: number;
  zoom: number;
}

// ── 节点尺寸常量 ──

/** 步骤节点宽度 */
export const NODE_WIDTH = 220;
/** 步骤节点高度（近似） */
export const NODE_HEIGHT = 88;
/** 节点之间的垂直间距 */
export const NODE_GAP_Y = 60;
/** 开始节点直径 */
export const START_NODE_SIZE = 48;
/** 添加节点高度 */
export const ADD_NODE_HEIGHT = 52;

// ── 自动布局 ──

/**
 * 根据步骤数量自动计算竖向瀑布布局坐标。
 * 开始节点在最上方 (index = -1)，步骤依次向下排列，
 * 末尾留一个"添加步骤"节点 (index = stepCount)。
 *
 * 所有节点水平居中对齐于 centerX。
 */
export function autoLayout(stepCount: number, centerX = 400): NodePositions {
  const positions: NodePositions = new Map();

  // 开始节点 (index = -1)
  const startY = 40;
  positions.set(-1, { x: centerX - START_NODE_SIZE / 2, y: startY });

  // 步骤节点
  let curY = startY + START_NODE_SIZE + NODE_GAP_Y;
  for (let i = 0; i < stepCount; i++) {
    positions.set(i, { x: centerX - NODE_WIDTH / 2, y: curY });
    curY += NODE_HEIGHT + NODE_GAP_Y;
  }

  // 添加步骤节点 (index = stepCount)
  positions.set(stepCount, { x: centerX - NODE_WIDTH / 2, y: curY });

  return positions;
}

/**
 * 计算画布初始平移量，使节点群居中于视口。
 */
export function centerViewport(
  viewportWidth: number,
  viewportHeight: number,
  positions: NodePositions,
): { panX: number; panY: number } {
  if (positions.size === 0) return { panX: 0, panY: 0 };

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  positions.forEach(({ x, y }) => {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x + NODE_WIDTH);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y + NODE_HEIGHT);
  });

  const contentCX = (minX + maxX) / 2;
  const contentCY = (minY + maxY) / 2;

  return {
    panX: viewportWidth / 2 - contentCX,
    panY: viewportHeight / 2 - contentCY,
  };
}

// ── 贝塞尔曲线路径 ──

/**
 * 计算从源节点底部中心到目标节点顶部中心的二次贝塞尔曲线 SVG path。
 * 使用三次贝塞尔实现更平滑的 S 形连线。
 */
export function computeEdgePath(
  from: { x: number; y: number; width?: number; height?: number },
  to:   { x: number; y: number; width?: number; height?: number },
): string {
  const fw = from.width ?? NODE_WIDTH;
  const fh = from.height ?? NODE_HEIGHT;
  const tw = to.width ?? NODE_WIDTH;

  // 源节点底部中心
  const sx = from.x + fw / 2;
  const sy = from.y + fh;

  // 目标节点顶部中心
  const ex = to.x + tw / 2;
  const ey = to.y;

  // 控制点偏移量：竖直距离的 40%
  const dy = Math.abs(ey - sy) * 0.4;

  return `M ${sx} ${sy} C ${sx} ${sy + dy}, ${ex} ${ey - dy}, ${ex} ${ey}`;
}

/**
 * 计算连线中点坐标（用于放置 EdgePopover）
 */
export function computeEdgeMidpoint(
  from: { x: number; y: number; width?: number; height?: number },
  to:   { x: number; y: number; width?: number; height?: number },
): { x: number; y: number } {
  const fw = from.width ?? NODE_WIDTH;
  const fh = from.height ?? NODE_HEIGHT;
  const tw = to.width ?? NODE_WIDTH;

  const sx = from.x + fw / 2;
  const sy = from.y + fh;
  const ex = to.x + tw / 2;
  const ey = to.y;

  // 三次贝塞尔在 t=0.5 时的坐标
  const mx = (sx + ex) / 2;
  const my = (sy + ey) / 2;

  return { x: mx, y: my };
}

// ── 箭头标记 ──

/** SVG defs 中箭头 marker 的 ID */
export const ARROW_MARKER_ID = 'wf-arrow';
export const ARROW_MARKER_ACTIVE_ID = 'wf-arrow-active';

// ── 端口（Port）系统 ──

/** 端口尺寸 */
export const PORT_SIZE = 8;

/** 端口位置信息 */
export interface PortPosition {
  x: number; // 端口中心 x（画布坐标）
  y: number; // 端口中心 y（画布坐标）
}

/**
 * 计算节点输入端口位置（节点顶部中心）
 */
export function getInputPortPos(nodePos: { x: number; y: number }, width = NODE_WIDTH): PortPosition {
  return { x: nodePos.x + width / 2, y: nodePos.y };
}

/**
 * 计算节点输出端口位置（节点底部中心）
 */
export function getOutputPortPos(
  nodePos: { x: number; y: number },
  width = NODE_WIDTH,
  height = NODE_HEIGHT,
): PortPosition {
  return { x: nodePos.x + width / 2, y: nodePos.y + height };
}

/**
 * 计算开始节点的输出端口位置
 */
export function getStartOutputPortPos(nodePos: { x: number; y: number }): PortPosition {
  return { x: nodePos.x + START_NODE_SIZE / 2, y: nodePos.y + START_NODE_SIZE };
}

/**
 * 检查两个节点间是否可以建立连接
 * - 不允许自连接
 * - 不允许连接到开始节点 (index = -1) 的输入
 * - 不允许 target 索引 <= source 索引（防止环路，仅允许从上游到下游）
 */
export function canConnect(sourceIdx: number, targetIdx: number): boolean {
  if (sourceIdx === targetIdx) return false;
  if (targetIdx <= 0) return false; // 不允许连到开始节点或第一步（第一步由开始节点连接）
  if (targetIdx <= sourceIdx) return false; // 禁止环路
  return true;
}

// ── 缩放范围 ──

export const ZOOM_MIN = 0.3;
export const ZOOM_MAX = 2.0;
export const ZOOM_STEP = 0.1;

/**
 * 将缩放值限制在合法范围内
 */
export function clampZoom(zoom: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
}

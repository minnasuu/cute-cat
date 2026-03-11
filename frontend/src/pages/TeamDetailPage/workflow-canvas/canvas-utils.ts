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

/** 节点水平间距（分叉时使用） */
export const NODE_GAP_X = 40;

// ── 自动布局 ──

/**
 * 简单瀑布布局（无 DAG 信息时 fallback）
 */
export function autoLayoutSimple(stepCount: number, centerX = 400): NodePositions {
  const positions: NodePositions = new Map();
  const startY = 40;
  positions.set(-1, { x: centerX - START_NODE_SIZE / 2, y: startY });
  let curY = startY + START_NODE_SIZE + NODE_GAP_Y;
  for (let i = 0; i < stepCount; i++) {
    positions.set(i, { x: centerX - NODE_WIDTH / 2, y: curY });
    curY += NODE_HEIGHT + NODE_GAP_Y;
  }
  positions.set(stepCount, { x: centerX - NODE_WIDTH / 2, y: curY });
  return positions;
}

/**
 * DAG 感知的自动布局。
 * 根据 steps 中的 inputFrom 依赖关系构建 DAG，按拓扑层级排列，
 * 同一层的分叉节点水平展开。
 *
 * @param steps  工作流步骤数组（需要 stepId / inputFrom）
 * @param centerX  画布水平中心
 */
export function autoLayout(
  stepCount: number,
  centerX?: number,
): NodePositions;
export function autoLayout(
  steps: import('../../../data/types').WorkflowStep[],
  centerX?: number,
): NodePositions;
export function autoLayout(
  stepsOrCount: number | import('../../../data/types').WorkflowStep[],
  centerX = 400,
): NodePositions {
  // 兼容旧调用：只传 stepCount 时用简单布局
  if (typeof stepsOrCount === 'number') {
    return autoLayoutSimple(stepsOrCount, centerX);
  }

  const steps = stepsOrCount;
  if (steps.length === 0) {
    return autoLayoutSimple(0, centerX);
  }

  // ── 构建 DAG：计算每个节点的上游索引 ──
  // parentIndex[i] = 该步骤的 inputFrom 解析出的上游步骤索引（-1 表示来自开始节点）
  const parentIndex: number[] = [];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (!step.inputFrom) {
      // 没有指定 inputFrom：第一个步骤来自开始节点，其余来自上一步
      parentIndex.push(i === 0 ? -1 : i - 1);
    } else {
      // 优先按 stepId 匹配
      let found = steps.findIndex((s, si) => si < i && s.stepId === step.inputFrom);
      if (found < 0) {
        // fallback: 按 agentId 匹配
        found = steps.findIndex((s, si) => si < i && s.agentId === step.inputFrom);
      }
      parentIndex.push(found >= 0 ? found : (i === 0 ? -1 : i - 1));
    }
  }

  // ── 计算层级（depth）──
  // 开始节点 depth = 0，每个步骤 depth = parent.depth + 1
  const depth: number[] = new Array(steps.length).fill(0);
  // 先为 parentIndex == -1 的节点设 depth = 1（来自开始节点）
  for (let i = 0; i < steps.length; i++) {
    if (parentIndex[i] === -1) {
      depth[i] = 1;
    }
  }
  // 迭代计算（按索引顺序，因为 parent 必然 < 当前索引）
  for (let i = 0; i < steps.length; i++) {
    const pi = parentIndex[i];
    if (pi >= 0) {
      depth[i] = depth[pi] + 1;
    }
  }

  // ── 按层级分组 ──
  const maxDepth = Math.max(...depth, 0);
  const layers: number[][] = [];
  for (let d = 0; d <= maxDepth; d++) {
    layers.push([]);
  }
  for (let i = 0; i < steps.length; i++) {
    layers[depth[i]].push(i);
  }

  // ── 计算布局坐标 ──
  const positions: NodePositions = new Map();
  const startY = 40;

  // 开始节点
  positions.set(-1, { x: centerX - START_NODE_SIZE / 2, y: startY });

  for (let d = 0; d <= maxDepth; d++) {
    const layer = layers[d];
    if (layer.length === 0) continue;

    const y = startY + START_NODE_SIZE + NODE_GAP_Y + (d - 1) * (NODE_HEIGHT + NODE_GAP_Y);

    if (layer.length === 1) {
      // 单节点层：居中
      positions.set(layer[0], { x: centerX - NODE_WIDTH / 2, y });
    } else {
      // 多节点层（分叉）：水平展开
      const totalWidth = layer.length * NODE_WIDTH + (layer.length - 1) * NODE_GAP_X;
      const startX = centerX - totalWidth / 2;
      for (let j = 0; j < layer.length; j++) {
        positions.set(layer[j], {
          x: startX + j * (NODE_WIDTH + NODE_GAP_X),
          y,
        });
      }
    }
  }

  // 添加步骤节点 (index = stepCount)
  const lastLayerY = maxDepth >= 1
    ? startY + START_NODE_SIZE + NODE_GAP_Y + (maxDepth - 1) * (NODE_HEIGHT + NODE_GAP_Y)
    : startY + START_NODE_SIZE + NODE_GAP_Y;
  const addY = lastLayerY + NODE_HEIGHT + NODE_GAP_Y;
  positions.set(steps.length, { x: centerX - NODE_WIDTH / 2, y: addY });

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

import React, { useMemo, useState } from 'react';
import type { WorkflowStep } from '../../../data/types';
import {
  computeEdgePath,
  ARROW_MARKER_ID,
  ARROW_MARKER_ACTIVE_ID,
  NODE_WIDTH,
  NODE_HEIGHT,
  START_NODE_SIZE,
  type NodePositions,
} from './canvas-utils';

interface EdgeLinesProps {
  steps: WorkflowStep[];
  nodePositions: NodePositions;
  activeEdgeIndex: number | null;
  onEdgeClick: (index: number, midpoint: { x: number; y: number }) => void;
  onDeleteEdge?: (index: number) => void;
}

/** 连线流动动画 CSS（内联 style 注入） */
const flowAnimationStyle = `
@keyframes wf-flow {
  to { stroke-dashoffset: -20; }
}
`;

const EdgeLines: React.FC<EdgeLinesProps> = ({
  steps, nodePositions, activeEdgeIndex, onEdgeClick, onDeleteEdge,
}) => {
  const [hoveredEdge, setHoveredEdge] = useState<number | null>(null);

  const edges = useMemo(() => {
    const result: Array<{
      index: number;
      path: string;
      midX: number;
      midY: number;
    }> = [];

    // 开始节点 → 第一个步骤
    const startPos = nodePositions.get(-1);
    const firstPos = nodePositions.get(0);
    if (startPos && firstPos && steps.length > 0) {
      const path = computeEdgePath(
        { x: startPos.x, y: startPos.y, width: START_NODE_SIZE, height: START_NODE_SIZE },
        { x: firstPos.x, y: firstPos.y, width: NODE_WIDTH, height: NODE_HEIGHT },
      );
      const sx = startPos.x + START_NODE_SIZE / 2;
      const sy = startPos.y + START_NODE_SIZE;
      const ex = firstPos.x + NODE_WIDTH / 2;
      const ey = firstPos.y;
      result.push({ index: -1, path, midX: (sx + ex) / 2, midY: (sy + ey) / 2 });
    }

    // 步骤之间的连线
    for (let i = 1; i < steps.length; i++) {
      const step = steps[i];
      let fromIndex = i - 1;
      if (step.inputFrom) {
        const foundIdx = steps.findIndex((s, si) => si < i && s.agentId === step.inputFrom);
        if (foundIdx >= 0) fromIndex = foundIdx;
      }

      const fromPos = nodePositions.get(fromIndex);
      const toPos = nodePositions.get(i);
      if (!fromPos || !toPos) continue;

      const path = computeEdgePath(
        { x: fromPos.x, y: fromPos.y, width: NODE_WIDTH, height: NODE_HEIGHT },
        { x: toPos.x, y: toPos.y, width: NODE_WIDTH, height: NODE_HEIGHT },
      );

      const sx = fromPos.x + NODE_WIDTH / 2;
      const sy = fromPos.y + NODE_HEIGHT;
      const ex = toPos.x + NODE_WIDTH / 2;
      const ey = toPos.y;

      result.push({ index: i, path, midX: (sx + ex) / 2, midY: (sy + ey) / 2 });
    }

    return result;
  }, [steps, nodePositions]);

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ overflow: 'visible' }}
    >
      {/* 流动动画样式 */}
      <style>{flowAnimationStyle}</style>

      <defs>
        <marker
          id={ARROW_MARKER_ID}
          markerWidth="8" markerHeight="6"
          refX="7" refY="3"
          orient="auto"
        >
          <path d="M0,0 L8,3 L0,6" fill="#4ade80" />
        </marker>
        <marker
          id={ARROW_MARKER_ACTIVE_ID}
          markerWidth="8" markerHeight="6"
          refX="7" refY="3"
          orient="auto"
        >
          <path d="M0,0 L8,3 L0,6" fill="#3b82f6" />
        </marker>
        {/* Hover 状态箭头 */}
        <marker
          id="wf-arrow-hover"
          markerWidth="8" markerHeight="6"
          refX="7" refY="3"
          orient="auto"
        >
          <path d="M0,0 L8,3 L0,6" fill="#22c55e" />
        </marker>
      </defs>

      {edges.map(({ index, path, midX, midY }) => {
        const isActive = activeEdgeIndex === index;
        const isHovered = hoveredEdge === index;
        const isHighlighted = isActive || isHovered;

        // 颜色和样式
        const strokeColor = isActive ? '#22c55e' : isHovered ? '#4ade80' : '#86efac';
        const strokeWidth = isHighlighted ? 2.5 : 2;
        const markerId = isActive ? ARROW_MARKER_ACTIVE_ID : isHovered ? 'wf-arrow-hover' : ARROW_MARKER_ID;

        return (
          <g key={index}>
            {/* 透明粗线：扩大点击命中区域 + hover 检测 */}
            <path
              d={path}
              fill="none"
              stroke="transparent"
              strokeWidth={20}
              className="pointer-events-auto cursor-pointer"
              onClick={() => onEdgeClick(index, { x: midX, y: midY })}
              onMouseEnter={() => setHoveredEdge(index)}
              onMouseLeave={() => setHoveredEdge(null)}
            />

            {/* 底层发光效果（hover/active 时） */}
            {isHighlighted && (
              <path
                d={path}
                fill="none"
                stroke={strokeColor}
                strokeWidth={6}
                strokeLinecap="round"
                opacity={0.15}
                className="pointer-events-none"
              />
            )}

            {/* 可见连线 */}
            <path
              d={path}
              fill="none"
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              markerEnd={`url(#${markerId})`}
              className="pointer-events-none"
              style={{
                transition: 'stroke 0.2s, stroke-width 0.2s',
              }}
            />

            {/* 流动动画层（仅 active 时） */}
            {isActive && (
              <path
                d={path}
                fill="none"
                stroke="#22c55e"
                strokeWidth={2}
                strokeLinecap="round"
                strokeDasharray="6 14"
                opacity={0.6}
                className="pointer-events-none"
                style={{
                  animation: 'wf-flow 0.8s linear infinite',
                }}
              />
            )}

            {/* 连线中点删除按钮（hover 且非开始节点连线时显示） */}
            {isHovered && index > 0 && onDeleteEdge && (
              <g
                className="pointer-events-auto cursor-pointer"
                onClick={(e) => { e.stopPropagation(); onDeleteEdge(index); }}
              >
                <circle cx={midX} cy={midY} r={10} fill="white" stroke="#e5e7eb" strokeWidth={1} />
                <circle cx={midX} cy={midY} r={9} fill="white" />
                <line x1={midX - 3.5} y1={midY - 3.5} x2={midX + 3.5} y2={midY + 3.5} stroke="#ef4444" strokeWidth={1.8} strokeLinecap="round" />
                <line x1={midX + 3.5} y1={midY - 3.5} x2={midX - 3.5} y2={midY + 3.5} stroke="#ef4444" strokeWidth={1.8} strokeLinecap="round" />
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
};

export default EdgeLines;

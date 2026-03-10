import React, { useMemo } from 'react';
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
}

const EdgeLines: React.FC<EdgeLinesProps> = ({
  steps, nodePositions, activeEdgeIndex, onEdgeClick,
}) => {
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
      // 确定源节点：如果设置了 inputFrom，找对应步骤索引
      let fromIndex = i - 1; // 默认上一步
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
      <defs>
        <marker
          id={ARROW_MARKER_ID}
          markerWidth="8" markerHeight="6"
          refX="7" refY="3"
          orient="auto"
        >
          <path d="M0,0 L8,3 L0,6" fill="#dcfce7" />
        </marker>
        <marker
          id={ARROW_MARKER_ACTIVE_ID}
          markerWidth="8" markerHeight="6"
          refX="7" refY="3"
          orient="auto"
        >
          <path d="M0,0 L8,3 L0,6" fill="#3b82f6" />
        </marker>
      </defs>

      {edges.map(({ index, path, midX, midY }) => {
        const isActive = activeEdgeIndex === index;
        return (
          <g key={index}>
            {/* 透明粗线：扩大点击命中区域 */}
            <path
              d={path}
              fill="none"
              stroke="transparent"
              strokeWidth={16}
              className="pointer-events-auto cursor-pointer"
              onClick={() => onEdgeClick(index, { x: midX, y: midY })}
            />
            {/* 可见连线 */}
            <path
              d={path}
              fill="none"
              stroke={isActive ? '#22c55e' : '#86efac'}
              strokeWidth={isActive ? 2.5 : 2}
              strokeLinecap="round"
              markerEnd={`url(#${isActive ? ARROW_MARKER_ACTIVE_ID : ARROW_MARKER_ID})`}
              className="transition-all duration-200 pointer-events-none"
            />
          </g>
        );
      })}
    </svg>
  );
};

export default EdgeLines;

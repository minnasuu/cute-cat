import React from 'react';
import type { EdgeDragState } from './useEdgeDrag';

interface DragPreviewLineProps {
  dragState: EdgeDragState;
}

/** 拖拽连线预览：从源端口到鼠标位置的虚线贝塞尔曲线 */
const DragPreviewLine: React.FC<DragPreviewLineProps> = ({ dragState }) => {
  if (!dragState.isDragging) return null;

  const { sourcePos, mousePos, targetIndex } = dragState;
  const sx = sourcePos.x;
  const sy = sourcePos.y;
  const ex = mousePos.x;
  const ey = mousePos.y;

  // 控制点偏移量
  const dy = Math.abs(ey - sy) * 0.4;
  const path = `M ${sx} ${sy} C ${sx} ${sy + dy}, ${ex} ${ey - dy}, ${ex} ${ey}`;

  // 是否有有效目标
  const hasTarget = targetIndex !== null;

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ overflow: 'visible', zIndex: 50 }}
    >
      {/* 发光效果 */}
      <path
        d={path}
        fill="none"
        stroke={hasTarget ? '#22c55e' : '#60a5fa'}
        strokeWidth={6}
        strokeLinecap="round"
        opacity={0.15}
      />
      {/* 虚线预览 */}
      <path
        d={path}
        fill="none"
        stroke={hasTarget ? '#22c55e' : '#60a5fa'}
        strokeWidth={2}
        strokeLinecap="round"
        strokeDasharray="6 4"
        opacity={0.8}
      />
      {/* 鼠标位置圆点指示器 */}
      <circle
        cx={ex}
        cy={ey}
        r={hasTarget ? 6 : 4}
        fill={hasTarget ? '#22c55e' : '#60a5fa'}
        opacity={0.6}
      />
    </svg>
  );
};

export default DragPreviewLine;

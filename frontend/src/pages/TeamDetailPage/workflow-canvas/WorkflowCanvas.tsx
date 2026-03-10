import React, { useCallback } from 'react';
import type { WorkflowStep } from '../../../data/types';
import { useCanvasViewport } from './useCanvasViewport';
import StepNode from './StepNode';
import EdgeLines from './EdgeLines';
import { NODE_WIDTH, START_NODE_SIZE, ADD_NODE_HEIGHT, type NodePositions } from './canvas-utils';

interface TeamCat {
  id: string; name: string; role: string; catColors: any; skills: any[]; accent: string;
}

interface WorkflowCanvasProps {
  steps: WorkflowStep[];
  cats: TeamCat[];
  nodePositions: NodePositions;
  selectedStepIndex: number | null;
  activeEdgeIndex: number | null;
  onSelectStep: (index: number | null) => void;
  onNodeDrag: (index: number, pos: { x: number; y: number }) => void;
  onAddStep: () => void;
  onRemoveStep: (index: number) => void;
  onEdgeClick: (index: number, midpoint: { x: number; y: number }) => void;
  onDoubleClickCanvas: (pos: { x: number; y: number }) => void;
  // 暴露 viewport 控制
  viewportRef: React.RefObject<ReturnType<typeof useCanvasViewport> | null>;
}

const DOT_SIZE = 1;
const DOT_GAP = 20;

const WorkflowCanvas: React.FC<WorkflowCanvasProps> = ({
  steps, cats, nodePositions, selectedStepIndex,
  activeEdgeIndex, onSelectStep, onNodeDrag, onAddStep, onRemoveStep,
  onEdgeClick, onDoubleClickCanvas, viewportRef,
}) => {
  const viewport = useCanvasViewport({ initialZoom: 1 });

  // 将 viewport 暴露给父组件
  React.useEffect(() => {
    if (viewportRef && 'current' in viewportRef) {
      (viewportRef as React.MutableRefObject<ReturnType<typeof useCanvasViewport> | null>).current = viewport;
    }
  }, [viewport, viewportRef]);

  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    // 点击画布空白区域，取消选中
    if ((e.target as HTMLElement).dataset?.canvasBg === 'true') {
      onSelectStep(null);
    }
  }, [onSelectStep]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).dataset?.canvasBg !== 'true') return;
    const container = viewport.containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    // 将屏幕坐标转换为画布坐标
    const canvasX = (e.clientX - rect.left - viewport.viewport.panX) / viewport.viewport.zoom;
    const canvasY = (e.clientY - rect.top - viewport.viewport.panY) / viewport.viewport.zoom;
    onDoubleClickCanvas({ x: canvasX, y: canvasY });
  }, [viewport, onDoubleClickCanvas]);

  // 获取技能信息的辅助函数
  const getSkillInfo = (cat: TeamCat | undefined, skillId: string) => {
    if (!cat || !skillId) return { name: '', icon: '' };
    const skill = cat.skills?.find((s: any) => s.id === skillId);
    return { name: skill?.name || '', icon: skill?.icon || '' };
  };

  const startPos = nodePositions.get(-1);
  const addPos = nodePositions.get(steps.length);

  return (
    <div
      ref={viewport.containerRef}
      className="flex-1 h-full relative overflow-hidden bg-gray-50"
      style={{
        backgroundImage: `radial-gradient(circle, #d1d5db ${DOT_SIZE}px, transparent ${DOT_SIZE}px)`,
        backgroundSize: `${DOT_GAP}px ${DOT_GAP}px`,
      }}
      onClick={handleCanvasClick}
      onDoubleClick={handleDoubleClick}
      {...viewport.canvasEvents}
    >
      {/* 底层：可拖拽背景 */}
      <div
        data-canvas-bg="true"
        className="absolute inset-0"
        style={{ cursor: 'grab' }}
      />

      {/* 画布内容层（受 transform 影响） */}
      <div className="absolute inset-0 origin-top-left" style={viewport.viewportStyle}>
        {/* SVG 连线层 */}
        <EdgeLines
          steps={steps}
          nodePositions={nodePositions}
          activeEdgeIndex={activeEdgeIndex}
          onEdgeClick={onEdgeClick}
        />

        {/* 开始节点 */}
        {startPos && (
          <div
            className="absolute flex items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-primary-600 shadow-lg shadow-primary-200/50 cursor-default"
            style={{
              left: startPos.x,
              top: startPos.y,
              width: START_NODE_SIZE,
              height: START_NODE_SIZE,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        )}

        {/* 步骤节点 */}
        {steps.map((step, i) => {
          const pos = nodePositions.get(i);
          if (!pos) return null;
          const cat = cats.find(c => c.id === step.agentId);
          const { name: skillName, icon: skillIcon } = getSkillInfo(cat, step.skillId);
          return (
            <StepNode
              key={i}
              index={i}
              agentId={step.agentId}
              skillId={step.skillId}
              action={step.action}
              cat={cat}
              skillName={skillName}
              skillIcon={skillIcon}
              paramCount={step.params?.length || 0}
              isSelected={selectedStepIndex === i}
              onSelect={onSelectStep}
              onDrag={onNodeDrag}
              onRemove={onRemoveStep}
              position={pos}
              zoom={viewport.viewport.zoom}
            />
          );
        })}

        {/* 添加步骤节点 */}
        {addPos && (
          <div
            className="absolute border-2 border-dashed border-gray-300 rounded-[20px] flex items-center justify-center gap-2 text-gray-400 hover:border-primary-400 hover:text-primary-500 hover:bg-primary-50/50 transition-all cursor-pointer select-none"
            style={{
              left: addPos.x,
              top: addPos.y,
              width: NODE_WIDTH,
              height: ADD_NODE_HEIGHT,
            }}
            onClick={(e) => { e.stopPropagation(); onAddStep(); }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 5v14M5 12h14" />
            </svg>
            <span className="text-xs font-bold">添加步骤</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default WorkflowCanvas;

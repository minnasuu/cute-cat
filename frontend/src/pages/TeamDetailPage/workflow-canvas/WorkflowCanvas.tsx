import React, { useCallback, useMemo, useRef, useState } from 'react';
import type { WorkflowStep } from '../../../data/types';
import { useCanvasViewport } from './useCanvasViewport';
import { useEdgeDrag } from './useEdgeDrag';
import { useCanvasKeyboard } from './useCanvasKeyboard';
import StepNode from './StepNode';
import EdgeLines from './EdgeLines';
import DragPreviewLine from './DragPreviewLine';
import { NODE_WIDTH, START_NODE_SIZE, ADD_NODE_HEIGHT, PORT_SIZE, type NodePositions } from './canvas-utils';

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
  onConnect: (sourceIndex: number, targetIndex: number) => void;
  onDeleteEdge: (index: number) => void;
  // 暴露 viewport 控制
  viewportRef: React.RefObject<ReturnType<typeof useCanvasViewport> | null>;
}

const DOT_SIZE = 1;
const DOT_GAP = 20;

const WorkflowCanvas: React.FC<WorkflowCanvasProps> = ({
  steps, cats, nodePositions, selectedStepIndex,
  activeEdgeIndex, onSelectStep, onNodeDrag, onAddStep, onRemoveStep,
  onEdgeClick, onDoubleClickCanvas, onConnect, onDeleteEdge, viewportRef,
}) => {
  const viewport = useCanvasViewport({ initialZoom: 1 });
  const isDragging = useRef(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const [isSpaceMode, setIsSpaceMode] = useState(false);

  // 将 viewport 暴露给父组件
  React.useEffect(() => {
    if (viewportRef && 'current' in viewportRef) {
      (viewportRef as React.MutableRefObject<ReturnType<typeof useCanvasViewport> | null>).current = viewport;
    }
  }, [viewport, viewportRef]);

  // ── 拖拽连线 hook ──
  const { dragState, handlePortPointerDown } = useEdgeDrag({
    nodePositions,
    zoom: viewport.viewport.zoom,
    panX: viewport.viewport.panX,
    panY: viewport.viewport.panY,
    containerRef: viewport.containerRef,
    onConnect,
  });

  // ── 键盘快捷键 hook ──
  useCanvasKeyboard({
    selectedStepIndex,
    activeEdgeIndex,
    onDeleteStep: onRemoveStep,
    onDeleteEdge,
    onClearSelection: useCallback(() => {
      onSelectStep(null);
    }, [onSelectStep]),
    onSpaceChange: setIsSpaceMode,
  });

  // 记录按下位置，用于判断是否发生了拖拽（防止拖拽后误触发点击）
  const handlePointerDownCapture = useCallback((e: React.PointerEvent) => {
    isDragging.current = false;
    dragStartPos.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handlePointerMoveCapture = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) {
      const dx = Math.abs(e.clientX - dragStartPos.current.x);
      const dy = Math.abs(e.clientY - dragStartPos.current.y);
      if (dx > 3 || dy > 3) {
        isDragging.current = true;
      }
    }
  }, []);

  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    // 如果刚才发生了拖拽，不触发点击
    if (isDragging.current) return;
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
    if (skillId === 'aigc') return { name: 'AIGC', icon: 'Sparkles' };
    const skill = cat.skills?.find((s: any) => s.id === skillId);
    return { name: skill?.name || skillId, icon: skill?.icon || '' };
  };

  // 背景点阵跟随视口变换，产生无限画布效果
  const bgStyle = useMemo(() => {
    const { panX, panY, zoom } = viewport.viewport;
    const scaledGap = DOT_GAP * zoom;
    const offsetX = panX % scaledGap;
    const offsetY = panY % scaledGap;
    const scaledDotSize = Math.max(DOT_SIZE * zoom, 0.5);
    return {
      backgroundImage: `radial-gradient(circle, #d1d5db ${scaledDotSize}px, transparent ${scaledDotSize}px)`,
      backgroundSize: `${scaledGap}px ${scaledGap}px`,
      backgroundPosition: `${offsetX}px ${offsetY}px`,
    };
  }, [viewport.viewport.panX, viewport.viewport.panY, viewport.viewport.zoom]);

  // 空格模式光标
  const cursorStyle = isSpaceMode
    ? 'cursor-grab'
    : '';

  const startPos = nodePositions.get(-1);
  const addPos = nodePositions.get(steps.length);

  return (
    <div
      ref={viewport.containerRef}
      className={`flex-1 h-full relative overflow-hidden bg-gray-50 ${cursorStyle}`}
      style={bgStyle}
      onClick={handleCanvasClick}
      onDoubleClick={handleDoubleClick}
      onPointerDownCapture={handlePointerDownCapture}
      onPointerMoveCapture={handlePointerMoveCapture}
      {...viewport.canvasEvents}
    >
      {/* 底层：可拖拽背景 */}
      <div
        data-canvas-bg="true"
        className="absolute inset-0"
        style={{ cursor: isDragging.current || isSpaceMode ? 'grabbing' : 'grab' }}
      />

      {/* 画布内容层（受 transform 影响） */}
      <div className="absolute inset-0 origin-top-left" style={viewport.viewportStyle}>
        {/* SVG 连线层 */}
        <EdgeLines
          steps={steps}
          nodePositions={nodePositions}
          activeEdgeIndex={activeEdgeIndex}
          onEdgeClick={onEdgeClick}
          onDeleteEdge={onDeleteEdge}
        />

        {/* 拖拽连线预览 */}
        <DragPreviewLine dragState={dragState} />

        {/* 开始节点 */}
        {startPos && (
          <div
            className="absolute flex items-center justify-center rounded-full border-2 border-primary-400 bg-primary-100 cursor-default"
            style={{
              left: startPos.x,
              top: startPos.y,
              width: START_NODE_SIZE,
              height: START_NODE_SIZE,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="var(--color-primary-400)">
              <path d="M8 5v14l11-7z" />
            </svg>

            {/* 开始节点的输出端口 */}
            <div
              data-port
              data-port-type="output"
              data-port-index={-1}
              className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center z-20 cursor-crosshair"
              style={{
                bottom: -PORT_SIZE / 2 - 2,
                width: PORT_SIZE * 2.5,
                height: PORT_SIZE * 2.5,
              }}
              onPointerDown={(e) => handlePortPointerDown(-1, e)}
            >
              <div
                className="rounded-full border-2 border-primary-300 bg-primary-200 hover:bg-primary-400 hover:border-primary-500 transition-all duration-150"
                style={{
                  width: PORT_SIZE,
                  height: PORT_SIZE,
                }}
              />
            </div>
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
              onPortDragStart={handlePortPointerDown}
              isDropTarget={dragState.isDragging && dragState.targetIndex === i}
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

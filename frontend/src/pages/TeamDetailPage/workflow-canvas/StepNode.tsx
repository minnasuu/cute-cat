import React, { useCallback, useRef, useState } from 'react';
import CatMiniAvatar from '../../../components/CatMiniAvatar';
import { NODE_WIDTH, PORT_SIZE } from './canvas-utils';

interface StepNodeProps {
  index: number;
  agentId: string;
  skillId: string;
  action: string;
  cat?: { id: string; name: string; role: string; catColors: any; skills: any[] };
  skillName?: string;
  skillIcon?: string;
  paramCount: number;
  isSelected: boolean;
  onSelect: (index: number) => void;
  onDrag: (index: number, pos: { x: number; y: number }) => void;
  onRemove: (index: number) => void;
  position: { x: number; y: number };
  zoom: number;
  /** 从输出端口开始拖拽连线 */
  onPortDragStart?: (nodeIndex: number, e: React.PointerEvent) => void;
  /** 是否正在被拖拽连线悬浮（作为目标） */
  isDropTarget?: boolean;
}

const StepNode: React.FC<StepNodeProps> = ({
  index, agentId, cat, skillName, skillIcon,
  action, paramCount, isSelected,
  onSelect, onDrag, onRemove, position, zoom,
  onPortDragStart, isDropTarget,
}) => {
  const [hovered, setHovered] = useState(false);
  const [portHovered, setPortHovered] = useState<'input' | 'output' | null>(null);
  const isDragging = useRef(false);
  const wasDragged = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, posX: 0, posY: 0 });

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return;
    if ((e.target as HTMLElement).closest('[data-port]')) return; // 不拦截端口事件

    isDragging.current = true;
    wasDragged.current = false;
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      posX: position.x,
      posY: position.y,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.stopPropagation();
  }, [position]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const dx = (e.clientX - dragStart.current.x) / zoom;
    const dy = (e.clientY - dragStart.current.y) / zoom;

    // 标记已经发生了拖拽
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
      wasDragged.current = true;
    }

    onDrag(index, {
      x: dragStart.current.posX + dx,
      y: dragStart.current.posY + dy,
    });
  }, [index, zoom, onDrag]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    isDragging.current = false;

    // 如果没有实际移动，视为点击 → 选中节点
    if (!wasDragged.current) {
      onSelect(index);
    }
  }, [index, onSelect]);

  const handleOutputPortDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    onPortDragStart?.(index, e);
  }, [index, onPortDragStart]);

  const borderClass = isSelected
    ? 'border-primary-400 ring-2 ring-primary-200 scale-[1.02]'
    : isDropTarget
    ? 'border-blue-400 ring-2 ring-blue-200 scale-[1.02]'
    : 'border-gray-200 hover:border-gray-300';

  const shadowClass = isDragging.current
    ? 'shadow-lg'
    : 'shadow-sm';

  return (
    <div
      className={`absolute select-none cursor-grab active:cursor-grabbing transition-all duration-150 rounded-[20px] border bg-white ${shadowClass} ${borderClass}`}
      style={{
        left: position.x,
        top: position.y,
        width: NODE_WIDTH,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setPortHovered(null); }}
    >
      {/* ── 输入端口（顶部中心） ── */}
      <div
        data-port
        data-port-type="input"
        data-port-index={index}
        className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center z-20"
        style={{
          top: -PORT_SIZE / 2 - 2,
          width: PORT_SIZE * 2.5,
          height: PORT_SIZE * 2.5,
        }}
        onMouseEnter={() => setPortHovered('input')}
        onMouseLeave={() => setPortHovered(null)}
      >
        <div
          className="rounded-full border-2 transition-all duration-150"
          style={{
            width: portHovered === 'input' || isDropTarget ? PORT_SIZE * 1.5 : PORT_SIZE,
            height: portHovered === 'input' || isDropTarget ? PORT_SIZE * 1.5 : PORT_SIZE,
            backgroundColor: isDropTarget ? '#3b82f6' : portHovered === 'input' ? '#4ade80' : '#d1d5db',
            borderColor: isDropTarget ? '#2563eb' : portHovered === 'input' ? '#22c55e' : '#e5e7eb',
            boxShadow: portHovered === 'input' || isDropTarget ? '0 0 6px rgba(74,222,128,0.4)' : 'none',
          }}
        />
      </div>

      {/* ── 输出端口（底部中心） ── */}
      <div
        data-port
        data-port-type="output"
        data-port-index={index}
        className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center z-20 cursor-crosshair"
        style={{
          bottom: -PORT_SIZE / 2 - 2,
          width: PORT_SIZE * 2.5,
          height: PORT_SIZE * 2.5,
        }}
        onMouseEnter={() => setPortHovered('output')}
        onMouseLeave={() => setPortHovered(null)}
        onPointerDown={handleOutputPortDown}
      >
        <div
          className="rounded-full border-2 transition-all duration-150"
          style={{
            width: portHovered === 'output' ? PORT_SIZE * 1.5 : PORT_SIZE,
            height: portHovered === 'output' ? PORT_SIZE * 1.5 : PORT_SIZE,
            backgroundColor: portHovered === 'output' ? '#4ade80' : '#d1d5db',
            borderColor: portHovered === 'output' ? '#22c55e' : '#e5e7eb',
            boxShadow: portHovered === 'output' ? '0 0 6px rgba(74,222,128,0.4)' : 'none',
          }}
        />
      </div>

      {/* Delete button */}
      {hovered && (
        <button
          data-no-drag
          onClick={(e) => { e.stopPropagation(); onRemove(index); }}
          className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center shadow-md hover:bg-red-600 transition-colors cursor-pointer z-10"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      )}

      <div className="p-3 flex items-center gap-3">
        {/* Step number badge */}
        <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white shrink-0 bg-primary-500">
          {index + 1}
        </div>

        {/* Cat avatar */}
        {cat ? (
          <CatMiniAvatar colors={cat.catColors} size={32} />
        ) : (
          <div className="w-8 h-8 rounded-full bg-gray-100 border border-dashed border-gray-300 flex items-center justify-center text-gray-400 text-xs shrink-0">
            ?
          </div>
        )}

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold text-gray-900 truncate">
            {cat?.name || '未选择猫猫'}
          </div>
          <div className="text-[10px] text-gray-500 truncate mt-0.5 flex items-center gap-1">
            {skillIcon && <span>{skillIcon}</span>}
            <span>{skillName || '未选择技能'}</span>
          </div>
          {action && (
            <div className="text-[10px] text-gray-400 truncate mt-0.5">
              {action}
            </div>
          )}
        </div>

        {/* Param count badge */}
        {paramCount > 0 && (
          <span className="px-1.5 py-0.5 rounded-md bg-primary-50 border border-primary-200 text-primary-600 text-[8px] font-bold shrink-0">
            {paramCount}P
          </span>
        )}
      </div>
    </div>
  );
};

export default StepNode;

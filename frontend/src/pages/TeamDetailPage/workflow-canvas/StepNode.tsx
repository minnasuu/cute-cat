import React, { useCallback, useRef, useState } from 'react';
import CatMiniAvatar from '../../../components/CatMiniAvatar';
import { NODE_WIDTH } from './canvas-utils';

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
  isSuggestion: boolean;
  onSelect: (index: number) => void;
  onDrag: (index: number, pos: { x: number; y: number }) => void;
  onRemove: (index: number) => void;
  position: { x: number; y: number };
  zoom: number;
}

const StepNode: React.FC<StepNodeProps> = ({
  index, agentId, cat, skillName, skillIcon,
  action, paramCount, isSelected, isSuggestion,
  onSelect, onDrag, onRemove, position, zoom,
}) => {
  const [hovered, setHovered] = useState(false);
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, posX: 0, posY: 0 });

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // 只响应左键，且不是在按钮上
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return;

    isDragging.current = true;
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
    onDrag(index, {
      x: dragStart.current.posX + dx,
      y: dragStart.current.posY + dy,
    });
  }, [index, zoom, onDrag]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const dx = Math.abs(e.clientX - dragStart.current.x);
    const dy = Math.abs(e.clientY - dragStart.current.y);
    isDragging.current = false;

    // 如果没有实际移动，视为点击 → 选中节点
    if (dx < 4 && dy < 4) {
      onSelect(index);
    }
  }, [index, onSelect]);

  const borderClass = isSelected
    ? 'border-blue-400 ring-2 ring-blue-200 scale-[1.02]'
    : isSuggestion && !agentId
      ? 'border-amber-300 bg-amber-50/60'
      : 'border-gray-200 hover:border-gray-300';

  return (
    <div
      className={`absolute select-none cursor-grab active:cursor-grabbing transition-all duration-150 rounded-[20px] border bg-white shadow-sm ${borderClass}`}
      style={{
        left: position.x,
        top: position.y,
        width: NODE_WIDTH,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
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
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white shrink-0 ${
          isSuggestion && !agentId ? 'bg-amber-400' : 'bg-blue-500'
        }`}>
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
          <span className="px-1.5 py-0.5 rounded-md bg-blue-50 border border-blue-200 text-blue-600 text-[8px] font-bold shrink-0">
            {paramCount}P
          </span>
        )}
      </div>

      {/* Suggestion warning */}
      {isSuggestion && !agentId && (
        <div className="px-3 pb-2">
          <span className="px-2 py-0.5 rounded-full bg-amber-100 border border-amber-200 text-amber-700 text-[9px] font-bold">
            需补充猫猫
          </span>
        </div>
      )}
    </div>
  );
};

export default StepNode;

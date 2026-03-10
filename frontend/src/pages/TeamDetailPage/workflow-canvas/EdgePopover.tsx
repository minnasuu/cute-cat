import React, { useEffect, useRef } from 'react';
import type { WorkflowStep } from '../../../data/types';

interface TeamCat {
  id: string; name: string; role: string; catColors: any; skills: any[]; accent: string;
}

interface EdgePopoverProps {
  open: boolean;
  stepIndex: number;
  step: WorkflowStep;
  steps: WorkflowStep[];
  cats: TeamCat[];
  /** 弹窗在画布坐标中的位置 */
  position: { x: number; y: number };
  onUpdateInputFrom: (index: number, inputFrom: string | undefined) => void;
  onClose: () => void;
}

const EdgePopover: React.FC<EdgePopoverProps> = ({
  open, stepIndex, step, steps, cats, position,
  onUpdateInputFrom, onClose,
}) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const timer = setTimeout(() => document.addEventListener('mousedown', handle), 50);
    return () => { clearTimeout(timer); document.removeEventListener('mousedown', handle); };
  }, [open, onClose]);

  if (!open || stepIndex <= 0) return null;

  const prevSteps = steps.slice(0, stepIndex);

  return (
    <div
      ref={ref}
      className="absolute z-30 bg-white rounded-xl border border-gray-200 shadow-xl p-2 min-w-[160px]"
      style={{
        left: position.x - 80,
        top: position.y - 12,
      }}
    >
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-2 py-1">数据来源</p>
      <button
        onClick={() => { onUpdateInputFrom(stepIndex, undefined); onClose(); }}
        className={`w-full text-left px-2 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
          !step.inputFrom ? 'bg-blue-50 text-blue-600' : 'text-gray-700 hover:bg-gray-50'
        }`}
      >
        ↩ 上一步（默认）
      </button>
      {prevSteps.map((s, si) => {
        const cat = cats.find(c => c.id === s.agentId);
        const isActive = step.inputFrom === s.agentId;
        return (
          <button
            key={si}
            onClick={() => { onUpdateInputFrom(stepIndex, s.agentId || undefined); onClose(); }}
            className={`w-full text-left px-2 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              isActive ? 'bg-blue-50 text-blue-600' : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-blue-500 text-white text-[8px] font-bold flex items-center justify-center">{si + 1}</span>
              {cat?.name || s.agentId || '未配置'}
            </span>
          </button>
        );
      })}
    </div>
  );
};

export default EdgePopover;

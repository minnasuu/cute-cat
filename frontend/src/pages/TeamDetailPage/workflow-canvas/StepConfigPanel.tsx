import React, { useEffect, useRef } from 'react';
import type { WorkflowStep } from '../../../data/types';
import CatMiniAvatar from '../../../components/CatMiniAvatar';

interface TeamCat {
  id: string; name: string; role: string; catColors: any; accent: string; systemPrompt?: string;
}

interface StepConfigPanelProps {
  open: boolean;
  stepIndex: number;
  step: WorkflowStep;
  cats: TeamCat[];
  onClose: () => void;
  onUpdateStep: (index: number, field: keyof WorkflowStep, value: any) => void;
}

const StepConfigPanel: React.FC<StepConfigPanelProps> = ({
  open, stepIndex, step, cats,
  onClose, onUpdateStep,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const selectedCat = cats.find(c => c.id === step.agentId);

  // Esc 关闭
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const timer = setTimeout(() => document.addEventListener('mousedown', handleClick), 100);
    return () => { clearTimeout(timer); document.removeEventListener('mousedown', handleClick); };
  }, [open, onClose]);

  return (
    <>
      {/* 遮罩 */}
      {open && <div className="fixed inset-0 z-40" />}

      {/* 面板 */}
      <div
        ref={panelRef}
        className={`fixed top-0 right-0 h-full w-[380px] bg-white border-l border-gray-200 shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          <div className="w-8 h-8 rounded-full bg-primary-500 text-white text-sm font-black flex items-center justify-center">
            {stepIndex + 1}
          </div>
          {selectedCat ? (
            <>
              <CatMiniAvatar colors={selectedCat.catColors} size={28} />
              <span className="text-sm font-bold text-gray-900">{selectedCat.name}</span>
            </>
          ) : (
            <span className="text-sm font-bold text-gray-400">步骤 {stepIndex + 1} 配置</span>
          )}
          <button
            onClick={onClose}
            className="ml-auto w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* 执行猫猫 */}
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">执行猫猫</label>
            <div className="rounded-xl border border-gray-200 pr-3 bg-white">
              <select
                value={step.agentId}
                onChange={(e) => onUpdateStep(stepIndex, 'agentId', e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl text-sm font-medium outline-none cursor-pointer bg-transparent"
              >
                <option value="">选择猫猫...</option>
                {cats.map(c => <option key={c.id} value={c.id}>{c.name} ({c.role})</option>)}
              </select>
            </div>
          </div>

          {/* 猫猫角色信息 */}
          {selectedCat && (
            <div className="rounded-xl border border-primary-100 bg-primary-50/50 p-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-[10px] font-bold text-primary-700">Agent: {selectedCat.role}</span>
              </div>
              <p className="text-[10px] text-primary-600/80 leading-relaxed">
                输入输出统一为 text。调用此猫即调用其 agent 脚本。
              </p>
              {selectedCat.systemPrompt && (
                <p className="text-[10px] text-primary-600/60 leading-relaxed mt-2 line-clamp-3">
                  性格: {selectedCat.systemPrompt}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default StepConfigPanel;

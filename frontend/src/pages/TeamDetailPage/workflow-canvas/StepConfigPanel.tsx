import React, { useEffect, useRef } from 'react';
import type { WorkflowStep, StepParam } from '../../../data/types';
import CatMiniAvatar from '../../../components/CatMiniAvatar';

interface TeamCat {
  id: string; name: string; role: string; catColors: any; skills: any[]; accent: string;
}

interface StepConfigPanelProps {
  open: boolean;
  stepIndex: number;
  step: WorkflowStep;
  cats: TeamCat[];
  onClose: () => void;
  onUpdateStep: (index: number, field: keyof WorkflowStep, value: any) => void;
  onAddParam: (stepIndex: number) => void;
  onUpdateParam: (stepIndex: number, paramIndex: number, field: keyof StepParam, value: any) => void;
  onRemoveParam: (stepIndex: number, paramIndex: number) => void;
}

const StepConfigPanel: React.FC<StepConfigPanelProps> = ({
  open, stepIndex, step, cats,
  onClose, onUpdateStep, onAddParam, onUpdateParam, onRemoveParam,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const selectedCat = cats.find(c => c.id === step.agentId);
  const catSkills = selectedCat?.skills || [];

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
    // 延迟绑定避免打开瞬间触发
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

          {/* 技能 */}
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">技能</label>
            <div className="rounded-xl border border-gray-200 pr-3 bg-white">
              <select
                value={step.skillId}
                onChange={(e) => onUpdateStep(stepIndex, 'skillId', e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl text-sm font-medium outline-none cursor-pointer bg-transparent"
                disabled={!step.agentId}
              >
                <option value="">选择技能...</option>
                {catSkills.map((s: any) => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
              </select>
            </div>
          </div>

          {/* 具体行为 */}
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">具体行为</label>
            <input
              type="text"
              value={step.action}
              onChange={(e) => onUpdateStep(stepIndex, 'action', e.target.value)}
              placeholder="描述这步要做什么..."
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white focus:ring-2 focus:ring-primary-400 focus:border-transparent transition-all outline-none text-sm font-medium"
            />
          </div>

          {/* 用户参数配置 */}
          <div className="pt-2">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">用户参数配置</p>
            <div className="space-y-2">
              {(step.params || []).map((param, pi) => (
                <div key={pi} className="rounded-xl border border-gray-100 bg-gray-50/50 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-primary-600">P{pi + 1}</span>
                    <input
                      type="text"
                      value={param.key}
                      onChange={(e) => onUpdateParam(stepIndex, pi, 'key', e.target.value)}
                      placeholder="key"
                      className="flex-1 px-2 py-1 rounded-lg border border-gray-200 bg-white text-[10px] font-medium outline-none focus:ring-1 focus:ring-primary-300"
                    />
                    <input
                      type="text"
                      value={param.label}
                      onChange={(e) => onUpdateParam(stepIndex, pi, 'label', e.target.value)}
                      placeholder="显示标签"
                      className="flex-1 px-2 py-1 rounded-lg border border-gray-200 bg-white text-[10px] font-medium outline-none focus:ring-1 focus:ring-primary-300"
                    />
                    <button
                      onClick={() => onRemoveParam(stepIndex, pi)}
                      className="text-gray-400 hover:text-red-500 transition-colors p-0.5 cursor-pointer"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg border border-gray-200 pr-2 bg-white">
                      <select
                        value={param.type}
                        onChange={(e) => onUpdateParam(stepIndex, pi, 'type', e.target.value)}
                        className="px-2 py-1 rounded-lg text-[10px] font-medium outline-none cursor-pointer bg-transparent"
                      >
                        <option value="text">文本</option>
                        <option value="textarea">多行文本</option>
                        <option value="number">数字</option>
                        <option value="select">下拉选择</option>
                        <option value="tags">标签输入</option>
                        <option value="toggle">开关</option>
                        <option value="url">URL</option>
                      </select>
                    </div>
                    <input
                      type="text"
                      value={param.placeholder || ''}
                      onChange={(e) => onUpdateParam(stepIndex, pi, 'placeholder', e.target.value)}
                      placeholder="占位提示文本"
                      className="flex-1 px-2 py-1 rounded-lg border border-gray-200 bg-white text-[10px] font-medium outline-none focus:ring-1 focus:ring-primary-300"
                    />
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!param.required}
                        onChange={(e) => onUpdateParam(stepIndex, pi, 'required', e.target.checked)}
                        className="w-3 h-3 rounded cursor-pointer accent-primary-500"
                      />
                      <span className="text-[10px] font-bold text-gray-400">必填</span>
                    </label>
                  </div>
                  {param.description !== undefined && (
                    <input
                      type="text"
                      value={param.description || ''}
                      onChange={(e) => onUpdateParam(stepIndex, pi, 'description', e.target.value)}
                      placeholder="补充说明"
                      className="w-full px-2 py-1 rounded-lg border border-gray-200 bg-white text-[10px] font-medium outline-none focus:ring-1 focus:ring-primary-300"
                    />
                  )}
                </div>
              ))}
              <button
                onClick={() => onAddParam(stepIndex)}
                className="w-full py-2 border border-dashed border-gray-300 rounded-xl text-gray-400 hover:border-primary-400 hover:text-primary-500 transition-all text-[10px] font-bold cursor-pointer"
              >
                + 添加参数
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default StepConfigPanel;

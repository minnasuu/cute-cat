import React, { useEffect, useRef } from 'react';
import type { WorkflowStep } from '../../../data/types';
import CatMiniAvatar from '../../../components/CatMiniAvatar';

interface TeamCat {
  id: string; name: string; role: string; catColors: any; skills: any[]; accent: string; systemPrompt?: string;
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
  const catSkills = selectedCat?.skills || [];

  // 判断当前 skill 是否是接入 AI 的技能（基于 text-to-text / structured-output 等原型）
  const AI_PRIMITIVE_IDS = ['text-to-text', 'text-to-image', 'structured-output'];
  const AI_SKILL_IDS = ['ai-chat', 'generate-article', 'polish-text', 'generate-outline', 'news-to-article', 'summarize-news', 'meeting-notes', 'trend-analysis', 'generate-todo', 'assign-task', 'review-approve', 'site-analyze', 'quality-check', 'content-review', 'team-review', 'generate-image', 'css-generate', 'cat-training', 'recruit-cat'];
  const currentSkillDef = catSkills.find((s: any) => s.id === step.skillId);
  const isAiSkill = AI_SKILL_IDS.includes(step.skillId) || AI_PRIMITIVE_IDS.includes(step.skillId) || currentSkillDef?.primitiveId && AI_PRIMITIVE_IDS.includes(currentSkillDef.primitiveId);

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

          {/* 具体行为（可选描述，不影响 AI） */}
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
              步骤描述 <span className="text-gray-300 font-normal normal-case">(可选)</span>
            </label>
            <textarea
              value={step.action}
              onChange={(e) => onUpdateStep(stepIndex, 'action', e.target.value)}
              placeholder="备注这步做什么，仅用于说明..."
              rows={2}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white focus:ring-2 focus:ring-primary-400 focus:border-transparent transition-all outline-none text-sm font-medium resize-none"
            />
          </div>

          {/* 技能参数（由 skill 自动绑定，不可增删） */}
          {(step.params || []).length > 0 && (
            <div className="pt-2">
              <div className="flex items-center gap-2 mb-3">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">技能参数</p>
                <span className="px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-400 text-[8px] font-bold">
                  由技能定义 · 不可修改
                </span>
              </div>
              <div className="space-y-2">
                {(step.params || []).map((param, pi) => (
                  <div key={pi} className="rounded-xl border border-gray-100 bg-gray-50/50 p-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-primary-600">P{pi + 1}</span>
                      <span className="text-[11px] font-bold text-gray-700">{param.label || param.key}</span>
                      <span className="text-[9px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-md">{param.type}</span>
                      {param.required && (
                        <span className="text-[8px] font-bold text-red-400 bg-red-50 px-1 py-0.5 rounded">必填</span>
                      )}
                    </div>
                    {param.description && (
                      <p className="text-[10px] text-gray-400 mt-1">{param.description}</p>
                    )}
                    {param.placeholder && (
                      <p className="text-[9px] text-gray-300 mt-0.5 italic">提示: {param.placeholder}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 无参数时的提示 */}
          {(step.params || []).length === 0 && step.skillId && (
            <div className="pt-2">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">技能参数</p>
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/30 p-4 text-center">
                <p className="text-[10px] text-gray-400">该技能无需额外参数</p>
              </div>
            </div>
          )}

          {/* AI 技能提示：自动带入猫猫性格 */}
          {selectedCat && step.skillId && isAiSkill && (
            <div className="pt-2">
              <div className="rounded-xl border border-primary-100 bg-primary-50/50 p-3">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="text-xs">🧠</span>
                  <span className="text-[10px] font-bold text-primary-700">自动注入性格 Prompt</span>
                </div>
                <p className="text-[10px] text-primary-600/80 leading-relaxed line-clamp-3">
                  {selectedCat.systemPrompt || '（该猫猫暂无性格设定）'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default StepConfigPanel;

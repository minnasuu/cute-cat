import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import type { WorkflowStep, StepParam, ParamValueSource, SystemKey } from '../../../data/types';
import { SYSTEM_KEYS } from '../../../data/types';
import CatMiniAvatar from '../../../components/CatMiniAvatar';
import { AppIcon } from '../../../components/icons';

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

/* ────── 异步选项加载 Hook ────── */
const useAsyncOptions = (asyncOptionsFrom?: string, valueKey = 'id', labelKey = 'name') => {
  const [options, setOptions] = useState<{ label: string; value: string }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!asyncOptionsFrom) return;
    let cancelled = false;
    setLoading(true);

    const load = async () => {
      try {
        const backendUrl = import.meta.env.VITE_BACKEND_URL || (import.meta.env.PROD ? '' : 'http://localhost:8002');
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        const token = localStorage.getItem('accessToken');
        if (token) headers['Authorization'] = `Bearer ${token}`;

        // 替换路径中的 :teamId 占位符
        let url = asyncOptionsFrom;
        const teamMatch = window.location.pathname.match(/\/teams\/([^/]+)/);
        if (teamMatch) {
          url = url.replace(':teamId', teamMatch[1]);
        }

        const resp = await fetch(`${backendUrl}${url}`, { headers });
        if (resp.ok && !cancelled) {
          const data = await resp.json();
          if (Array.isArray(data)) {
            setOptions(data.map((item: any) => ({
              label: String(item[labelKey] || item.name || item.id || ''),
              value: String(item[valueKey] || item.id || ''),
            })));
          }
        }
      } catch (err) {
        console.warn('[StepConfigPanel] async options load failed:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [asyncOptionsFrom, valueKey, labelKey]);

  return { options, loading };
};

/* ────── 参数值输入控件 ────── */
const ParamInput: React.FC<{
  param: StepParam;
  onChange: (val: unknown) => void;
}> = ({ param, onChange }) => {
  const base = 'w-full px-3 py-2 rounded-lg border border-gray-200 bg-white focus:ring-2 focus:ring-primary-400 focus:border-transparent transition-all outline-none text-sm';
  const val = param.value;
  const { options: asyncOpts, loading: asyncLoading } = useAsyncOptions(
    param.asyncOptionsFrom,
    param.asyncOptionsValueKey,
    param.asyncOptionsLabelKey,
  );

  switch (param.type) {
    case 'textarea':
      return (
        <textarea
          value={String(val ?? '')}
          placeholder={param.placeholder || ''}
          rows={3}
          onChange={e => onChange(e.target.value)}
          className={`${base} resize-none`}
        />
      );
    case 'number':
      return (
        <input
          type="number"
          value={val !== undefined && val !== '' ? String(val) : ''}
          placeholder={param.placeholder || ''}
          onChange={e => onChange(e.target.value ? Number(e.target.value) : '')}
          className={base}
        />
      );
    case 'select': {
      // 合并静态 options 和异步加载的 options
      const mergedOptions = param.asyncOptionsFrom ? asyncOpts : (param.options || []);
      return (
        <div className="rounded-lg border border-gray-200 pr-2 bg-white">
          <select
            value={String(val ?? '')}
            onChange={e => onChange(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none cursor-pointer bg-transparent"
            disabled={asyncLoading}
          >
            <option value="">{asyncLoading ? '加载中...' : '请选择...'}</option>
            {mergedOptions.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      );
    }
    case 'toggle':
      return (
        <button
          type="button"
          onClick={() => onChange(!val)}
          className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${val ? 'bg-primary-500' : 'bg-gray-300'}`}
        >
          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${val ? 'left-[22px]' : 'left-0.5'}`} />
        </button>
      );
    case 'tags': {
      const tags: string[] = Array.isArray(val) ? val : [];
      const [draft, setDraft] = useState('');
      return (
        <div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-1.5">
              {tags.map((t, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary-50 text-primary-700 text-[11px] font-medium">
                  {t}
                  <button
                    type="button"
                    onClick={() => onChange(tags.filter((_, j) => j !== i))}
                    className="text-primary-400 hover:text-primary-600 cursor-pointer"
                  >×</button>
                </span>
              ))}
            </div>
          )}
          <input
            value={draft}
            placeholder={param.placeholder || '输入后回车添加'}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && draft.trim()) {
                e.preventDefault();
                onChange([...tags, draft.trim()]);
                setDraft('');
              }
            }}
            className={base}
          />
        </div>
      );
    }
    // text / url / fallback
    default:
      return (
        <input
          type={param.type === 'url' ? 'url' : 'text'}
          value={String(val ?? '')}
          placeholder={param.placeholder || ''}
          onChange={e => onChange(e.target.value)}
          className={base}
        />
      );
  }
};

/* ────── 值来源选择器 ────── */
const VALUE_SOURCE_OPTIONS: { value: ParamValueSource; label: string; icon: string; desc: string }[] = [
  { value: 'static',   label: '手动填写', icon: 'Pencil', desc: '直接配置固定值' },
  { value: 'upstream', label: '上游输出', icon: 'ArrowUp', desc: '取上一步的输出字段' },
  { value: 'system',   label: '系统注入', icon: 'Settings', desc: '运行时自动填充' },
];

const ValueSourceSelector: React.FC<{
  value: ParamValueSource;
  onChange: (v: ParamValueSource) => void;
}> = ({ value, onChange }) => (
  <div className="flex gap-1 mb-2">
    {VALUE_SOURCE_OPTIONS.map(opt => (
      <button
        key={opt.value}
        type="button"
        onClick={() => onChange(opt.value)}
        className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
          value === opt.value
            ? 'bg-primary-100 text-primary-700 border border-primary-300'
            : 'bg-gray-50 text-gray-400 border border-transparent hover:bg-gray-100 hover:text-gray-600'
        }`}
        title={opt.desc}
      >
        <AppIcon symbol={opt.icon} size={12} className="text-gray-600" />
        {opt.label}
      </button>
    ))}
  </div>
);

/* ────── 上游输出只读提示 ────── */
const UpstreamHint: React.FC = () => (
  <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3">
    <div className="flex items-center gap-1.5">
      <AppIcon symbol="ArrowUp" size={14} className="text-blue-600" />
      <span className="text-[11px] font-bold text-blue-600">来自上游步骤</span>
    </div>
    <p className="mt-1 text-[10px] text-blue-500/80">
      执行时将自动使用上一步的输出结果，无需手动填写
    </p>
  </div>
);

/* ────── 系统变量只读展示 ────── */
const SystemKeyDisplay: React.FC<{
  systemKey?: SystemKey;
  onChange: (key: SystemKey) => void;
}> = ({ systemKey, onChange }) => {
  const entries = Object.entries(SYSTEM_KEYS) as [SystemKey, string][];
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-[10px]">⚙️</span>
        <span className="text-[10px] text-gray-500">系统自动注入的值</span>
      </div>
      <div className="rounded-lg border border-gray-200 pr-2 bg-white">
        <select
          value={systemKey || ''}
          onChange={e => onChange(e.target.value as SystemKey)}
          className="w-full px-3 py-2 rounded-lg text-sm outline-none cursor-pointer bg-transparent"
        >
          <option value="">选择系统变量...</option>
          {entries.map(([key, desc]) => (
            <option key={key} value={key}>{desc}（{key}）</option>
          ))}
        </select>
      </div>
      {systemKey && (
        <p className="mt-1.5 text-[10px] text-gray-400 flex items-center gap-1">
          <span className="text-amber-500">ⓘ</span>
          执行时将自动使用「{SYSTEM_KEYS[systemKey]}」，无需手动填写
        </p>
      )}
    </div>
  );
};

const StepConfigPanel: React.FC<StepConfigPanelProps> = ({
  open, stepIndex, step, cats,
  onClose, onUpdateStep,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const selectedCat = cats.find(c => c.id === step.agentId);
  const catSkills = selectedCat?.skills || [];
  const [showAddMenu, setShowAddMenu] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);

  // 判断当前 skill 是否是接入 AI 的技能
  const AI_PRIMITIVE_IDS = ['text-to-text', 'text-to-image', 'structured-output'];
  const AI_SKILL_IDS = ['aigc', 'ai-chat', 'generate-article',  'generate-outline', 'meeting-notes', 'assign-task', 'content-review', 'team-review', 'generate-image', 'cat-training', 'recruit-cat'];
  const currentSkillDef = catSkills.find((s: any) => s.id === step.skillId);
  const isAiSkill = AI_SKILL_IDS.includes(step.skillId) || AI_PRIMITIVE_IDS.includes(step.skillId) || currentSkillDef?.primitiveId && AI_PRIMITIVE_IDS.includes(currentSkillDef.primitiveId);

  // 当前技能绑定的全部参数定义模板（从猫猫 skills 获取）
  const allParamDefs: StepParam[] = useMemo(() => {
    if (!step.skillId) return [];
    const fromCat = catSkills.find((s: any) => s.id === step.skillId);
    return fromCat?.paramDefs || [];
  }, [step.skillId, catSkills]);

  // 当前已展示的参数 keys
  const currentParamKeys = useMemo(() => new Set((step.params || []).map(p => p.key)), [step.params]);

  // 可以添加回的参数（已被删除的非必填项）
  const addableParams = useMemo(
    () => allParamDefs.filter(p => !currentParamKeys.has(p.key)),
    [allParamDefs, currentParamKeys],
  );

  // 删除参数
  const handleRemoveParam = useCallback((key: string) => {
    const newParams = (step.params || []).filter(p => p.key !== key);
    onUpdateStep(stepIndex, 'params', newParams);
  }, [step.params, stepIndex, onUpdateStep]);

  // 添加参数
  const handleAddParam = useCallback((paramDef: StepParam) => {
    const newParam = { ...paramDef };
    const newParams = [...(step.params || []), newParam];
    onUpdateStep(stepIndex, 'params', newParams);
    setShowAddMenu(false);
  }, [step.params, stepIndex, onUpdateStep]);

  // 更新参数值
  const handleParamValueChange = useCallback((key: string, value: unknown) => {
    const newParams = (step.params || []).map(p =>
      p.key === key ? { ...p, value } : p,
    );
    onUpdateStep(stepIndex, 'params', newParams);
  }, [step.params, stepIndex, onUpdateStep]);

  // 切换参数值来源
  const handleParamSourceChange = useCallback((key: string, valueSource: ParamValueSource) => {
    const newParams = (step.params || []).map(p =>
      p.key === key ? { ...p, valueSource } : p,
    );
    onUpdateStep(stepIndex, 'params', newParams);
  }, [step.params, stepIndex, onUpdateStep]);

  // 更新 system key
  const handleSystemKeyChange = useCallback((key: string, systemKey: SystemKey) => {
    const newParams = (step.params || []).map(p =>
      p.key === key ? { ...p, systemKey } : p,
    );
    onUpdateStep(stepIndex, 'params', newParams);
  }, [step.params, stepIndex, onUpdateStep]);

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

  // 点击外部关闭添加菜单
  useEffect(() => {
    if (!showAddMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setShowAddMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showAddMenu]);

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

          {/* 执行能力（官方猫统一 AIGC） */}
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">执行能力</label>
            <div className="rounded-xl border border-gray-200 pr-3 bg-white">
              <select
                value={step.skillId}
                onChange={(e) => onUpdateStep(stepIndex, 'skillId', e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl text-sm font-medium outline-none cursor-pointer bg-transparent"
                disabled={!step.agentId}
              >
                <option value="">选择...</option>
                {catSkills.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          {/* 具体行为（可选描述） */}
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
              {isAiSkill?'User Prompt':'步骤描述'} <span className="text-gray-300 font-normal normal-case"></span>
            </label>
            <textarea
              value={step.action}
              onChange={(e) => onUpdateStep(stepIndex, 'action', e.target.value)}
              placeholder="备注这步做什么，对于非AI技能仅用于说明..."
              rows={2}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white focus:ring-2 focus:ring-primary-400 focus:border-transparent transition-all outline-none text-sm font-medium resize-none"
            />
          </div>

          {/* ── 技能参数（由 skill 绑定，默认全部展开、支持填写/删除/添加回） ── */}
          {step.skillId && allParamDefs.length > 0 && (
            <div className="pt-2">
              <div className="flex items-center gap-2 mb-3">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">技能参数</p>
                <span className="px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-400 text-[8px] font-bold">
                  由技能定义 · 可删除非必填项
                </span>
              </div>

              <div className="space-y-3">
                {(step.params || []).map((param, pi) => {
                  const source = param.valueSource || 'static';
                  return (
                  <div key={param.key} className="rounded-xl border border-gray-100 bg-gray-50/50 p-3">
                    {/* 参数标题行 */}
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[10px] font-bold text-primary-600">P{pi + 1}</span>
                      <span className="text-[11px] font-bold text-gray-700">{param.label || param.key}</span>
                      <span className="text-[9px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-md">{param.type}</span>
                      {param.required && (
                        <span className="text-[8px] font-bold text-red-400 bg-red-50 px-1 py-0.5 rounded">必填</span>
                      )}
                      {/* 非必填项：删除按钮 */}
                      {!param.required && (
                        <button
                          type="button"
                          onClick={() => handleRemoveParam(param.key)}
                          className="ml-auto w-5 h-5 rounded flex items-center justify-center text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors cursor-pointer"
                          title="移除此参数"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 6L6 18M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                    {/* 参数描述 */}
                    {param.description && (
                      <p className="text-[10px] text-gray-400 mb-2">{param.description}</p>
                    )}
                    {/* 值来源选择器 */}
                    <ValueSourceSelector
                      value={source}
                      onChange={(v) => handleParamSourceChange(param.key, v)}
                    />
                    {/* 根据 valueSource 显示不同控件 */}
                    {source === 'static' && (
                      <ParamInput
                        param={param}
                        onChange={(val) => handleParamValueChange(param.key, val)}
                      />
                    )}
                    {source === 'upstream' && (
                      <UpstreamHint />
                    )}
                    {source === 'system' && (
                      <SystemKeyDisplay
                        systemKey={param.systemKey}
                        onChange={(key) => handleSystemKeyChange(param.key, key)}
                      />
                    )}
                  </div>
                  );
                })}
              </div>

              {/* 添加已删除的参数 */}
              {addableParams.length > 0 && (
                <div className="relative mt-3">
                  <button
                    type="button"
                    onClick={() => setShowAddMenu(!showAddMenu)}
                    className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-gray-200 text-gray-400 hover:text-primary-500 hover:border-primary-300 hover:bg-primary-50/30 transition-all text-[11px] font-bold cursor-pointer"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    添加参数（{addableParams.length} 个可用）
                  </button>
                  {showAddMenu && (
                    <div
                      ref={addMenuRef}
                      className="absolute left-0 right-0 top-full mt-1 bg-white rounded-xl border border-gray-200 shadow-lg z-10 overflow-hidden"
                    >
                      {addableParams.map(p => (
                        <button
                          key={p.key}
                          type="button"
                          onClick={() => handleAddParam(p)}
                          className="w-full text-left px-3 py-2.5 flex items-center gap-2 hover:bg-primary-50 transition-colors cursor-pointer"
                        >
                          <span className="text-[11px] font-bold text-gray-700">{p.label || p.key}</span>
                          <span className="text-[9px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-md">{p.type}</span>
                          {p.description && (
                            <span className="text-[9px] text-gray-400 ml-auto truncate max-w-[120px]">{p.description}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 无参数定义时的提示 */}
          {step.skillId && allParamDefs.length === 0 && (
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
                  <AppIcon symbol="Brain" size={14} className="text-violet-600" />
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

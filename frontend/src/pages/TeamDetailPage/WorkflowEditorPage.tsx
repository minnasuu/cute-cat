import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { apiClient } from '../../utils/apiClient';
import { showToast } from '../../components/Toast';
import CatLogo from '../../components/CatLogo';
import CatMiniAvatar from '../../components/CatMiniAvatar';
import type { WorkflowStep, StepParam } from '../../data/types';
import { skillPool } from '../../data/skills';
import { aiGenerateWorkflow } from './handleAiGenerateWorkflow';
import type { SuggestedCat, SuggestedSkill } from './handleAiGenerateWorkflow';

interface TeamCat {
  id: string; name: string; role: string; catColors: any; skills: any[]; accent: string;
}

const WorkflowEditorPage: React.FC = () => {
  const { teamId, workflowId } = useParams<{ teamId: string; workflowId: string }>();
  const navigate = useNavigate();
  const isEditing = workflowId && workflowId !== 'new';

  const [cats, setCats] = useState<TeamCat[]>([]);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('📋');
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState<WorkflowStep[]>([{ agentId: '', skillId: '', action: '' }]);
  const [trigger, setTrigger] = useState('manual');
  const [cron, setCron] = useState('');
  const [scheduled, setScheduled] = useState(false);
  const [scheduledEnabled, setScheduledEnabled] = useState(false);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [persistent, setPersistent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [configTab, setConfigTab] = useState<'basic' | 'steps'>('basic');
  const [expandedStepParams, setExpandedStepParams] = useState<Set<number>>(new Set());
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [suggestionMode, setSuggestionMode] = useState(false);
  const [suggestedCats, setSuggestedCats] = useState<SuggestedCat[]>([]);
  const [suggestedSkills, setSuggestedSkills] = useState<SuggestedSkill[]>([]);
  const [suggestionSummary, setSuggestionSummary] = useState('');


  const NAV_ITEMS = [
    { id: 'basic' as const, label: '基本信息' },
    { id: 'steps' as const, label: '工作流步骤' },
  ];

  useEffect(() => {
    apiClient.get(`/api/cats/team/${teamId}`).then(setCats).catch(console.error);
    if (isEditing) {
      apiClient.get(`/api/workflows/${workflowId}`).then(wf => {
        setName(wf.name);
        setIcon(wf.icon || '📋');
        setDescription(wf.description);
        setSteps(wf.steps || []);
        const isCron = wf.trigger === 'cron' || !!wf.scheduled;
        setTrigger(isCron ? 'cron' : 'manual');
        setCron(wf.cron || '');
        setScheduled(isCron);
        setScheduledEnabled(wf.enabled !== undefined ? !!wf.enabled : !!wf.scheduledEnabled);
        setStartTime(wf.startTime || '');
        setEndTime(wf.endTime || '');
        setPersistent(!!wf.persistent);
      }).catch(() => navigate(`/teams/${teamId}`));
    }
  }, [teamId, workflowId, isEditing, navigate]);

  const addStep = () => setSteps(prev => [...prev, { agentId: '', skillId: '', action: '' }]);

  const removeStep = (index: number) => setSteps(prev => prev.filter((_, i) => i !== index));

  const updateStep = (index: number, field: keyof WorkflowStep, value: any) => {
    setSteps(prev => prev.map((s, i) => {
      if (i !== index) return s;
      const updated = { ...s, [field]: value };
      if (field === 'agentId') {
        updated.skillId = '';
        updated.params = [];
      }
      if (field === 'skillId' && value) {
        const cat = cats.find(c => c.id === s.agentId);
        const skill = cat?.skills?.find((sk: any) => sk.id === value);
        // 优先从猫猫技能取 paramDefs，fallback 到 skillPool
        const paramDefs = skill?.paramDefs || skillPool.find(sp => sp.id === value)?.paramDefs;
        if (paramDefs?.length) {
          updated.params = paramDefs.map((p: any) => ({ ...p }));
          setExpandedStepParams(prev => new Set([...prev, index]));
        } else if (!updated.params?.length) {
          updated.params = [];
        }
      }
      return updated;
    }));
  };

  const addStepParam = (stepIndex: number) => {
    setSteps(prev => prev.map((s, i) => {
      if (i !== stepIndex) return s;
      const newParam: StepParam = { key: '', label: '', type: 'text' };
      return { ...s, params: [...(s.params || []), newParam] };
    }));
  };

  const updateStepParam = (stepIndex: number, paramIndex: number, field: keyof StepParam, value: any) => {
    setSteps(prev => prev.map((s, i) => {
      if (i !== stepIndex) return s;
      const params = [...(s.params || [])];
      params[paramIndex] = { ...params[paramIndex], [field]: value };
      return { ...s, params };
    }));
  };

  const removeStepParam = (stepIndex: number, paramIndex: number) => {
    setSteps(prev => prev.map((s, i) => {
      if (i !== stepIndex) return s;
      return { ...s, params: (s.params || []).filter((_, pi) => pi !== paramIndex) };
    }));
  };

  const toggleStepParamsExpand = (index: number) => {
    setExpandedStepParams(prev => {
      const next = new Set(prev);
      next.has(index) ? next.delete(index) : next.add(index);
      return next;
    });
  };

  const handleDragStart = (index: number) => {
    setDragIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) return;
    setDragOverIndex(index);
  };

  const handleDrop = (index: number) => {
    if (dragIndex === null || dragIndex === index) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }
    setSteps(prev => {
      const next = [...prev];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(index, 0, moved);
      return next;
    });
    // 同步更新展开状态
    setExpandedStepParams(prev => {
      const arr = Array.from(prev);
      const next = new Set<number>();
      for (const old of arr) {
        if (old === dragIndex) {
          next.add(index);
        } else if (dragIndex < index) {
          next.add(old >= dragIndex && old <= index ? old - 1 : old);
        } else {
          next.add(old <= dragIndex && old >= index ? old + 1 : old);
        }
      }
      return next;
    });
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const handleSave = async () => {
    if (!name.trim()) { showToast('请输入工作流名称', 'warning'); return; }
    if (steps.length === 0) { showToast('请至少添加一个步骤', 'warning'); return; }
    setSaving(true);
    try {
      const isScheduled = trigger === 'cron';
      const data = {
        name, icon, description, steps,
        scheduled: isScheduled,
        scheduledEnabled: isScheduled ? scheduledEnabled : false,
        cron: isScheduled ? cron : undefined,
        startTime: startTime || undefined,
        endTime: endTime || undefined,
        persistent,
      };
      if (isEditing) {
        await apiClient.put(`/api/workflows/${workflowId}`, data);
      } else {
        await apiClient.post(`/api/workflows/team/${teamId}`, data);
      }
      navigate(`/teams/${teamId}`);
    } catch {
      // toast shown by apiClient
    } finally {
      setSaving(false);
    }
  };

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    setSuggestionMode(false);
    setSuggestedCats([]);
    setSuggestedSkills([]);
    setSuggestionSummary('');
    try {
      const result = await aiGenerateWorkflow(aiPrompt, cats);
      if (!result) return;

      if (result.name) setName(result.name);
      if (result.icon) setIcon(result.icon);
      if (result.description) setDescription(result.description);
      if (Array.isArray(result.steps)) setSteps(result.steps);
      if (result.scheduled) {
        setTrigger('cron');
        setScheduled(true);
        setScheduledEnabled(true);
        if (result.cron) setCron(result.cron);
        if (result.startTime) setStartTime(result.startTime);
        if (result.endTime) setEndTime(result.endTime);
      }
      if (result.persistent !== undefined) setPersistent(result.persistent);

      if (result.suggestionMode) {
        // 查找团队中的默认猫猫 CAT（role === 'Default'）
        const defaultCat = cats.find(c => c.role === 'Default');
        if (defaultCat && Array.isArray(result.steps)) {
          // 将空 agentId 的步骤自动分配给 CAT，技能设为 ai-chat
          const patchedSteps = result.steps.map(s => {
            if (!s.agentId) {
              return { ...s, agentId: defaultCat.id, skillId: 'ai-chat' };
            }
            return s;
          });
          setSteps(patchedSteps);
          setSuggestionSummary(result.suggestionSummary || '部分步骤已自动由默认猫猫 CAT 承接，建议添加专业猫猫以获得更好效果');
        } else {
          setSuggestionSummary(result.suggestionSummary || '当前团队缺少完成该工作流所需的猫猫或技能');
        }
        setSuggestionMode(true);
        setSuggestedCats(result.suggestedCats || []);
        setSuggestedSkills(result.suggestedSkills || []);
      }
    } finally {
      setAiLoading(false);
    }
  };

  const dismissSuggestion = () => {
    setSuggestionMode(false);
    setSuggestedCats([]);
    setSuggestedSkills([]);
    setSuggestionSummary('');
  };

  const validSteps = steps.filter(s => s.agentId && s.skillId);

  return (
    <div className="h-screen flex flex-col bg-surface text-text-primary selection:bg-primary-100 selection:text-primary-900">
      {/* Header */}
      <section className="relative flex items-center justify-between h-20 px-6">
        <div className="absolute top-0 left-1/4 w-72 h-72 bg-accent-100/30 rounded-full blur-[100px] -z-10 pointer-events-none" />
        <div className="absolute top-8 right-1/4 w-72 h-72 bg-primary-100/30 rounded-full blur-[100px] -z-10 pointer-events-none" />

        <div className="flex items-center">
          <button
            onClick={() => navigate(`/teams/${teamId}`)}
            className="flex items-center gap-1.5 text-sm font-medium text-text-tertiary hover:text-text-secondary transition-colors cursor-pointer"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            返回团队
          </button>
          <div className="w-px h-4 bg-black/10 mx-2" />
          <h1 className="text-xl md:text-2xl font-black tracking-tight">
            {isEditing ? '编辑工作流' : '创建工作流'}
          </h1>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="ml-auto px-6 py-3 text-sm font-bold bg-text-primary text-text-inverse rounded-full hover:scale-105 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
        >
          {saving ? '保存中...' : '保存工作流'}
        </button>
      </section>

      <main className="flex-1 h-px max-w-6xl mx-auto px-6 flex flex-col w-full">
        <section className="flex-1 h-px pb-4">
          <div className="flex gap-8 md:flex-row flex-col h-full">
            {/* Left: Preview */}
            <div className="flex-2 flex flex-col items-center overflow-y-auto">
              <div className="bg-surface rounded-[28px] border border-border p-8 w-full flex flex-col items-center">
                <div className="w-20 h-20 rounded-3xl flex items-center justify-center text-4xl mb-4 bg-accent-50 border border-accent-100">
                  {icon}
                </div>
                <h3 className="text-xl font-black text-text-primary">{name || '新工作流'}</h3>
                {description && <p className="text-sm text-text-secondary font-medium mt-2 text-center max-w-xs">{description}</p>}
                <div className="flex items-center gap-2 mt-3 flex-wrap justify-center">
                  <span className={`px-3 py-1 rounded-full text-[10px] font-bold border ${trigger === 'cron' ? 'bg-accent-50 text-accent-600 border-accent-200' : 'bg-surface-secondary text-text-tertiary border-border'}`}>
                    {trigger === 'cron' ? `⏰ ${cron || '定时触发'}` : '🖱️ 手动触发'}
                  </span>
                  <span className="px-3 py-1 rounded-full bg-surface-secondary border border-border text-[10px] font-bold text-text-tertiary">
                    {steps.length} 个步骤
                  </span>
                  {startTime && endTime && (
                    <span className="px-3 py-1 rounded-full bg-surface-secondary border border-border text-[10px] font-bold text-text-tertiary">
                      {startTime} ~ {endTime}
                    </span>
                  )}
                  {scheduled && scheduledEnabled && (
                    <span className="px-3 py-1 rounded-full bg-accent-50 border border-accent-200 text-[10px] font-bold text-accent-600">
                      调度中
                    </span>
                  )}
                  {persistent && (
                    <span className="px-3 py-1 rounded-full bg-primary-50 border border-primary-200 text-[10px] font-bold text-primary-600">
                      持久化
                    </span>
                  )}
                </div>
              </div>

              {/* Steps mini preview */}
              {validSteps.length > 0 && (
                <div className="w-full mt-5">
                  <p className="text-xs font-bold text-text-tertiary uppercase tracking-widest mb-3">流程预览</p>
                  <div className="space-y-1">
                    {validSteps.map((step, i) => {
                      const cat = cats.find(c => c.id === step.agentId);
                      const skill = cat?.skills?.find((s: any) => s.id === step.skillId);
                      return (
                        <div key={i} className="flex items-center gap-2">
                          {i > 0 && <div className="w-5 flex justify-center -my-1"><div className="w-px h-3 bg-border-strong" /></div>}
                          {i > 0 && <div className="flex-1" />}
                          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface border border-border w-full">
                            <span className="w-5 h-5 bg-accent-500 text-text-inverse text-[10px] font-bold rounded-full flex items-center justify-center shrink-0">{i + 1}</span>
                            {cat && <CatMiniAvatar colors={cat.catColors} size={20} />}
                            <span className="text-xs font-bold text-text-primary truncate">{cat?.name || '—'}</span>
                            <span className="text-[10px] text-text-tertiary truncate">{skill?.name || ''}</span>
                            {step.params && step.params.length > 0 && (
                              <span className="ml-auto px-1.5 py-0.5 rounded bg-accent-100 text-accent-600 text-[8px] font-bold shrink-0">{step.params.length} 参数</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* AI Generate */}
              <div className="w-full mt-5 p-4 rounded-2xl bg-accent-50/50 border border-accent-100">
                <p className="text-xs font-bold text-accent-700 mb-2">AI 智能建流</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder="描述你想要自动化的任务..."
                    className="flex-1 px-3.5 py-2.5 rounded-xl border border-accent-200 bg-surface focus:ring-2 focus:ring-accent-400 focus:border-transparent outline-none text-xs font-medium"
                  />
                  <button
                    onClick={handleAiGenerate}
                    disabled={aiLoading || !aiPrompt.trim()}
                    className="px-4 py-2.5 bg-accent-500 text-text-inverse text-xs font-bold rounded-xl hover:bg-accent-600 transition-colors disabled:opacity-50 whitespace-nowrap cursor-pointer"
                  >
                    {aiLoading ? '生成中...' : 'AI 生成'}
                  </button>
                </div>
              </div>

              {/* Suggestion Mode Panel */}
              {suggestionMode && (
                <div className="w-full mt-4 rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50/60 shrink-0">
                  <div className="flex items-center justify-between px-4 pt-4 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-amber-400 text-white text-xs font-bold flex items-center justify-center">!</span>
                      <span className="text-xs font-bold text-amber-800">能力补充建议</span>
                    </div>
                    <button
                      onClick={dismissSuggestion}
                      className="text-amber-400 hover:text-amber-600 transition-colors p-1 cursor-pointer"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                  </div>
                  <p className="px-4 pb-3 text-[11px] text-amber-700 font-medium">{suggestionSummary}</p>

                  {suggestedCats.length > 0 && (
                    <div className="px-4 pb-3">
                      <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mb-2">建议添加猫猫</p>
                      <div className="space-y-2">
                        {suggestedCats.map((sc, i) => (
                          <div key={i} className="flex items-center gap-2 rounded-xl bg-white/70 border border-amber-200 px-3 py-2.5">
                            <span className="text-lg">🐱</span>
                            <div className="flex-1 min-w-0">
                              <span className="text-xs font-bold text-text-primary block">{sc.role}</span>
                              <span className="text-[10px] text-text-tertiary block truncate">{sc.reason}</span>
                              {sc.suggestedSkills.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {sc.suggestedSkills.map((sid) => (
                                    <span key={sid} className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[8px] font-bold">{sid}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                            <button
                              onClick={() => navigate(`/teams/${teamId}/cats/new`)}
                              className="shrink-0 px-3 py-1.5 bg-amber-500 text-white text-[10px] font-bold rounded-lg hover:bg-amber-600 transition-colors cursor-pointer"
                            >
                              去添加
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {suggestedSkills.length > 0 && (
                    <div className="px-4 pb-4">
                      <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mb-2">建议补充技能</p>
                      <div className="space-y-2">
                        {suggestedSkills.map((ss, i) => {
                          const cat = cats.find(c => c.id === ss.agentId);
                          return (
                            <div key={i} className="flex items-center gap-2 rounded-xl bg-white/70 border border-amber-200 px-3 py-2.5">
                              {cat && <CatMiniAvatar colors={cat.catColors} size={20} />}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-bold text-text-primary">{ss.agentName}</span>
                                  <span className="text-[10px] text-text-tertiary">+</span>
                                  <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-bold">{ss.skillName}</span>
                                </div>
                                <span className="text-[10px] text-text-tertiary block truncate">{ss.reason}</span>
                              </div>
                              <button
                                onClick={() => navigate(`/teams/${teamId}/cats/${ss.agentId}`)}
                                className="shrink-0 px-3 py-1.5 bg-amber-500 text-white text-[10px] font-bold rounded-lg hover:bg-amber-600 transition-colors cursor-pointer"
                              >
                                去配置
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right: Config */}
            <div className="flex-3 flex flex-col h-full">
              {/* Tabs */}
              <div className="flex gap-1 mb-3 bg-surface-tertiary/60 rounded-2xl p-1 w-fit">
                {NAV_ITEMS.map(item => (
                  <button
                    key={item.id}
                    onClick={() => setConfigTab(item.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                      configTab === item.id
                        ? 'bg-surface text-text-primary shadow-sm'
                        : 'text-text-tertiary hover:text-text-secondary'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {/* Panel */}
              <div className="flex-1 h-px rounded-[24px] border border-border overflow-y-auto">
                {/* Basic Info */}
                {configTab === 'basic' && (
                  <div className="p-6 space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-text-tertiary uppercase tracking-widest mb-2">名称</label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="工作流名称"
                        className="w-full px-4 py-3 rounded-2xl border border-border-strong bg-surface-secondary focus:bg-surface focus:ring-2 focus:ring-primary-400 focus:border-transparent transition-all outline-none text-sm font-medium"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-text-tertiary uppercase tracking-widest mb-2">描述</label>
                      <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="这个工作流做什么..."
                        rows={2}
                        className="w-full px-4 py-3 rounded-2xl border border-border-strong bg-surface-secondary focus:bg-surface focus:ring-2 focus:ring-primary-400 focus:border-transparent transition-all outline-none text-sm font-medium resize-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-text-tertiary uppercase tracking-widest mb-2">触发方式</label>
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setTrigger('manual'); setScheduled(false); }}
                          className={`flex-1 px-4 py-3 rounded-2xl border text-sm font-bold transition-all cursor-pointer ${
                            trigger === 'manual'
                              ? 'border-primary-400 bg-primary-50 text-primary-700 shadow-sm'
                              : 'border-border hover:border-border-strong text-text-secondary'
                          }`}
                        >
                          🖱️ 手动触发
                        </button>
                        <button
                          onClick={() => { setTrigger('cron'); setScheduled(true); }}
                          className={`flex-1 px-4 py-3 rounded-2xl border text-sm font-bold transition-all cursor-pointer ${
                            trigger === 'cron'
                              ? 'border-accent-400 bg-accent-50 text-accent-700 shadow-sm'
                              : 'border-border hover:border-border-strong text-text-secondary'
                          }`}
                        >
                          ⏰ 定时触发
                        </button>
                      </div>
                    </div>
                    {trigger === 'cron' && (
                      <>
                        <div>
                          <label className="block text-xs font-bold text-text-tertiary uppercase tracking-widest mb-2">定时规则 (CRON)</label>
                          <input
                            type="text"
                            value={cron}
                            onChange={(e) => setCron(e.target.value)}
                            placeholder="例如：每周五 18:00"
                            className="w-full px-4 py-3 rounded-2xl border border-border-strong bg-surface-secondary focus:bg-surface focus:ring-2 focus:ring-primary-400 focus:border-transparent transition-all outline-none text-sm font-medium"
                          />
                        </div>
                        <div className="flex gap-3">
                          <div className="flex-1">
                            <label className="block text-xs font-bold text-text-tertiary uppercase tracking-widest mb-2">预计开始时间</label>
                            <input
                              type="time"
                              value={startTime}
                              onChange={(e) => setStartTime(e.target.value)}
                              className="w-full px-4 py-3 rounded-2xl border border-border-strong bg-surface-secondary focus:bg-surface focus:ring-2 focus:ring-primary-400 focus:border-transparent transition-all outline-none text-sm font-medium"
                            />
                          </div>
                          <div className="flex-1">
                            <label className="block text-xs font-bold text-text-tertiary uppercase tracking-widest mb-2">预计结束时间</label>
                            <input
                              type="time"
                              value={endTime}
                              onChange={(e) => setEndTime(e.target.value)}
                              className="w-full px-4 py-3 rounded-2xl border border-border-strong bg-surface-secondary focus:bg-surface focus:ring-2 focus:ring-primary-400 focus:border-transparent transition-all outline-none text-sm font-medium"
                            />
                          </div>
                        </div>
                        <div className="flex items-center justify-between px-4 py-3 rounded-2xl border border-border bg-surface-secondary/40">
                          <div>
                            <span className="text-sm font-bold text-text-primary">启用定时调度</span>
                            <p className="text-[10px] text-text-tertiary mt-0.5">开启后将按规则自动执行</p>
                          </div>
                          <button
                            onClick={() => setScheduledEnabled(!scheduledEnabled)}
                            className={`w-11 h-6 rounded-full transition-all cursor-pointer relative ${scheduledEnabled ? 'bg-accent-500' : 'bg-surface-tertiary'}`}
                          >
                            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${scheduledEnabled ? 'left-[22px]' : 'left-0.5'}`} />
                          </button>
                        </div>
                      </>
                    )}
                    <div className="flex items-center justify-between px-4 py-3 rounded-2xl border border-border bg-surface-secondary/40">
                      <div>
                        <span className="text-sm font-bold text-text-primary">持久化保存</span>
                        <p className="text-[10px] text-text-tertiary mt-0.5">保存工作流历史记录与结果</p>
                      </div>
                      <button
                        onClick={() => setPersistent(!persistent)}
                        className={`w-11 h-6 rounded-full transition-all cursor-pointer relative ${persistent ? 'bg-primary-500' : 'bg-surface-tertiary'}`}
                      >
                        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${persistent ? 'left-[22px]' : 'left-0.5'}`} />
                      </button>
                    </div>
                  </div>
                )}

                {/* Steps */}
                {configTab === 'steps' && (
                  <div className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <span className="px-2.5 py-1 rounded-full bg-primary-50 border border-primary-200 text-[10px] font-bold text-primary-600">
                        {steps.length} 个步骤
                      </span>
                      {cats.length === 0 && (
                        <span className="text-[10px] font-bold text-danger-500">
                          团队暂无猫猫，
                          <button onClick={() => navigate(`/teams/${teamId}/cats/new`)} className="underline cursor-pointer hover:text-danger-600">去添加</button>
                        </span>
                      )}
                    </div>
                    <div className="space-y-3">
                      {steps.map((step, index) => {
                        const selectedCat = cats.find(c => c.id === step.agentId);
                        const catSkills = selectedCat?.skills || [];
                        const hasParams = (step.params?.length || 0) > 0;
                        const isParamsExpanded = expandedStepParams.has(index);
                        return (
                          <div
                            key={index}
                            draggable
                            onDragStart={() => handleDragStart(index)}
                            onDragOver={(e) => handleDragOver(e, index)}
                            onDrop={() => handleDrop(index)}
                            onDragEnd={handleDragEnd}
                            className={`rounded-2xl border p-4 transition-all ${
                              dragIndex === index ? 'opacity-40 scale-[0.98]' : ''
                            } ${
                              dragOverIndex === index && dragIndex !== index ? 'ring-2 ring-accent-400 border-accent-400' : ''
                            } ${!step.agentId && suggestionMode ? 'border-amber-300 bg-amber-50/30' : 'border-border bg-surface-secondary/40'}`}
                          >
                            <div className="flex items-center gap-2 mb-3">
                              <span
                                className="cursor-grab active:cursor-grabbing text-text-tertiary hover:text-text-secondary shrink-0 touch-none"
                                title="拖拽排序"
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>
                              </span>
                              <span className={`w-6 h-6 text-text-inverse text-xs font-bold rounded-full flex items-center justify-center shrink-0 ${!step.agentId && suggestionMode ? 'bg-amber-400' : 'bg-accent-500'}`}>{index + 1}</span>
                              {!step.agentId && suggestionMode && (
                                <span className="px-2 py-0.5 rounded-full bg-amber-100 border border-amber-200 text-amber-700 text-[9px] font-bold">需补充猫猫</span>
                              )}
                              {index > 0 && (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] text-text-tertiary font-medium">接收来自</span>
                                  <div className="rounded-lg border border-border-strong pr-2 bg-surface">
                                    <select
                                      value={step.inputFrom || ''}
                                      onChange={(e) => updateStep(index, 'inputFrom', e.target.value || undefined)}
                                      className="px-2 py-1 rounded-lg text-[10px] font-medium outline-none cursor-pointer"
                                    >
                                      <option value="">上一步</option>
                                      {steps.slice(0, index).map((s, si) => {
                                        const c = cats.find(ct => ct.id === s.agentId);
                                        return <option key={si} value={s.agentId}>{c?.name || s.agentId}</option>;
                                      })}
                                    </select>
                                  </div>
                                </div>
                              )}
                              {steps.length > 1 && (
                                <button
                                  onClick={() => removeStep(index)}
                                  className="ml-auto text-text-tertiary hover:text-danger-500 transition-colors p-1 rounded-lg hover:bg-danger-50 cursor-pointer"
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                                </button>
                              )}
                            </div>
                            <div className="space-y-2.5">
                              <div className="flex gap-2.5">
                                <div className="flex-1">
                                  <label className="block text-[10px] font-bold text-text-tertiary uppercase tracking-widest mb-1.5">执行猫猫</label>
                                  <div className="rounded-xl border border-border-strong pr-3 bg-surface">
                                    <select
                                      value={step.agentId}
                                      onChange={(e) => updateStep(index, 'agentId', e.target.value)}
                                      className="w-full px-3 py-2.5 rounded-xl text-sm font-medium outline-none cursor-pointer"
                                    >
                                      <option value="">选择猫猫...</option>
                                      {cats.map(c => <option key={c.id} value={c.id}>{c.name} ({c.role})</option>)}
                                    </select>
                                  </div>
                                </div>
                                <div className="flex-1">
                                  <label className="block text-[10px] font-bold text-text-tertiary uppercase tracking-widest mb-1.5">技能</label>
                                  <div className="rounded-xl border border-border-strong pr-3 bg-surface">
                                    <select
                                      value={step.skillId}
                                      onChange={(e) => updateStep(index, 'skillId', e.target.value)}
                                      className="w-full px-3 py-2.5 rounded-xl text-sm font-medium outline-none cursor-pointer"
                                      disabled={!step.agentId}
                                    >
                                      <option value="">选择技能...</option>
                                      {catSkills.map((s: any) => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
                                    </select>
                                  </div>
                                </div>
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-text-tertiary uppercase tracking-widest mb-1.5">具体行为</label>
                                <input
                                  type="text"
                                  value={step.action}
                                  onChange={(e) => updateStep(index, 'action', e.target.value)}
                                  placeholder="描述这步要做什么..."
                                  className="w-full px-3 py-2.5 rounded-xl border border-border-strong bg-surface focus:ring-2 focus:ring-primary-400 focus:border-transparent transition-all outline-none text-sm font-medium"
                                />
                              </div>

                              {/* Params section */}
                              <div className="pt-1">
                                <button
                                  onClick={() => toggleStepParamsExpand(index)}
                                  className="flex items-center gap-1.5 text-[10px] font-bold text-text-tertiary hover:text-text-secondary transition-colors cursor-pointer"
                                >
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                                    className={`transition-transform ${isParamsExpanded ? 'rotate-90' : ''}`}
                                  ><path d="M9 18l6-6-6-6"/></svg>
                                  用户参数配置
                                  {hasParams && (
                                    <span className="px-1.5 py-0.5 rounded bg-accent-100 text-accent-600 text-[8px] font-bold">{step.params!.length}</span>
                                  )}
                                </button>

                                {isParamsExpanded && (
                                  <div className="mt-2 space-y-2">
                                    {(step.params || []).map((param, pi) => (
                                      <div key={pi} className="rounded-xl border border-border bg-surface p-3 space-y-2">
                                        <div className="flex items-center gap-2">
                                          <span className="text-[10px] font-bold text-accent-600">P{pi + 1}</span>
                                          <input
                                            type="text"
                                            value={param.key}
                                            onChange={(e) => updateStepParam(index, pi, 'key', e.target.value)}
                                            placeholder="key"
                                            className="flex-1 px-2 py-1 rounded-lg border border-border-strong bg-surface-secondary text-[10px] font-medium outline-none"
                                          />
                                          <input
                                            type="text"
                                            value={param.label}
                                            onChange={(e) => updateStepParam(index, pi, 'label', e.target.value)}
                                            placeholder="显示标签"
                                            className="flex-1 px-2 py-1 rounded-lg border border-border-strong bg-surface-secondary text-[10px] font-medium outline-none"
                                          />
                                          <button
                                            onClick={() => removeStepParam(index, pi)}
                                            className="text-text-tertiary hover:text-danger-500 transition-colors p-0.5 cursor-pointer"
                                          >
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                                          </button>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <div className="rounded-lg border border-border-strong pr-2 bg-surface-secondary">
                                            <select
                                              value={param.type}
                                              onChange={(e) => updateStepParam(index, pi, 'type', e.target.value)}
                                              className="px-2 py-1 rounded-lg text-[10px] font-medium outline-none cursor-pointer"
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
                                            onChange={(e) => updateStepParam(index, pi, 'placeholder', e.target.value)}
                                            placeholder="占位提示文本"
                                            className="flex-1 px-2 py-1 rounded-lg border border-border-strong bg-surface-secondary text-[10px] font-medium outline-none"
                                          />
                                          <label className="flex items-center gap-1 cursor-pointer">
                                            <input
                                              type="checkbox"
                                              checked={!!param.required}
                                              onChange={(e) => updateStepParam(index, pi, 'required', e.target.checked)}
                                              className="w-3 h-3 rounded cursor-pointer"
                                            />
                                            <span className="text-[10px] font-bold text-text-tertiary">必填</span>
                                          </label>
                                        </div>
                                        {param.description !== undefined && (
                                          <input
                                            type="text"
                                            value={param.description || ''}
                                            onChange={(e) => updateStepParam(index, pi, 'description', e.target.value)}
                                            placeholder="补充说明"
                                            className="w-full px-2 py-1 rounded-lg border border-border-strong bg-surface-secondary text-[10px] font-medium outline-none"
                                          />
                                        )}
                                      </div>
                                    ))}
                                    <button
                                      onClick={() => addStepParam(index)}
                                      className="w-full py-2 border border-dashed border-border-strong rounded-xl text-text-tertiary hover:border-accent-400 hover:text-accent-600 transition-all text-[10px] font-bold cursor-pointer"
                                    >
                                      + 添加参数
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <button
                      onClick={addStep}
                      className="w-full mt-3 py-3 border-2 border-dashed border-border-strong rounded-2xl text-text-tertiary hover:border-accent-400 hover:text-accent-600 hover:bg-accent-50/50 transition-all text-xs font-bold cursor-pointer"
                    >
                      + 添加步骤
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="py-4 border-t border-border">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 cursor-pointer">
            <CatLogo size={36} />
          </Link>
          <p className="text-text-tertiary text-xs font-medium">&copy; 2026 CuCaTopia.</p>
        </div>
      </footer>
    </div>
  );
};

export default WorkflowEditorPage;

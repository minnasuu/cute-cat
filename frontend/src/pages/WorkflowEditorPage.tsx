import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiClient } from '../utils/apiClient';
import { showToast } from '../components/Toast';
import CatMiniAvatar from '../components/CatMiniAvatar';

interface TeamCat {
  id: string; name: string; role: string; catColors: any; skills: any[]; accent: string;
}

interface WorkflowStep {
  agentId: string;
  skillId: string;
  action: string;
  inputFrom?: string;
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
  const [saving, setSaving] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  const iconOptions = ['📋', '🗓️', '📰', '✍️', '🎨', '📊', '🖼️', '📒', '🚀', '🔥'];

  useEffect(() => {
    apiClient.get(`/api/cats/team/${teamId}`).then(setCats).catch(console.error);
    if (isEditing) {
      apiClient.get(`/api/workflows/${workflowId}`).then(wf => {
        setName(wf.name);
        setIcon(wf.icon);
        setDescription(wf.description);
        setSteps(wf.steps || []);
        setTrigger(wf.trigger);
        setCron(wf.cron || '');
      }).catch(() => navigate(`/teams/${teamId}`));
    }
  }, [teamId, workflowId, isEditing, navigate]);

  const addStep = () => setSteps(prev => [...prev, { agentId: '', skillId: '', action: '' }]);

  const removeStep = (index: number) => setSteps(prev => prev.filter((_, i) => i !== index));

  const updateStep = (index: number, field: keyof WorkflowStep, value: string) => {
    setSteps(prev => prev.map((s, i) => {
      if (i !== index) return s;
      const updated = { ...s, [field]: value };
      if (field === 'agentId') updated.skillId = '';
      return updated;
    }));
  };

  const handleSave = async () => {
    if (!name.trim()) { showToast('请输入工作流名称', 'warning'); return; }
    if (steps.length === 0) { showToast('请至少添加一个步骤', 'warning'); return; }
    setSaving(true);
    try {
      const data = { name, icon, description, steps, trigger, cron: trigger === 'cron' ? cron : null };
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
    if (!aiPrompt.trim() || cats.length === 0) return;
    setAiLoading(true);
    try {
      const catInfo = cats.map(c => `${c.name}(${c.role}): ${c.skills.map((s: any) => s.name).join('、')}`).join('\n');
      const result = await apiClient.post('/api/dify/skill', {
        skillId: 'ai-workflow-gen',
        input: `请根据以下需求生成工作流：\n需求：${aiPrompt}\n\n可用猫猫团队：\n${catInfo}\n\n请返回JSON格式：{"name":"工作流名称","icon":"emoji","description":"描述","steps":[{"agentId":"猫猫id","skillId":"技能id","action":"具体行为描述"}]}`,
      });
      if (result?.data?.text) {
        try {
          const jsonMatch = result.data.text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.name) setName(parsed.name);
            if (parsed.icon) setIcon(parsed.icon);
            if (parsed.description) setDescription(parsed.description);
            if (parsed.steps) setSteps(parsed.steps);
          }
        } catch { /* parse failed, ignore */ }
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50/30">
      <header className="bg-white/80 backdrop-blur-sm border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(`/teams/${teamId}`)} className="text-gray-400 hover:text-gray-600">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            </button>
            <span className="text-lg font-bold text-gray-900">{isEditing ? '编辑工作流' : '创建工作流'}</span>
          </div>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50">
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-6 space-y-6">
        {/* AI Generate */}
        <div className="bg-gradient-to-r from-accent-50 to-accent-100/50 rounded-xl border border-accent-100 p-5">
          <h4 className="font-semibold text-accent-900 mb-3">🤖 AI 智能建流</h4>
          <div className="flex gap-2">
            <input
              type="text"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="描述你想要自动化的任务，例如：每周自动生成一篇文章并发邮件给我"
              className="flex-1 px-4 py-2.5 rounded-lg border border-accent-200 bg-surface focus:ring-2 focus:ring-accent-400 focus:border-transparent outline-none text-sm"
            />
            <button
              onClick={handleAiGenerate}
              disabled={aiLoading || !aiPrompt.trim()}
              className="px-4 py-2.5 bg-accent-500 text-text-inverse text-sm font-medium rounded-lg hover:bg-accent-600 transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              {aiLoading ? '生成中...' : 'AI 生成'}
            </button>
          </div>
        </div>

        {/* Basic Info */}
        <div className="bg-surface rounded-xl border border-border p-6">
          <h4 className="font-semibold text-text-primary mb-4">基本信息</h4>
          <div className="space-y-3">
            <div className="flex gap-3">
              <div>
                <label className="block text-sm text-text-secondary mb-1">图标</label>
                <div className="flex gap-1 flex-wrap">
                  {iconOptions.map(ic => (
                    <button key={ic} onClick={() => setIcon(ic)} className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center border-2 transition-all ${icon === ic ? 'border-accent-500 bg-accent-50' : 'border-border-strong'}`}>{ic}</button>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">名称</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="工作流名称" className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-400 focus:border-transparent outline-none text-sm" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">描述</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="这个工作流做什么..." rows={2} className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-400 focus:border-transparent outline-none text-sm resize-none" />
            </div>
            <div className="flex gap-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">触发方式</label>
                <select value={trigger} onChange={(e) => setTrigger(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm outline-none">
                  <option value="manual">手动触发</option>
                  <option value="cron">定时触发</option>
                </select>
              </div>
              {trigger === 'cron' && (
                <div className="flex-1">
                  <label className="block text-sm text-gray-600 mb-1">定时规则</label>
                  <input type="text" value={cron} onChange={(e) => setCron(e.target.value)} placeholder="例如：每周五 18:00" className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm outline-none" />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Steps */}
        <div className="bg-surface rounded-xl border border-border p-6">
          <h4 className="font-semibold text-text-primary mb-4">工作流步骤</h4>
          <div className="space-y-3">
            {steps.map((step, index) => {
              const selectedCat = cats.find(c => c.id === step.agentId);
              const catSkills = selectedCat?.skills || [];
              return (
                <div key={index} className="bg-surface-secondary rounded-lg p-4 border border-border relative">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-6 h-6 bg-accent-500 text-text-inverse text-xs font-bold rounded-full flex items-center justify-center">{index + 1}</span>
                    {index > 0 && <span className="text-xs text-text-tertiary">⬇️ 接收上一步结果</span>}
                    {steps.length > 1 && (
                      <button onClick={() => removeStep(index)} className="ml-auto text-text-tertiary hover:text-danger-500 text-sm">移除</button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-text-secondary mb-1">执行猫猫</label>
                      <select value={step.agentId} onChange={(e) => updateStep(index, 'agentId', e.target.value)} className="w-full px-3 py-2 rounded-lg border border-border-strong bg-surface text-sm outline-none">
                        <option value="">选择猫猫...</option>
                        {cats.map(c => <option key={c.id} value={c.id}>{c.name} ({c.role})</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-text-secondary mb-1">技能</label>
                      <select value={step.skillId} onChange={(e) => updateStep(index, 'skillId', e.target.value)} className="w-full px-3 py-2 rounded-lg border border-border-strong bg-surface text-sm outline-none">
                        <option value="">选择技能...</option>
                        {catSkills.map((s: any) => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-text-secondary mb-1">具体行为</label>
                      <input type="text" value={step.action} onChange={(e) => updateStep(index, 'action', e.target.value)} placeholder="描述这步要做什么" className="w-full px-3 py-2 rounded-lg border border-border-strong bg-surface text-sm outline-none" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <button onClick={addStep} className="w-full mt-3 py-3 border-2 border-dashed border-border-strong rounded-lg text-text-secondary hover:border-accent-400 hover:text-accent-600 hover:bg-accent-50/50 transition-all text-sm font-medium">
            + 添加步骤
          </button>
        </div>
      </main>
    </div>
  );
};

export default WorkflowEditorPage;

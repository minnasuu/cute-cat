import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiClient } from '../utils/apiClient';
import { showToast } from '../components/Toast';
import CatSVG from '../components/CatSVG';
import type { CatColors } from '../components/CatSVG';

interface CatTemplate {
  id: string; name: string; role: string; description: string; accent: string;
  catColors: CatColors; skills: any[]; systemPrompt: string; item: string; messages: string[];
}

const SKILL_LIBRARY = [
  { id: 'generate-todo', name: '代办清单', icon: '📋', description: '分析内容生成代办清单', input: 'json', output: 'json' },
  { id: 'assign-task', name: '任务分配', icon: '📌', description: '将任务拆解并分配', input: 'text', output: 'json' },
  { id: 'review-approve', name: '审批流程', icon: '✅', description: '审核工作成果', input: 'json', output: 'json' },
  { id: 'generate-article', name: '文章生成', icon: '📝', description: '生成完整文章', input: 'text', output: 'text' },
  { id: 'polish-text', name: '内容润色', icon: '✨', description: '优化文本表达', input: 'text', output: 'text' },
  { id: 'generate-outline', name: '大纲生成', icon: '📑', description: '生成结构化大纲', input: 'text', output: 'json' },
  { id: 'news-to-article', name: '资讯转文章', icon: '📰', description: '资讯整理为博文', input: 'json', output: 'text' },
  { id: 'crawl-news', name: '资讯爬取', icon: '🕸️', description: '爬取最新资讯', input: 'url', output: 'json' },
  { id: 'summarize-news', name: '资讯摘要', icon: '📰', description: '智能摘要分类', input: 'json', output: 'text' },
  { id: 'query-dashboard', name: '数据查询', icon: '🔍', description: '查询结构化数据', input: 'text', output: 'json' },
  { id: 'trend-analysis', name: '趋势分析', icon: '📈', description: '趋势分析和异常检测', input: 'json', output: 'json' },
  { id: 'send-email', name: '发送邮件', icon: '📧', description: '发送 HTML 格式邮件', input: 'text', output: 'email' },
  { id: 'send-notification', name: '推送通知', icon: '🔔', description: '批量推送通知', input: 'text', output: 'json' },
  { id: 'generate-component', name: '组件生成', icon: '🧩', description: '生成创意组件代码', input: 'text', output: 'html' },
  { id: 'layout-design', name: '排版布局', icon: '📐', description: '组合排版为页面', input: 'json', output: 'html' },
  { id: 'css-generate', name: '样式生成', icon: '🎨', description: '生成 CSS/动画代码', input: 'html', output: 'file' },
  { id: 'generate-image', name: 'AI 绘图', icon: '🖼️', description: '文字描述生成图片', input: 'text', output: 'image' },
  { id: 'generate-chart', name: '图表生成', icon: '📊', description: '数据生成可视化图表', input: 'json', output: 'image' },
  { id: 'quality-check', name: '质量检测', icon: '🔎', description: '质量评分和问题检测', input: 'json', output: 'json' },
  { id: 'content-review', name: '内容审核', icon: '🛡️', description: '合规性审核', input: 'text', output: 'json' },
  { id: 'regression-test', name: '回归测试', icon: '🧪', description: '自动化回归测试', input: 'url', output: 'json' },
  { id: 'site-analyze', name: '网站诊断', icon: '🔬', description: '网站内容诊断', input: 'url', output: 'json' },
  { id: 'task-log', name: '任务日志', icon: '📒', description: '记录任务执行日志', input: 'json', output: 'text' },
  { id: 'meeting-notes', name: '会议纪要', icon: '📝', description: '生成会议纪要', input: 'text', output: 'text' },
  { id: 'recruit-cat', name: '招募新猫', icon: '🐱', description: '招募新猫并定义角色', input: 'json', output: 'json' },
  { id: 'team-review', name: '团队盘点', icon: '👥', description: '盘点团队能力分布', input: 'none', output: 'json' },
];

const COLOR_FIELDS: { key: keyof CatColors; label: string }[] = [
  { key: 'body', label: '身体' }, { key: 'bodyDark', label: '深色斑纹' },
  { key: 'belly', label: '腹部' }, { key: 'earInner', label: '耳朵内侧' },
  { key: 'eyes', label: '眼睛' }, { key: 'nose', label: '鼻子' },
  { key: 'blush', label: '腮红' }, { key: 'stroke', label: '线条' },
  { key: 'apron', label: '围裙' }, { key: 'apronLight', label: '围裙浅色' },
  { key: 'desk', label: '桌面' }, { key: 'deskDark', label: '桌面深色' },
  { key: 'paw', label: '爪子' }, { key: 'tail', label: '尾巴' },
];

const PRESET_SCHEMES = [
  { name: '橘猫', colors: { body: '#F7AC5E', bodyDark: '#D3753E', belly: '', earInner: '#F28686', eyes: '#542615', nose: '#542615', blush: '#F28686', stroke: '#542615', apron: '#BDBDBD', apronLight: '#FEFFFE', apronLine: '#BDBDBD', desk: '#D7CCC8', deskDark: '#A1887F', deskLeg: '#BCAAA4', paw: '', tail: '#F7AC5E' } },
  { name: '蓝灰', colors: { body: '#8E9AAF', bodyDark: '#6B7A8D', belly: '#B8C4D4', earInner: '#C4A6A6', eyes: '#D4944C', nose: '#B87D75', blush: '#C9A6A6', stroke: '#4A5568', apron: '#5B8DB8', apronLight: '#D0DFE9', apronLine: '#5B8DB8', desk: '#E8D5B8', deskDark: '#C4A87A', deskLeg: '#D4BF9A', paw: '#B8C4D4', tail: '#6B7A8D' } },
  { name: '黑猫', colors: { body: '#3D3D3D', bodyDark: '#2A2A2A', belly: '#3D3D3D', earInner: '#E8909A', eyes: '#000', nose: '#542615', blush: '#F28686', stroke: '#1A1A1A', apron: '#7EB8DA', apronLight: '#D6EAF5', apronLine: '#7EB8DA', desk: '#C8D8E8', deskDark: '#8BA4BD', deskLeg: '#A6BCCF', paw: '#fff', tail: '#3D3D3D' } },
  { name: '白猫', colors: { body: '#FFF', bodyDark: '#FFF', belly: '#FFF', earInner: '#FFF', eyes: '#5D4037', nose: '#5D4037', blush: '#FFCCBC', stroke: '#5D4037', apron: '#B39DDB', apronLight: '#EDE7F6', apronLine: '#B39DDB', desk: '#FFF9C4', deskDark: '#FDD835', deskLeg: '#FFF176', paw: '#FFF', tail: '#FFF' } },
  { name: '暹罗', colors: { body: '#FAF3EB', bodyDark: '#FAF3EB', belly: '#FAF3EB', earInner: '#4E342E', eyes: '#4FC3F7', nose: '#333', blush: '#FFCCBC', stroke: '#4E342E', apron: '#B39DDB', apronLight: '#EDE7F6', apronLine: '#B39DDB', desk: '#D1C4E9', deskDark: '#9575CD', deskLeg: '#B39DDB', paw: '#4E342E', tail: '#4E342E' } },
];

const DEFAULT_COLORS: CatColors = {
  body: '#F7AC5E', bodyDark: '#D3753E', belly: '#FFFFFF', earInner: '#F4B8B8',
  eyes: '#4A90D9', nose: '#E8998D', blush: '#F4B8B8', stroke: '#3E2E1E',
  apron: '#A5D6A7', apronLight: '#E8F5E9', apronLine: '#A5D6A7',
  desk: '#C8DEC4', deskDark: '#8DB889', deskLeg: '#A6CCA2',
  paw: '#FFFFFF', tail: '#F5A623', faceDark: '', month: '', head: '',
  bodyDarkBottom: '', leg: '', headTopLeft: '', headTopRight: '',
};

const ROLE_OPTIONS = ['Project Manager', 'Content Editor', 'Data Analyst', 'Visual Designer', 'QA Reviewer', 'Operations Assistant', 'Engineer', 'Custom'];

const CatEditorPage: React.FC = () => {
  const { teamId, catId } = useParams<{ teamId: string; catId: string }>();
  const navigate = useNavigate();
  const isEditing = catId && catId !== 'new';

  const [mode, setMode] = useState<'template' | 'custom'>(isEditing ? 'custom' : 'template');
  const [templates, setTemplates] = useState<CatTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Cat form state
  const [name, setName] = useState('');
  const [role, setRole] = useState('Custom');
  const [description, setDescription] = useState('');
  const [catColors, setCatColors] = useState<CatColors>(DEFAULT_COLORS);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [accent, setAccent] = useState('#8DB889');
  const [messages, setMessages] = useState<string[]>(['喵~']);

  useEffect(() => {
    apiClient.get('/api/cats/templates').then(setTemplates).catch(console.error);
    if (isEditing) {
      setLoading(true);
      apiClient.get(`/api/cats/${catId}`).then(cat => {
        setName(cat.name);
        setRole(cat.role);
        setDescription(cat.description || '');
        setCatColors(cat.catColors);
        setSystemPrompt(cat.systemPrompt || '');
        setSelectedSkills((cat.skills || []).map((s: any) => s.id));
        setAccent(cat.accent || '#8DB889');
        setMessages(cat.messages || ['喵~']);
      }).catch(err => { console.error(err); navigate(`/teams/${teamId}`); }).finally(() => setLoading(false));
    }
  }, [catId, teamId, isEditing, navigate]);

  const handleAddTemplate = async (template: CatTemplate) => {
    setSaving(true);
    try {
      await apiClient.post(`/api/cats/team/${teamId}`, { templateId: template.id });
      navigate(`/teams/${teamId}`);
    } catch {
      // toast shown by apiClient
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCustom = async () => {
    if (!name.trim()) { showToast('请输入猫猫名称', 'warning'); return; }
    setSaving(true);
    try {
      const skills = SKILL_LIBRARY.filter(s => selectedSkills.includes(s.id));
      const data = { name, role, description, catColors, systemPrompt, skills, accent, item: 'clipboard', messages };
      if (isEditing) {
        await apiClient.put(`/api/cats/${catId}`, data);
      } else {
        await apiClient.post(`/api/cats/team/${teamId}`, data);
      }
      navigate(`/teams/${teamId}`);
    } catch {
      // toast shown by apiClient
    } finally {
      setSaving(false);
    }
  };

  const toggleSkill = (skillId: string) => {
    setSelectedSkills(prev => prev.includes(skillId) ? prev.filter(id => id !== skillId) : [...prev, skillId]);
  };

  const updateColor = (key: keyof CatColors, value: string) => {
    setCatColors(prev => ({ ...prev, [key]: value }));
  };

  const applyPreset = (preset: any) => {
    setCatColors(prev => ({ ...prev, ...preset.colors }));
    setAccent(preset.colors.deskDark || preset.colors.apron);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">加载中...</div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-orange-50/30">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(`/teams/${teamId}`)} className="text-gray-400 hover:text-gray-600">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            </button>
            <span className="text-lg font-bold text-gray-900">{isEditing ? '编辑猫猫' : '添加猫猫'}</span>
          </div>
          {mode === 'custom' && (
            <button onClick={handleSaveCustom} disabled={saving} className="px-4 py-2 bg-green-500 text-white text-sm font-medium rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50">
              {saving ? '保存中...' : '保存'}
            </button>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6">
        {/* Mode tabs */}
        {!isEditing && (
          <div className="flex gap-1 mb-6 bg-surface-tertiary rounded-lg p-1 w-fit">
            <button onClick={() => setMode('template')} className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${mode === 'template' ? 'bg-surface text-text-primary shadow-sm' : 'text-text-secondary'}`}>从模版选择</button>
            <button onClick={() => setMode('custom')} className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${mode === 'custom' ? 'bg-surface text-text-primary shadow-sm' : 'text-text-secondary'}`}>自定义创建</button>
          </div>
        )}

        {/* === Template Mode === */}
        {mode === 'template' && !isEditing && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {templates.map(t => (
              <div key={t.id} className="bg-surface rounded-xl border border-border p-4 hover:shadow-lg hover:border-secondary-200 transition-all">
                <div className="flex justify-center mb-3">
                  <div className="w-24 h-24"><CatSVG colors={t.catColors} className="w-full h-full" /></div>
                </div>
                <h4 className="font-semibold text-text-primary text-center">{t.name}</h4>
                <p className="text-xs text-center mt-1" style={{ color: t.accent }}>{t.role}</p>
                <p className="text-xs text-text-secondary mt-2 line-clamp-2">{t.description}</p>
                <div className="flex flex-wrap gap-1 justify-center mt-2">
                  {t.skills.slice(0, 3).map((s: any) => <span key={s.id} className="text-xs bg-surface-tertiary text-text-secondary px-1.5 py-0.5 rounded">{s.icon}</span>)}
                </div>
                <button
                  onClick={() => handleAddTemplate(t)}
                  disabled={saving}
                  className="w-full mt-3 py-2 bg-secondary-500 text-text-inverse text-sm font-medium rounded-lg hover:bg-secondary-600 transition-colors disabled:opacity-50"
                >
                  添加到团队
                </button>
              </div>
            ))}
          </div>
        )}

        {/* === Custom Mode === */}
        {(mode === 'custom' || isEditing) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left: Preview */}
            <div className="flex flex-col items-center">
              <div className="bg-white rounded-2xl border border-gray-100 p-8 w-full flex flex-col items-center shadow-sm">
                <div className="w-48 h-48 mb-4">
                  <CatSVG colors={catColors} className="w-full h-full" />
                </div>
                <h3 className="text-xl font-bold text-gray-900">{name || '新猫猫'}</h3>
                <span className="text-sm font-medium mt-1" style={{ color: accent }}>{role}</span>
                {description && <p className="text-sm text-gray-500 mt-2 text-center">{description}</p>}
              </div>

              {/* Presets */}
              <div className="w-full mt-4">
                <h4 className="text-sm font-medium text-text-secondary mb-2">快速配色方案</h4>
                <div className="flex gap-2 flex-wrap">
                  {PRESET_SCHEMES.map(p => (
                    <button key={p.name} onClick={() => applyPreset(p)} className="px-3 py-1.5 bg-surface border border-border-strong rounded-lg text-xs text-text-secondary hover:border-secondary-400 hover:bg-secondary-50 transition-all flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-full" style={{ background: typeof p.colors.body === 'string' ? p.colors.body : '#ccc' }}></span>
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: Config */}
            <div className="space-y-6">
              {/* Basic Info */}
              <div className="bg-white rounded-xl border border-gray-100 p-6">
                <h4 className="font-semibold text-gray-900 mb-4">基本信息</h4>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">名称</label>
                    <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="猫猫的名字" className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-orange-400 focus:border-transparent outline-none text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">角色</label>
                    <select value={role} onChange={(e) => setRole(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm outline-none">
                      {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">描述</label>
                    <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="这只猫猫的职责..." rows={2} className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-orange-400 focus:border-transparent outline-none text-sm resize-none" />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">主题色</label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} className="w-8 h-8 rounded cursor-pointer border-0" />
                      <input type="text" value={accent} onChange={(e) => setAccent(e.target.value)} className="px-3 py-1.5 rounded-lg border border-border-strong bg-surface-secondary text-sm w-24 outline-none" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Colors */}
              <div className="bg-white rounded-xl border border-gray-100 p-6">
                <h4 className="font-semibold text-gray-900 mb-4">外观配色</h4>
                <div className="grid grid-cols-2 gap-3">
                  {COLOR_FIELDS.map(f => {
                    const val = catColors[f.key];
                    const strVal = typeof val === 'string' ? val : '';
                    return (
                      <div key={f.key} className="flex items-center gap-2">
                        <input type="color" value={strVal || '#ffffff'} onChange={(e) => updateColor(f.key, e.target.value)} className="w-6 h-6 rounded cursor-pointer border-0 shrink-0" />
                        <span className="text-xs text-gray-600 truncate">{f.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* AI Settings */}
              <div className="bg-surface rounded-xl border border-border p-6">
                <h4 className="font-semibold text-text-primary mb-4">AI 参数</h4>
                <div>
                  <label className="block text-sm text-text-secondary mb-1">System Prompt</label>
                  <textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} placeholder="指导猫猫行为的系统提示词..." rows={3} className="w-full px-3 py-2 rounded-lg border border-border-strong bg-surface-secondary focus:bg-surface focus:ring-2 focus:ring-secondary-400 focus:border-transparent outline-none text-sm resize-none" />
                </div>
              </div>

              {/* Skills */}
              <div className="bg-white rounded-xl border border-gray-100 p-6">
                <h4 className="font-semibold text-gray-900 mb-4">技能装备 <span className="text-sm font-normal text-gray-400">({selectedSkills.length} 已选)</span></h4>
                <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                  {SKILL_LIBRARY.map(skill => (
                    <button
                      key={skill.id}
                      onClick={() => toggleSkill(skill.id)}
                      className={`text-left p-2 rounded-lg border text-sm transition-all ${selectedSkills.includes(skill.id) ? 'border-orange-400 bg-orange-50 text-orange-800' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
                    >
                      <span className="mr-1">{skill.icon}</span>
                      <span className="font-medium">{skill.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Messages */}
              <div className="bg-surface rounded-xl border border-border p-6">
                <h4 className="font-semibold text-text-primary mb-4">猫猫语录</h4>
                <div className="space-y-2">
                  {messages.map((msg, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={msg}
                        onChange={(e) => setMessages(prev => prev.map((m, idx) => idx === i ? e.target.value : m))}
                        className="flex-1 px-3 py-1.5 rounded-lg border border-border-strong bg-surface-secondary text-sm outline-none"
                      />
                      {messages.length > 1 && (
                        <button onClick={() => setMessages(prev => prev.filter((_, idx) => idx !== i))} className="text-text-tertiary hover:text-danger-500 text-sm">×</button>
                      )}
                    </div>
                  ))}
                  <button onClick={() => setMessages(prev => [...prev, ''])} className="text-xs text-secondary-600 hover:text-secondary-700">+ 添加语录</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default CatEditorPage;

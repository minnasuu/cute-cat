import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link, Navigate } from 'react-router-dom';
import { apiClient } from '../../utils/apiClient';
import { showToast } from '../../components/Toast';
import CatSVG from '../../components/CatSVG';
import type { CatColors } from '../../components/CatSVG';
import CatLogo from '../../components/CatLogo';
import { appearanceTemplates } from '../../data/themes';
import { personalityTemplates } from '../../data/personality';
import { useAuth } from '../../contexts/AuthContext';
import { AppIcon } from '../../components/icons';

interface CatTemplate {
  id: string; name: string; role: string; description: string; accent: string;
  catColors: CatColors; skills: any[]; systemPrompt: string; item: string; messages: string[];
}



const COLOR_GROUPS: { id: string; label: string; icon: string; fields: { key: keyof CatColors; label: string }[] }[] = [
  { id: 'g-body', label: '身体', icon: 'Cat', fields: [
    { key: 'body', label: '身体' }, { key: 'bodyDark', label: '身体斑纹' }, { key: 'bodyDarkBottom', label: '身体底斑' }, { key: 'stroke', label: '描边' },
  ]},
  { id: 'g-head', label: '头部', icon: 'Smile', fields: [
    { key: 'head', label: '头部' }, { key: 'headTopLeft', label: '头顶左' }, { key: 'headTopRight', label: '头顶右' },
    { key: 'belly', label: '脸部' }, { key: 'faceDark', label: '脸部深色' }, { key: 'earInner', label: '耳朵内侧' },
  ]},
  { id: 'g-face', label: '五官', icon: 'Eye', fields: [
    { key: 'eyes', label: '眼睛' }, { key: 'nose', label: '鼻子' }, { key: 'month', label: '嘴巴' }, { key: 'blush', label: '腮红' },
  ]},
  { id: 'g-limb', label: '四肢', icon: 'Footprints', fields: [
    { key: 'paw', label: '爪子' }, { key: 'leg', label: '四肢' },
  ]},
  { id: 'g-apron', label: '书籍', icon: 'BookOpen', fields: [
    { key: 'apron', label: '书籍' }, { key: 'apronLight', label: '书籍浅色' }, { key: 'apronLine', label: '书籍线条' },
  ]},
  { id: 'g-desk', label: '桌面', icon: 'Armchair', fields: [
    { key: 'desk', label: '桌面' }, { key: 'deskDark', label: '桌面深色' }, { key: 'deskLeg', label: '桌腿' },
  ]},
];



const DEFAULT_COLORS: CatColors = {
  body: '#F7AC5E', bodyDark: '#D3753E', belly: '#FFFFFF', earInner: '#F4B8B8',
  eyes: '#4A90D9', nose: '#E8998D', blush: '#F4B8B8', stroke: '#3E2E1E',
  apron: '#A5D6A7', apronLight: '#E8F5E9', apronLine: '#A5D6A7',
  desk: '#C8DEC4', deskDark: '#8DB889', deskLeg: '#A6CCA2',
  paw: '#FFFFFF', tail: '#F5A623', faceDark: '', month: '', head: '',
  bodyDarkBottom: '', leg: '', headTopLeft: '', headTopRight: '',
};

const CatEditorPage: React.FC = () => {
  const { teamId, catId } = useParams<{ teamId: string; catId: string }>();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const isEditing = catId && catId !== 'new';

  const [templates, setTemplates] = useState<CatTemplate[]>([]);
  const [lockedSkills, setLockedSkills] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [description, setDescription] = useState('');
  const [catColors, _setCatColors] = useState<CatColors>(DEFAULT_COLORS);
  /** 确保 catColors 永远不为 null（后端/模板可能返回 null） */
  const setCatColors: typeof _setCatColors = (v) =>
    _setCatColors(prev => {
      const next = typeof v === 'function' ? (v as (p: CatColors) => CatColors)(prev) : v;
      return next ?? DEFAULT_COLORS;
    });
  const [systemPrompt, setSystemPrompt] = useState('');
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [accent, setAccent] = useState('#8DB889');
  const [messages, setMessages] = useState<string[]>(['喵~']);
  const [tailEnabled, setTailEnabled] = useState(!!DEFAULT_COLORS.tail);
  const [configTab, setConfigTab] = useState('s-basic');
  const [addedTemplateIds, setAddedTemplateIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    apiClient.get('/api/cats/templates').then(setTemplates).catch(console.error);
    if (teamId) {
      apiClient.get(`/api/teams/${teamId}`).then((team: any) => {
        const ids = (team.cats || []).map((c: any) => c.templateId).filter(Boolean);
        setAddedTemplateIds(new Set(ids));
      }).catch(console.error);
    }
    if (isEditing) {
      setLoading(true);
      apiClient.get(`/api/cats/${catId}`).then(cat => {
        setName(cat.name);
        setRole(cat.role);
        setDescription(cat.description || '');
        const colors = cat.catColors || DEFAULT_COLORS;
        setCatColors(colors);
        setTailEnabled(!!colors.tail);
        setSystemPrompt(cat.systemPrompt || '');
        setLockedSkills(Array.isArray(cat.skills) ? cat.skills : []);
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
      const skillsPayload = isEditing
        ? lockedSkills
        : selectedSkills.map(id => ({ id }));
      if (isEditing && (skillsPayload.length !== 1 || skillsPayload[0]?.id !== 'aigc')) {
        showToast('官方猫猫仅保留内置 AIGC 标识（aigc）', 'warning');
        setSaving(false);
        return;
      }
      const finalColors = { ...catColors, tail: tailEnabled ? catColors.tail : '' };
      const data = { name, role, description, catColors: finalColors, systemPrompt, skills: skillsPayload, accent, item: 'clipboard', messages };
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

  const QUAD_KEYS: (keyof CatColors)[] = ['paw', 'leg'];
  const toQuad = (val: string | string[]): string[] => {
    if (Array.isArray(val)) return val.length >= 4 ? val.slice(0, 4) : [...val, ...Array(4 - val.length).fill(val[0] || '')];
    return [val, val, val, val];
  };

  const updateColor = (key: keyof CatColors, value: string, index?: number) => {
    setCatColors(prev => {
      if (typeof index === 'number' && QUAD_KEYS.includes(key)) {
        const arr = toQuad(prev[key] as string | string[]);
        arr[index] = value;
        return { ...prev, [key]: arr };
      }
      return { ...prev, [key]: value };
    });
  };

  const NAV_ITEMS = isEditing
    ? [
        { id: 's-basic', icon: 'ClipboardList', label: '基本信息' },
        { id: 's-ai', icon: 'Footprints', label: 'Prompt' },
        { id: 's-skills', icon: 'Sparkles', label: 'AIGC' },
        { id: 's-messages', icon: 'MessageCircle', label: '猫猫语录' },
      ]
    : [
        { id: 's-basic', icon: 'ClipboardList', label: '基本信息' },
        { id: 'g-colors', icon: 'Palette', label: '外观配色' },
        { id: 's-ai', icon: 'Footprints', label: '性格' },
        { id: 's-skills', icon: 'Sparkles', label: 'AIGC' },
        { id: 's-messages', icon: 'MessageCircle', label: '猫猫语录' },
      ];

  const applyPreset = (preset: any) => {
    setCatColors(prev => ({ ...prev, ...preset.colors }));
    setAccent(preset.colors.deskDark || preset.colors.apron);
    setTailEnabled(!!preset.colors.tail);
  };

  if (!isAdmin && teamId) {
    return <Navigate to={`/teams/${teamId}`} replace />;
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center text-text-tertiary font-medium">加载中...</div>;

  return (
    <div className="h-screen flex flex-col bg-surface text-text-primary selection:bg-primary-100 selection:text-primary-900">
      {/* Hero header */}
      <section className="relative flex items-center justify-between h-20 px-6">
        <div className="absolute top-0 left-1/4 w-72 h-72 bg-primary-100/30 rounded-full blur-[100px] -z-10 pointer-events-none" />
        <div className="absolute top-8 right-1/4 w-72 h-72 bg-accent-100/30 rounded-full blur-[100px] -z-10 pointer-events-none" />

        <div className="flex items-center">
          <button
            onClick={() => navigate(`/teams/${teamId}`)}
            className="flex items-center gap-1.5 text-sm font-medium text-text-tertiary hover:text-text-secondary transition-colors cursor-pointer"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            返回团队
          </button>

          <div className="w-px h-4 bg-black/10 mx-2"></div>

          <div className="flex items-center justify-between shrink-0">
            <h1 className="text-xl md:text-2xl font-black tracking-tight">
              {isEditing ? "编辑猫猫" : "添加猫猫"}
            </h1>
          </div>
        </div>
        {isEditing && (
          <button
            onClick={handleSaveCustom}
            disabled={saving}
            className="ml-auto px-6 py-3 text-sm font-bold bg-text-primary text-text-inverse rounded-full hover:scale-105 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
          >
            {saving ? "保存中..." : "保存猫猫"}
          </button>
        )}
      </section>
      <main className="flex-1 h-px max-w-6xl mx-auto px-6 flex flex-col">
        {/* === Template Mode（仅管理员添加官方猫） === */}
        {!isEditing && (
          <section className="flex-1 h-px flex flex-col">
            <div className="text-sm text-text-secondary mb-6">
              选择官方猫猫模版：按岗位角色划分，统一围绕
              AIGC；执行逻辑当前为占位。定制外形与自由组合已关闭。
            </div>
            <div className="flex-1 grid grid-cols-2 pb-4 md:grid-cols-3 lg:grid-cols-5 gap-5 overflow-y-auto">
              {templates.map((t) => {
                const isAdded = addedTemplateIds.has(t.id);
                return (
                  <div
                    key={t.id}
                    className={`group relative flex flex-col gap-3 bg-surface p-3 transition-all group ${isAdded ? "opacity-70" : "hover:border-border-strong"}`}
                  >
                    {isAdded && (
                      <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-primary-100 text-primary-600 text-[10px] font-bold border border-primary-200">
                        已添加
                      </div>
                    )}
                    <div className="flex justify-center">
                      <div className="group-hover:scale-110 transition-transform w-24 h-24">
                        <CatSVG
                          colors={t.catColors}
                          className="w-full h-full"
                        />
                      </div>
                    </div>
                    <h4 className="font-black text-text-primary text-center">
                      {t.name}
                    </h4>
                    <p
                      className="text-xs font-bold text-center"
                      style={{ color: t.accent }}
                    >
                      {t.role}
                    </p>
                    <p className="text-xs text-text-secondary font-medium line-clamp-2 text-center">
                      {t.description}
                    </p>
                    <div className="flex flex-wrap gap-1.5 justify-center">
                      <span className="text-[10px] font-bold bg-primary-50 text-primary-700 px-2 py-0.5 rounded-full border border-primary-200">
                        ✨ AIGC
                      </span>
                    </div>
                    <button
                      onClick={() => handleAddTemplate(t)}
                      disabled={saving || isAdded}
                      className={`w-full mt-4 py-2.5 mt-auto text-sm font-bold rounded-2xl transition-al ${
                        isAdded
                          ? "bg-surface-secondary text-text-tertiary border border-border cursor-not-allowed"
                          : "bg-text-primary text-text-inverse hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50  cursor-pointer"
                      }`}
                    >
                      {isAdded ? "已在团队中" : "添加到团队"}
                    </button>
                  </div>
                );
              })}
            </div>

            {templates.length === 0 && (
              <div className="text-center py-20 rounded-[32px] border border-border bg-surface-secondary/50">
                <div className="mb-4 flex justify-center text-primary-600">
                  <AppIcon symbol="Cat" size={56} strokeWidth={1.75} />
                </div>
                <h3 className="text-xl font-black text-text-primary mb-2">
                  暂无猫猫模版
                </h3>
                <p className="text-text-secondary font-medium">
                  请联系管理员检查后端模版配置
                </p>
              </div>
            )}
          </section>
        )}

        {/* === 编辑官方猫（管理员） === */}
        {isEditing && (
          <section className="flex-1 h-px pb-4">
            <div className="flex gap-8 md:flex-row flex-col h-full">
              {/* Left: Preview */}
              <div className="flex-2 flex flex-col items-center">
                <div className="bg-surface rounded-[28px] border border-border p-8 w-full flex flex-col items-center">
                  <div className="w-48 h-48 mb-5">
                    <CatSVG colors={catColors} className="w-full h-full" />
                  </div>
                  <h3 className="text-xl font-black text-text-primary">
                    {name || "新猫猫"}
                  </h3>
                  <span
                    className="text-sm font-bold mt-1"
                    style={{ color: accent }}
                  >
                    {role}
                  </span>
                  {description && (
                    <p className="text-sm text-text-secondary font-medium mt-2 text-center max-w-xs">
                      {description}
                    </p>
                  )}
                </div>
              </div>

              {/* Right: Config */}
              <div className="flex-3 flex flex-col h-full">
                {/* Tabs */}
                <div className="flex gap-1 mb-3 bg-surface-tertiary/60 rounded-2xl p-1 w-fit">
                  {NAV_ITEMS.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setConfigTab(item.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                        configTab === item.id
                          ? "bg-surface text-text-primary shadow-sm"
                          : "text-text-tertiary hover:text-text-secondary"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                {/* Panel */}
                <div className="flex-1 h-px rounded-[24px] border border-border overflow-y-auto">
                  {/* Basic Info */}
                  {configTab === "s-basic" && (
                    <div className="p-6 space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-text-tertiary uppercase tracking-widest mb-2">
                          名称
                        </label>
                        <input
                          type="text"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="猫猫的名字"
                          className="w-full px-4 py-3 rounded-2xl border border-border-strong bg-surface-secondary focus:bg-surface focus:ring-2 focus:ring-primary-400 focus:border-transparent transition-all outline-none text-sm font-medium"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-text-tertiary uppercase tracking-widest mb-2">
                          岗位角色
                        </label>
                        <input
                          type="text"
                          value={role}
                          onChange={(e) => setRole(e.target.value)}
                          placeholder="如：视觉设计师"
                          className="w-full px-4 py-3 rounded-2xl border border-border-strong bg-surface-secondary focus:bg-surface focus:ring-2 focus:ring-primary-400 focus:border-transparent transition-all outline-none text-sm font-medium"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-text-tertiary uppercase tracking-widest mb-2">
                          描述
                        </label>
                        <textarea
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          placeholder="这只猫猫的职责..."
                          rows={2}
                          className="w-full px-4 py-3 rounded-2xl border border-border-strong bg-surface-secondary focus:bg-surface focus:ring-2 focus:ring-primary-400 focus:border-transparent transition-all outline-none text-sm font-medium resize-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-text-tertiary uppercase tracking-widest mb-2">
                          主题色
                        </label>
                        <div className="flex items-center gap-3">
                          <input
                            type="color"
                            value={accent}
                            onChange={(e) => setAccent(e.target.value)}
                            className="w-10 h-10 rounded-xl cursor-pointer"
                          />
                          <input
                            type="text"
                            value={accent}
                            onChange={(e) => setAccent(e.target.value)}
                            className="px-4 py-2.5 rounded-2xl-strong bg-surface-secondary text-sm font-medium w-28 outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Colors */}
                  {configTab === "g-colors" && (
                    <div className="p-6">
                      {COLOR_GROUPS.map((group) => (
                        <div key={group.id} className="mb-5">
                          <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-widest mb-2 flex items-center gap-1.5">
                            <AppIcon
                              symbol={group.icon}
                              size={16}
                              className="text-primary-600 shrink-0"
                            />
                            {group.label}
                          </p>
                          <div className="grid grid-cols-2">
                            {group.fields.map((f) => {
                              const val = catColors[f.key];
                              const PAW_LABELS = [
                                "左前",
                                "右前",
                                "左后",
                                "右后",
                              ];
                              if (QUAD_KEYS.includes(f.key)) {
                                const quad = toQuad(val as string | string[]);
                                return (
                                  <div
                                    key={f.key}
                                    className="col-span-2 p-2 rounded-xl hover:bg-surface-secondary/60 transition-colors"
                                  >
                                    <span className="text-xs font-bold text-text-secondary mb-2 block">
                                      {f.label}
                                    </span>
                                    <div className="flex gap-3">
                                      {quad.map((v, i) => (
                                        <div
                                          key={i}
                                          className="flex items-center gap-1.5"
                                        >
                                          <input
                                            type="color"
                                            value={v || "#ffffff"}
                                            onChange={(e) =>
                                              updateColor(
                                                f.key,
                                                e.target.value,
                                                i,
                                              )
                                            }
                                            className="w-7 h-7 rounded-lg cursor-pointer shrink-0"
                                          />
                                          <span className="text-[10px] text-text-tertiary">
                                            {PAW_LABELS[i]}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                );
                              }
                              const strVal = typeof val === "string" ? val : "";
                              return (
                                <div
                                  key={f.key}
                                  className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-surface-secondary/60 transition-colors"
                                >
                                  <input
                                    type="color"
                                    value={strVal || "#ffffff"}
                                    onChange={(e) =>
                                      updateColor(f.key, e.target.value)
                                    }
                                    className="w-7 h-7 rounded-lg cursor-pointer shrink-0"
                                  />
                                  <span className="text-xs font-bold text-text-secondary truncate">
                                    {f.label}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}

                      {/* Tail with switch */}
                      <div className="mb-2">
                        <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-widest mb-2 flex items-center gap-1.5">
                          <span className="inline-flex items-center gap-1">
                            <AppIcon symbol="Palette" size={14} />
                            尾巴
                          </span>
                        </p>
                        <div className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-surface-secondary/60 transition-colors">
                          <input
                            type="color"
                            value={
                              tailEnabled
                                ? (catColors.tail as string) || "#ffffff"
                                : "#ffffff"
                            }
                            onChange={(e) =>
                              updateColor("tail", e.target.value)
                            }
                            disabled={!tailEnabled}
                            className={`w-7 h-7 rounded-lg shrink-0 ${tailEnabled ? "cursor-pointer" : "opacity-30 cursor-not-allowed"}`}
                          />
                          <span
                            className={`text-xs font-bold truncate ${tailEnabled ? "text-text-secondary" : "text-text-tertiary"}`}
                          >
                            尾巴颜色
                          </span>
                          <button
                            type="button"
                            onClick={() => setTailEnabled((prev) => !prev)}
                            className={`ml-auto relative w-9 h-5 rounded-full transition-colors shrink-0 cursor-pointer ${tailEnabled ? "bg-primary-500" : "bg-surface-tertiary"}`}
                          >
                            <span
                              className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${tailEnabled ? "translate-x-4" : ""}`}
                            />
                          </button>
                          <span className="text-[10px] text-text-tertiary whitespace-nowrap">
                            {tailEnabled ? "自定义" : "跟随身体"}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* AI Settings */}
                  {configTab === "s-ai" && (
                    <div className="p-6 space-y-6">
                      {!isEditing && (
                        <div>
                          <p className="text-xs font-bold text-text-tertiary uppercase tracking-widest mb-3">
                            官方性格模版
                          </p>
                          <div className="grid grid-cols-3 gap-2">
                            {personalityTemplates.map((p) => {
                              const isActive = systemPrompt === p.prompt;
                              return (
                                <button
                                  key={p.id}
                                  onClick={() => setSystemPrompt(p.prompt)}
                                  className={`text-left p-3 rounded-2xl border transition-all cursor-pointer ${
                                    isActive
                                      ? "border-primary-400 bg-primary-50 shadow-sm"
                                      : "border-border hover:border-border-strong hover:shadow-sm"
                                  }`}
                                >
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <span>{p.emoji}</span>
                                    <span
                                      className={`font-bold text-xs ${isActive ? "text-primary-700" : "text-text-primary"}`}
                                    >
                                      {p.name}
                                    </span>
                                  </div>
                                  <p className="text-[10px] text-text-tertiary line-clamp-1">
                                    {p.tone}
                                  </p>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Custom prompt */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-bold text-text-tertiary uppercase tracking-widest">
                            自定义 Prompt
                          </p>
                          <span
                            className={`text-[10px] font-bold ${systemPrompt.length > 8000 ? "text-danger-500" : "text-text-tertiary"}`}
                          >
                            {systemPrompt.length}/8000
                          </span>
                        </div>
                        <textarea
                          value={systemPrompt}
                          onChange={(e) => {
                            if (e.target.value.length <= 8000)
                              setSystemPrompt(e.target.value);
                          }}
                          placeholder="指导猫猫行为的系统提示词..."
                          rows={6}
                          className="w-full px-4 py-3 rounded-2xl border border-border-strong bg-surface-secondary focus:bg-surface focus:ring-2 focus:ring-primary-400 focus:border-transparent transition-all outline-none text-sm font-medium resize-none"
                        />
                        <p className="text-[10px] text-text-tertiary mt-1.5">
                          选择模版会自动填入，也可直接编辑自定义
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Skills */}
                  {configTab === "s-skills" && isEditing && (
                    <div className="p-6">
                      <p className="text-sm text-text-secondary font-medium mb-4">
                        产品侧不再强调「技能」：每只官方猫仅有统一的 AIGC
                        协作入口，具体生成能力将按岗位在后续版本接入（当前为占位）。
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {lockedSkills.map((s: any) => (
                          <span
                            key={s.id}
                            className="px-3 py-1.5 rounded-full bg-primary-50 border border-primary-200 text-xs font-bold text-primary-800"
                          >
                            <span className="inline-flex items-center gap-1.5">
                              {s.icon ? (
                                <AppIcon
                                  symbol={s.icon}
                                  size={16}
                                  className="text-primary-600"
                                />
                              ) : null}
                              {s.name || s.id}
                            </span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Messages */}
                  {configTab === "s-messages" && (
                    <div className="p-6">
                      <div className="space-y-2.5">
                        {messages.map((msg, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <input
                              type="text"
                              value={msg}
                              onChange={(e) =>
                                setMessages((prev) =>
                                  prev.map((m, idx) =>
                                    idx === i ? e.target.value : m,
                                  ),
                                )
                              }
                              className="flex-1 px-4 py-2.5 rounded-2xl border border-border-strong bg-surface-secondary text-sm font-medium outline-none focus:bg-surface focus:ring-2 focus:ring-primary-400 focus:border-transparent transition-all"
                            />
                            {messages.length > 1 && (
                              <button
                                onClick={() =>
                                  setMessages((prev) =>
                                    prev.filter((_, idx) => idx !== i),
                                  )
                                }
                                className="text-text-tertiary hover:text-danger-500 transition-colors p-1.5 rounded-lg hover:bg-danger-50 cursor-pointer"
                              >
                                <svg
                                  width="14"
                                  height="14"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                >
                                  <path d="M18 6L6 18M6 6l12 12" />
                                </svg>
                              </button>
                            )}
                          </div>
                        ))}
                        <button
                          onClick={() => setMessages((prev) => [...prev, ""])}
                          className="text-xs font-bold text-primary-500 hover:text-primary-600 transition-colors cursor-pointer"
                        >
                          + 添加语录
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="py-4 border-t border-border">
        <div className="w-full mx-auto px-6 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 cursor-pointer">
            <CatLogo size={36} />
          </Link>
          <p className="text-text-tertiary text-xs font-medium">
            &copy; 2026 CuCaTopia.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default CatEditorPage;

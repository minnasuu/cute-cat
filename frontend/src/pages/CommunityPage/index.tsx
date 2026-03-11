import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CatSVG from '../../components/CatSVG';
import CatLogo from '../../components/CatLogo';
import {
  huajiao, huajiaoSkills,
  alan, alanSkills,
  xue, xueSkills,
  niannian, niannianSkills,
  xiaohu, xiaohuSkills,
  huangjin, huangjinSkills,
  fafa, fafaSkills,
} from '../../data/cats';
import type { Assistant, Skill } from '../../data/types';
import { skillCategories, getVisibleSkillPool, getVisibleSkillGroups } from '../../data/skills';
import { useAuth } from '../../contexts/AuthContext';
import { appearanceTemplates } from '../../data/themes';
import { personalityTemplates } from '../../data/personality';
import { workflows } from '../../data/workflows';

/* ── All built-in cats ── */
const allCats: Assistant[] = [huajiao, alan, xue, xiaohu, fafa, niannian, huangjin];
const allCatSkills: Record<string, Skill[]> = {
  manager: huajiaoSkills, writer: alanSkills, analyst: xueSkills,
  designer: xiaohuSkills, reviewer: fafaSkills, ops: niannianSkills,
  engineer: huangjinSkills,
};

/* ── agentId → 猫猫名映射 ── */
const agentNameMap: Record<string, string> = Object.fromEntries(allCats.map(c => [c.id, c.name]));

/* ── 工作流主题色 ── */
const workflowColors: Record<string, string> = {
  'daily-news': '#96BAFF',
  'content-publish': '#FF6B6B',
  'data-report': '#B39DDB',
};

/* ── Tab types ── */
type Tab = 'cats' | 'skills' | 'roles'| 'workflows' | 'appearances' | 'personalities';

const CommunityPage = () => {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const skillPool = getVisibleSkillPool(isAdmin);
  const skillGroups = getVisibleSkillGroups(isAdmin);
  const [tab, setTab] = useState<Tab>('cats');
  const [selectedCat, setSelectedCat] = useState<Assistant | null>(null);
  const [skillFilter, setSkillFilter] = useState<string>('all');
  const [expandedWf, setExpandedWf] = useState<string | null>(null);

  const tabs: { id: Tab; label: string; icon: string; count: number }[] = [
    { id: 'cats', label: '官方猫猫', icon: '🐱', count: allCats.length },
    { id: 'skills', label: '技能池', icon: '⚡', count: skillPool.length },
    // { id: 'roles', label: '角色', icon: '🎭', count: skillGroups.length },
    { id: 'workflows', label: '官方工作流', icon: '🔄', count: workflows.length },
    { id: 'appearances', label: '外形模版', icon: '🐾', count: appearanceTemplates.length },
    { id: 'personalities', label: '性格模版', icon: '💬', count: personalityTemplates.length },
  ];

  const filteredSkills = skillFilter === 'all'
    ? skillPool
    : skillPool.filter(s => s.category === skillFilter);

  return (
    <div className="min-h-screen bg-surface text-text-primary selection:bg-primary-100 selection:text-primary-900">
      {/* Navbar */}
      <header className="sticky top-0 z-50 bg-surface/80 backdrop-blur-xl border-b border-border">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 group cursor-pointer" onClick={() => navigate('/')}>
            <CatLogo size={40} className="group-hover:rotate-12 transition-transform" />
            <span className="text-xl font-bold tracking-tight">CuCaTopia</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="text-sm font-medium text-text-tertiary hover:text-text-primary transition-colors"
            >
              首页
            </button>
            <button
              onClick={() => navigate('/login')}
              className="px-5 py-2 text-sm font-bold bg-text-primary text-text-inverse rounded-full hover:scale-105 active:scale-95 transition-all"
            >
              开始使用
            </button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative py-16 md:py-20">
        <div className="absolute top-0 left-1/4 w-80 h-80 bg-primary-100/30 rounded-full blur-[120px] -z-10 pointer-events-none" />
        <div className="absolute top-10 right-1/4 w-72 h-72 bg-accent-100/30 rounded-full blur-[100px] -z-10 pointer-events-none" />
        <div className="max-w-6xl mx-auto px-6 text-center">
          <p className="text-sm font-bold text-primary-500 uppercase tracking-widest mb-4">COMMUNITY</p>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-4">
            探索猫猫世界 🐾
          </h1>
          <p className="text-lg text-text-secondary max-w-2xl mx-auto">
            浏览所有官方内置的猫猫角色、技能、外形模版和性格模版，了解它们的能力和特点
          </p>
        </div>
      </section>

      {/* Tab Bar */}
      <div className="sticky top-16 z-40 bg-surface/90 backdrop-blur-lg border-b border-border">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex gap-1 -mb-px overflow-x-auto">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-5 py-3.5 text-sm font-bold border-b-2 transition-all whitespace-nowrap ${
                  tab === t.id
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-text-tertiary hover:text-text-primary'
                }`}
              >
                <span>{t.icon}</span>
                <span>{t.label}</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  tab === t.id ? 'bg-primary-100 text-primary-600' : 'bg-surface-secondary text-text-tertiary'
                }`}>
                  {t.count}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-6 py-10">

        {/* ═══ Cats Tab ═══ */}
        {tab === 'cats' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {allCats.map(cat => (
              <div
                key={cat.id}
                onClick={() => setSelectedCat(selectedCat?.id === cat.id ? null : cat)}
                className={`rounded-[24px] border p-6 cursor-pointer transition-all group ${
                  selectedCat?.id === cat.id
                    ? 'border-primary-300 bg-primary-50/50 shadow-lg ring-2 ring-primary-200'
                    : 'border-border bg-surface hover:border-border-strong hover:shadow-lg'
                }`}
              >
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-16 h-16 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <CatSVG colors={cat.catColors} size={60} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-black text-text-primary">{cat.name}</h3>
                    <span
                      className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold text-white mt-1"
                      style={{ background: cat.accent }}
                    >
                      {cat.role}
                    </span>
                  </div>
                </div>

                <p className="text-sm text-text-secondary font-medium leading-relaxed mb-4 line-clamp-2">
                  {cat.description}
                </p>

                {/* Skills preview */}
                <div className="flex flex-wrap gap-1.5">
                  {allCatSkills[cat.id]?.map(skill => (
                    <span
                      key={skill.id}
                      className="px-2.5 py-1 rounded-full bg-surface-secondary border border-border text-[11px] font-bold text-text-secondary"
                    >
                      {skill.icon} {skill.name}
                    </span>
                  ))}
                </div>

                {/* Expanded detail */}
                {selectedCat?.id === cat.id && (
                  <div className="mt-5 pt-5 border-t border-border space-y-4">
                    {/* Messages */}
                    <div>
                      <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-widest mb-2">口头禅</p>
                      <div className="flex flex-wrap gap-1.5">
                        {cat.messages.map((msg, i) => (
                          <span key={i} className="px-3 py-1.5 rounded-full bg-surface-secondary border border-border text-xs font-medium text-text-secondary">
                            &ldquo;{msg}&rdquo;
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Skills detail */}
                    <div>
                      <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-widest mb-2">技能详情</p>
                      <div className="space-y-2">
                        {allCatSkills[cat.id]?.map(skill => (
                          <div key={skill.id} className="flex items-start gap-2.5 p-3 rounded-xl bg-surface-secondary/60 border border-border">
                            <span className="text-base shrink-0">{skill.icon}</span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-bold text-text-primary">{skill.name}</span>
                                {skill.provider && (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-surface-tertiary text-text-tertiary">
                                    {skill.provider}
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-text-tertiary mt-0.5">{skill.description}</p>
                              <div className="flex gap-2 mt-1.5">
                                <span className="text-[9px] font-bold text-text-tertiary px-1.5 py-0.5 rounded bg-surface-tertiary">
                                  输入: {skill.input}
                                </span>
                                <span className="text-[9px] font-bold text-text-tertiary px-1.5 py-0.5 rounded bg-surface-tertiary">
                                  输出: {skill.output}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ═══ Roles Tab (Skill Groups) ═══ */}
        {tab === 'roles' && (
          <div>
            <p className="text-text-secondary font-medium mb-8 max-w-2xl">
              预设角色模版，每个角色都装配了一组相关技能，让你的猫猫快速上岗
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {skillGroups.map(group => (
                <div
                  key={group.id}
                  className="rounded-[24px] border border-border bg-surface p-6 hover:border-border-strong hover:shadow-lg transition-all"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div
                      className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shrink-0 text-white"
                      style={{ background: group.color }}
                    >
                      {group.icon}
                    </div>
                    <h4 className="text-lg font-black text-text-primary">{group.name}</h4>
                  </div>
                  <p className="text-sm text-text-secondary font-medium leading-relaxed mb-4">
                    {group.description}
                  </p>
                  <div>
                    <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-widest mb-2">装配技能</p>
                    <div className="flex flex-wrap gap-1.5">
                      {group.skillIds.map(sid => {
                        const skill = skillPool.find(s => s.id === sid);
                        return skill ? (
                          <span key={sid} className="px-2.5 py-1.5 rounded-full bg-surface-secondary border border-border text-[11px] font-bold text-text-secondary">
                            {skill.name}
                          </span>
                        ) : null;
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ Skills Tab ═══ */}
        {tab === 'skills' && (
          <div>
            {/* Category filter */}
            <div className="flex gap-2 flex-wrap mb-8">
              <button
                onClick={() => setSkillFilter('all')}
                className={`px-4 py-2 rounded-full text-xs font-bold border transition-all ${
                  skillFilter === 'all'
                    ? 'bg-text-primary text-text-inverse border-transparent'
                    : 'bg-surface-secondary border-border text-text-secondary hover:border-border-strong'
                }`}
              >
                全部 ({skillPool.length})
              </button>
              {skillCategories.map(cat => {
                const count = skillPool.filter(s => s.category === cat.id).length;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setSkillFilter(cat.id)}
                    className={`px-4 py-2 rounded-full text-xs font-bold border transition-all ${
                      skillFilter === cat.id
                        ? 'text-white border-transparent'
                        : 'bg-surface-secondary border-border text-text-secondary hover:border-border-strong'
                    }`}
                    style={skillFilter === cat.id ? { background: cat.color } : undefined}
                  >
                    {cat.name} ({count})
                  </button>
                );
              })}
            </div>

            {/* Skill grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredSkills.map(skill => {
                const cat = skillCategories.find(c => c.id === skill.category);
                return (
                  <div
                    key={skill.id}
                    className={`rounded-[20px] border border-border bg-surface p-5 transition-all ${skill.disabled?'opacity-50':'hover:border-border-strong hover:shadow-md'}`}
                  >
                    <div className="flex items-start gap-3 mb-3">
                      <div className="min-w-0">
                        <h4 className="text-sm font-bold text-text-primary">{skill.name}</h4>
                        <span
                          className="inline-block px-2 py-0.5 rounded text-[9px] font-bold text-white mt-0.5"
                          style={{ background: cat?.color }}
                        >
                          {cat?.name}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-text-secondary font-medium leading-relaxed mb-3">
                      {skill.description}
                    </p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-surface-secondary text-text-tertiary border border-border">
                        输入: {skill.input}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-surface-secondary text-text-tertiary border border-border">
                        输出: {skill.output}
                      </span>
                      {skill.provider && (
                        <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-surface-tertiary text-text-tertiary">
                          {skill.provider}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ═══ Workflows Tab ═══ */}
        {tab === 'workflows' && (
          <div>
            <p className="text-text-secondary font-medium mb-8 max-w-2xl">
              官方预设的自动化工作流，串联多只猫猫协作完成复杂任务，开箱即用。
            </p>
            <div className="space-y-5">
              {workflows.map(wf => {
                const isExpanded = expandedWf === wf.id;
                const color = workflowColors[wf.id] ?? '#8DB889';
                const involvedCats = [...new Set(wf.steps.map(s => s.agentId))].map(id => allCats.find(c => c.id === id)).filter(Boolean) as Assistant[];

                return (
                  <div
                    key={wf.id}
                    className={`rounded-[24px] border bg-surface transition-all ${
                      isExpanded ? 'border-border-strong shadow-lg' : 'border-border hover:border-border-strong hover:shadow-md'
                    }`}
                  >
                    {/* Header */}
                    <div
                      className="p-6 cursor-pointer"
                      onClick={() => setExpandedWf(isExpanded ? null : wf.id)}
                    >
                      <div className="flex items-start gap-4">
                        <div
                          className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl shrink-0 text-white"
                          style={{ background: color }}
                        >
                          {wf.id === 'daily-news' ? '📰' : wf.id === 'content-publish' ? '✍️' : '📊'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-base font-black text-text-primary mb-1">{wf.name}</h4>
                          <p className="text-sm text-text-secondary font-medium leading-relaxed line-clamp-2">
                            {wf.description}
                          </p>
                          {/* Meta badges */}
                          <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-surface-secondary border border-border text-text-tertiary">
                              {wf.steps.length} 步骤
                            </span>
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-surface-secondary border border-border text-text-tertiary">
                              {involvedCats.length} 只猫协作
                            </span>
                            {wf.scheduled && (
                              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold text-white" style={{ background: color }}>
                                ⏰ {wf.cron}
                              </span>
                            )}
                            {/* Participating cat avatars */}
                            <div className="flex -space-x-1.5 ml-1">
                              {involvedCats.map(cat => (
                                <div
                                  key={cat.id}
                                  className="w-6 h-6 rounded-full overflow-hidden border-2 border-surface bg-surface-secondary flex items-center justify-center"
                                  title={cat.name}
                                >
                                  <CatSVG colors={cat.catColors} size={18} />
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                        <svg
                          className={`w-5 h-5 text-text-tertiary shrink-0 mt-1 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>

                    {/* Expanded content */}
                    {isExpanded && (
                      <div className="px-6 pb-6 pt-0">
                        {/* Steps flow */}
                        <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-widest mb-4">工作流步骤</p>
                        <div className="space-y-0">
                          {wf.steps.map((step, i) => {
                            const cat = allCats.find(c => c.id === step.agentId);
                            const skill = skillPool.find(s => s.id === step.skillId);
                            return (
                              <div key={i} className="flex gap-4">
                                {/* Timeline line */}
                                <div className="flex flex-col items-center">
                                  <div
                                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-white shrink-0"
                                    style={{ background: color }}
                                  >
                                    {i + 1}
                                  </div>
                                  {i < wf.steps.length - 1 && (
                                    <div className="w-0.5 flex-1 min-h-[20px]" style={{ background: `${color}30` }} />
                                  )}
                                </div>
                                {/* Step content */}
                                <div className={`flex-1 pb-5 ${i === wf.steps.length - 1 ? 'pb-0' : ''}`}>
                                  <div className="p-4 rounded-xl bg-surface-secondary/40 border border-border">
                                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                      {cat && (
                                        <div className="flex items-center gap-1.5">
                                          <div className="w-6 h-6 rounded-full overflow-hidden border border-border bg-surface flex items-center justify-center">
                                            <CatSVG colors={cat.catColors} size={18} />
                                          </div>
                                          <span className="text-xs font-bold" style={{ color: cat.accent }}>{agentNameMap[step.agentId] ?? step.agentId}</span>
                                        </div>
                                      )}
                                      {skill && (
                                        <>
                                          <span className="text-text-tertiary text-xs">·</span>
                                          <span className="text-[11px] font-bold text-text-secondary">
                                            {skill.name}
                                          </span>
                                        </>
                                      )}
                                      {step.inputFrom && (() => {
                                        // 优先用 stepId 找来源步骤的猫咪名
                                        const sourceStep = wf.steps.find(s => s.stepId === step.inputFrom);
                                        const label = sourceStep
                                          ? (agentNameMap[sourceStep.agentId] ?? sourceStep.agentId)
                                          : (agentNameMap[step.inputFrom] ?? step.inputFrom);
                                        return (
                                          <span className="text-[9px] font-bold uppercase bg-blue-50 text-blue-500 px-1.5 py-0.5 rounded ml-auto">
                                            ← {label}
                                          </span>
                                        );
                                      })()}
                                    </div>
                                    <p className="text-sm text-text-primary font-medium">{step.action}</p>
                                    {/* Step params preview */}
                                    {step.params && step.params.length > 0 && (
                                      <div className="flex flex-wrap gap-1.5 mt-2">
                                        {step.params.map(p => (
                                          <span key={p.key} className="px-2 py-0.5 rounded text-[9px] font-bold bg-surface-tertiary text-text-tertiary border border-border">
                                            {p.label}{p.required ? ' *' : ''}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ═══ Appearances Tab ═══ */}
        {tab === 'appearances' && (
          <div className="grid grid-cols-3 sm:grid-cols-3 lg:grid-cols-5 gap-5">
            {appearanceTemplates.map(app => (
              <div
                key={app.id}
                className="rounded-[24px] border border-border bg-surface p-5 text-center hover:border-border-strong hover:shadow-lg transition-all group"
              >
                <div className="flex justify-center mb-4 group-hover:scale-110 transition-transform">
                  <CatSVG colors={app.colors} size={120} />
                </div>
                <h4 className="text-sm font-black text-text-primary mb-1">{app.name}</h4>
                <p className="text-xs text-text-secondary font-medium">{app.preview}</p>
                {/* Color palette */}
                <div className="flex justify-center gap-1 mt-3">
                  {[app.colors.body, app.colors.apron, app.colors.eyes, app.colors.earInner].filter(Boolean).map((c, i) => (
                    <div
                      key={i}
                      className="w-4 h-4 rounded-full border border-white"
                      style={{ background: c }}
                      title={c}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ═══ Personalities Tab ═══ */}
        {tab === 'personalities' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {personalityTemplates.map(p => (
              <div
                key={p.id}
                className="rounded-[24px] border border-border bg-surface p-6 hover:border-border-strong hover:shadow-lg transition-all"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-2xl bg-surface-secondary border border-border flex items-center justify-center text-2xl">
                    {p.emoji}
                  </div>
                  <h4 className="text-lg font-black text-text-primary">{p.name}</h4>
                </div>
                <div className="mb-4">
                  <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-widest mb-2">性格特征</p>
                  <div className="flex flex-wrap gap-1.5">
                    {p.traits.map(t => (
                      <span key={t} className="px-3 py-1.5 rounded-full bg-surface-secondary border border-border text-xs font-bold text-text-secondary">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-widest mb-2">说话风格</p>
                  <p className="text-sm text-text-secondary font-medium bg-surface-secondary rounded-xl px-4 py-3 border border-border">
                    {p.tone}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="py-4 border-t border-border">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
            <CatLogo size={36} />
          </div>
          <p className="text-text-tertiary text-xs font-medium">&copy; 2026 CuCaTopia.</p>
        </div>
      </footer>
    </div>
  );
};

export default CommunityPage;

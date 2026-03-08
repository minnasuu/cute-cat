import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAuth } from '../../contexts/AuthContext';
import { apiClient } from '../../utils/apiClient';
import { getSkillHandler } from '../../skills';
import type { SkillResult } from '../../skills/types';
import CatSVG, { CatColors } from '../../components/CatSVG';
import CatMiniAvatar from '../../components/CatMiniAvatar';
import CatLogo from '../../components/CatLogo';
import Navbar from '../../components/Navbar';
import UserProfileDropdown from '../DashboardPage/UserProfileDropdown';
import '../../styles/WorkflowPanel.scss';

const STEP_DURATION = 3000;

const workingDialogs: string[] = ['准备中...', '努力工作中~ 🐱', '马上就好!'];

interface TeamCat {
  id: string;
  name: string;
  role: string;
  description?: string;
  catColors: CatColors;
  skills: any[];
  accent: string;
  templateId?: string;
  messages: string[];
}

interface TeamWorkflow {
  id: string;
  name: string;
  icon: string;
  description: string;
  steps: any[];
  trigger: string;
  cron?: string;
  enabled: boolean;
}

interface Team {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  cats: TeamCat[];
  workflows: TeamWorkflow[];
  _count: { cats: number; workflows: number; workflowRuns: number };
}

const TeamDetailPage: React.FC = () => {
  const { teamId } = useParams<{ teamId: string }>();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'cats' | 'workflows' | 'history'>('cats');
  const [selectedCat, setSelectedCat] = useState<TeamCat | null>(null);

  // 执行弹窗状态
  const [executingWorkflow, setExecutingWorkflow] = useState<TeamWorkflow | null>(null);
  const [runningStepIndex, setRunningStepIndex] = useState(-1);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [currentDialog, setCurrentDialog] = useState('');
  const [stepResults, setStepResults] = useState<Map<number, SkillResult>>(new Map());
  const stepResultsRef = useRef<Map<number, SkillResult>>(new Map());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadTeam = useCallback(async () => {
    if (!teamId) return;
    try {
      const data = await apiClient.get(`/api/teams/${teamId}`);
      setTeam(data);
    } catch (err) {
      console.error(err);
      navigate('/dashboard');
    } finally {
      setLoading(false);
    }
  }, [teamId, navigate]);

  useEffect(() => { loadTeam(); }, [loadTeam]);

  const handleDeleteCat = async (catId: string, catName: string) => {
    if (!confirm(`确定要移除「${catName}」吗？`)) return;
    try {
      await apiClient.delete(`/api/cats/${catId}`);
      loadTeam();
    } catch {
      // toast shown by apiClient
    }
  };

  const handleDeleteWorkflow = async (wfId: string, wfName: string) => {
    if (!confirm(`确定要删除工作流「${wfName}」吗？`)) return;
    try {
      await apiClient.delete(`/api/workflows/${wfId}`);
      loadTeam();
    } catch {
      // toast shown by apiClient
    }
  };

  const handleRunWorkflow = (wfId: string) => {
    const wf = team?.workflows.find(w => w.id === wfId);
    if (!wf) return;
    setExecutingWorkflow(wf);
    setRunningStepIndex(0);
    setCompletedSteps([]);
    setIsRunning(true);
    setCurrentDialog('');
    const emptyMap = new Map<number, SkillResult>();
    setStepResults(emptyMap);
    stepResultsRef.current = emptyMap;
    // 同时在后端创建 run 记录
    apiClient.post(`/api/workflows/${wfId}/run`, {}).catch(() => {});
  };

  const handleCloseExecution = () => {
    setExecutingWorkflow(null);
    setRunningStepIndex(-1);
    setCompletedSteps([]);
    setIsRunning(false);
    setCurrentDialog('');
    const emptyMap = new Map<number, SkillResult>();
    setStepResults(emptyMap);
    stepResultsRef.current = emptyMap;
    loadTeam();
  };

  // 执行步骤逻辑
  useEffect(() => {
    if (!isRunning || !executingWorkflow || runningStepIndex < 0) return;
    if (runningStepIndex >= executingWorkflow.steps.length) {
      setIsRunning(false);
      setRunningStepIndex(-1);
      setCurrentDialog('');
      return;
    }

    const step = executingWorkflow.steps[runningStepIndex];
    const cat = team?.cats.find(c => c.id === step.agentId || c.templateId === step.agentId);
    const skill = cat?.skills.find((s: any) => s.id === step.skillId);
    const dialogs = workingDialogs;
    setCurrentDialog(dialogs[0]);

    const handler = getSkillHandler(step.skillId);
    // 构建 skillInput：合并上游步骤输出 + 当前步骤的 action（任务指令）+ params 配置
    let skillInput: unknown = undefined;
    {
      const merged: Record<string, unknown> = {};
      // 合并前序步骤的输出数据
      if (runningStepIndex > 0) {
        for (let i = 0; i < runningStepIndex; i++) {
          const prev = stepResultsRef.current.get(i)?.data;
          if (prev && typeof prev === 'object') Object.assign(merged, prev);
        }
      }
      // 将步骤的 action 作为任务指令注入，让 AI 技能知道本步骤该做什么
      if (step.action) {
        merged._action = step.action;
      }
      // 将步骤的用户参数配置也注入
      if (step.params && step.params.length > 0) {
        const paramValues: Record<string, unknown> = {};
        for (const p of step.params) {
          if (p.value !== undefined) paramValues[p.key] = p.value;
          else if (p.defaultValue !== undefined) paramValues[p.key] = p.defaultValue;
        }
        if (Object.keys(paramValues).length > 0) merged._params = paramValues;
      }
      skillInput = Object.keys(merged).length > 0 ? merged : undefined;
    }

    const executePromise = handler
      ? handler.execute({ agentId: step.agentId, input: skillInput, timestamp: new Date().toISOString() })
      : Promise.resolve<SkillResult>({
          success: true, data: null,
          summary: skill?.mockResult ?? step.action ?? '执行完成',
          status: 'success',
        });

    const midTimer = setTimeout(() => setCurrentDialog(dialogs[1]), STEP_DURATION * 0.4);

    timerRef.current = setTimeout(() => {
      executePromise.then((result) => {
        setStepResults((prev) => {
          const next = new Map(prev);
          next.set(runningStepIndex, result);
          stepResultsRef.current = next;
          return next;
        });
        setCurrentDialog(result.summary || dialogs[2]);
        const failed = result.status === 'error' || result.success === false;
        setTimeout(() => {
          setCompletedSteps(prev => [...prev, runningStepIndex]);
          if (failed) {
            setIsRunning(false);
            setRunningStepIndex(-1);
          } else {
            setRunningStepIndex(prev => prev + 1);
          }
        }, 500);
      }).catch(() => {
        setStepResults((prev) => {
          const next = new Map(prev);
          next.set(runningStepIndex, { success: false, data: null, summary: '执行出错', status: 'error' });
          stepResultsRef.current = next;
          return next;
        });
        setCurrentDialog('出错了...');
        setTimeout(() => {
          setCompletedSteps(prev => [...prev, runningStepIndex]);
          setIsRunning(false);
          setRunningStepIndex(-1);
        }, 500);
      });
    }, STEP_DURATION);

    return () => {
      clearTimeout(midTimer);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isRunning, runningStepIndex, executingWorkflow, team]);

  const allDone = executingWorkflow && !isRunning && completedSteps.length === executingWorkflow.steps.length;

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">加载中...</div>;
  if (!team) return null;

  return (
    <div className="min-h-screen bg-surface text-text-primary selection:bg-primary-100 selection:text-primary-900">
      <Navbar
        rightSlot={user ? (
          <UserProfileDropdown
            user={user}
            teamCount={1}
            totalCats={team._count.cats}
            totalWorkflows={team._count.workflows}
            onLogout={logout}
          />
        ) : undefined}
      />

      <main className="max-w-6xl mx-auto px-6" style={{ minHeight: 'calc(100vh - 133px)' }}>
        {/* Hero header */}
        <section className="relative pb-10 pt-3 md:pb-14 md:pt-4">
          <div className="absolute top-0 left-1/4 w-72 h-72 bg-primary-100/30 rounded-full blur-[100px] -z-10 pointer-events-none" />
          <div className="absolute top-8 right-1/4 w-72 h-72 bg-accent-100/30 rounded-full blur-[100px] -z-10 pointer-events-none" />

          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-1.5 text-sm font-medium text-text-tertiary hover:text-text-secondary transition-colors mb-4 cursor-pointer"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            返回团队列表
          </button>

          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-xl md:text-2xl font-black tracking-tight">{team.name}</h1>
            <div className='w-px h-4 bg-black/10'></div>
            {team.description && (
            <p className="text-xs text-text-tertiary max-w-xl">{team.description}</p>
          )}
          </div>
        </section>

        {/* Stats bar */}
        <section className="py-6 mb-8 border-y border-border bg-surface-secondary/30 -mx-6 px-6">
          <div className="grid grid-cols-3 gap-8">
            {[
              { label: '猫猫', val: String(team._count.cats) },
              { label: '工作流', val: String(team._count.workflows) },
              { label: '执行次数', val: String(team._count.workflowRuns) },
            ].map((s, i) => (
              <div key={i} className="text-center">
                <div className="text-2xl font-black text-text-primary">{s.val}</div>
                <div className="text-xs font-bold text-text-tertiary uppercase tracking-widest mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Tabs */}
        <div className="flex gap-1 mb-8 bg-surface-tertiary/60 rounded-2xl p-1.5 w-fit">
          {(['cats', 'workflows', 'history'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer ${
                activeTab === tab
                  ? 'bg-surface text-text-primary shadow-sm'
                  : 'text-text-tertiary hover:text-text-secondary'
              }`}
            >
              {tab === 'cats' ? `猫猫 (${team._count.cats})` : tab === 'workflows' ? `工作流 (${team._count.workflows})` : `工作日志`}
            </button>
          ))}
        </div>

        {/* === Cats Tab === */}
        {activeTab === 'cats' && (
          <section className="pb-16">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
              {team.cats.map(cat => (
                <div
                  key={cat.id}
                  className="bg-surface rounded-[24px] border border-border p-5 hover:shadow-lg hover:border-border-strong transition-all cursor-pointer group relative"
                  onClick={() => setSelectedCat(cat)}
                >
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteCat(cat.id, cat.name); }}
                    className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 text-text-tertiary hover:text-danger-500 transition-all p-1.5 rounded-lg hover:bg-danger-50 cursor-pointer"
                    title="移除猫猫"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                  </button>
                  <div className="flex justify-center mb-4">
                    <div className="w-20 h-20">
                      <CatSVG colors={cat.catColors} className="w-full h-full" />
                    </div>
                  </div>
                  <h4 className="font-black text-text-primary text-center">{cat.name}</h4>
                  <p className="text-xs font-bold text-center mt-1" style={{ color: cat.accent }}>{cat.role}</p>
                  <div className="flex flex-wrap gap-1.5 justify-center mt-3">
                    {cat.skills.slice(0, 3).map((skill: any) => (
                      <span key={skill.id} className="text-[10px] font-bold bg-surface-secondary text-text-secondary px-2 py-0.5 rounded-full border border-border">{skill.icon} {skill.name}</span>
                    ))}
                    {cat.skills.length > 3 && <span className="text-[10px] font-bold text-text-tertiary">+{cat.skills.length - 3}</span>}
                  </div>
                </div>
              ))}

              {/* Add cat card */}
              <div
                className="bg-surface/50 rounded-[24px] border-2 border-dashed border-border-strong p-5 hover:border-primary-400 hover:bg-primary-50/50 transition-all cursor-pointer flex flex-col items-center justify-center min-h-[220px]"
                onClick={() => navigate(`/teams/${teamId}/cats/new`)}
              >
                <div className="w-14 h-14 rounded-full bg-primary-50 border border-primary-100 flex items-center justify-center text-primary-500 text-2xl mb-3">+</div>
                <span className="text-sm font-bold text-text-secondary">添加猫猫</span>
              </div>
            </div>
          </section>
        )}

        {/* === Workflows Tab === */}
        {activeTab === 'workflows' && (
          <section className="pb-16">
            <div className="space-y-4">
              {team.workflows.map(wf => (
                <div
                  key={wf.id}
                  className="bg-surface rounded-[24px] border border-border p-6 hover:shadow-lg hover:border-border-strong transition-all group cursor-pointer"
                  onClick={() => navigate(`/teams/${teamId}/workflows/${wf.id}`)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-surface-secondary border border-border flex items-center justify-center text-2xl shrink-0">
                        {wf.icon}
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-black text-text-primary group-hover:text-primary-600 transition-colors">{wf.name}</h4>
                        <p className="text-sm text-text-secondary font-medium mt-0.5 line-clamp-1">{wf.description}</p>
                        {/* Meta badges */}
                        <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                          <span className="px-2.5 py-1 rounded-full bg-surface-secondary border border-border text-[10px] font-bold text-text-tertiary">
                            {wf.steps.length} 步骤
                          </span>
                          {wf.trigger === 'cron' && wf.cron && (
                            <span className="px-2.5 py-1 rounded-full bg-accent-50 border border-accent-200 text-[10px] font-bold text-accent-600">
                              ⏰ {wf.cron}
                            </span>
                          )}
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${wf.enabled ? 'bg-green-50 border border-green-200 text-green-600' : 'bg-surface-secondary border border-border text-text-tertiary'}`}>
                            {wf.enabled ? '已启用' : '未启用'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {wf.trigger === 'manual' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRunWorkflow(wf.id); }}
                          className="opacity-0 group-hover:opacity-100 transition-all p-1.5 rounded-lg shrink-0 cursor-pointer text-text-tertiary hover:text-primary-600 hover:bg-primary-50"
                          title="执行工作流"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                        </button>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteWorkflow(wf.id, wf.name); }}
                        className="opacity-0 group-hover:opacity-100 text-text-tertiary hover:text-danger-500 transition-all p-1.5 rounded-lg hover:bg-danger-50 shrink-0 cursor-pointer"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                      </button>
                    </div>
                  </div>
                  {/* Step preview */}
                  <div className="flex items-center gap-2 mt-4 overflow-x-auto pb-1">
                    {wf.steps.map((step: any, i: number) => {
                      const cat = team.cats.find(c => c.id === step.agentId || c.templateId === step.agentId);
                      return (
                        <React.Fragment key={i}>
                          {i > 0 && <span className="text-text-tertiary text-xs shrink-0">→</span>}
                          <div className="flex items-center gap-1.5 bg-surface-secondary border border-border px-2.5 py-1.5 rounded-xl shrink-0">
                            {cat && (
                              <div className="w-5 h-5 rounded-full overflow-hidden border border-border bg-surface flex items-center justify-center">
                                <CatMiniAvatar colors={cat.catColors} size={16} />
                              </div>
                            )}
                            <span className="text-xs font-bold text-text-secondary">{step.action?.substring(0, 15) || step.skillId}</span>
                          </div>
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Add workflow */}
            <button
              onClick={() => navigate(`/teams/${teamId}/workflows/new`)}
              className="w-full mt-5 py-5 bg-surface/50 border-2 border-dashed border-border-strong rounded-[24px] text-text-secondary hover:border-primary-400 hover:text-primary-600 hover:bg-primary-50/50 transition-all font-bold cursor-pointer"
            >
              + 创建工作流
            </button>
          </section>
        )}

        {/* === History Tab === */}
        {activeTab === 'history' && (
          <section className="pb-16">
            <div className="text-center py-20 rounded-[32px] border border-border bg-surface-secondary/50">
              <h3 className="text-xl font-black text-text-primary mb-2">暂无工作日志</h3>
              <p className="text-text-secondary font-medium max-w-sm mx-auto">执行工作流后，记录会出现在这里</p>
            </div>
          </section>
        )}
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

      {/* Cat Detail Modal */}
      {selectedCat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setSelectedCat(null)}>
          <div className="bg-surface rounded-[28px] shadow-2xl p-8 w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto border border-border" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className="w-24 h-24"><CatSVG colors={selectedCat.catColors} className="w-full h-full" /></div>
                <div>
                  <h3 className="text-xl font-black text-text-primary">{selectedCat.name}</h3>
                  <span className="text-sm font-bold" style={{ color: selectedCat.accent }}>{selectedCat.role}</span>
                  {selectedCat.description && <p className="text-sm text-text-secondary font-medium mt-1">{selectedCat.description}</p>}
                </div>
              </div>
              <button onClick={() => setSelectedCat(null)} className="text-text-tertiary hover:text-text-secondary transition-colors p-1">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>

            <p className="text-xs font-bold text-text-tertiary uppercase tracking-widest mb-3">技能列表</p>
            <div className="space-y-2.5">
              {selectedCat.skills.map((skill: any) => (
                <div key={skill.id} className="bg-surface-secondary rounded-2xl p-4 border border-border">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{skill.icon}</span>
                    <span className="font-bold text-sm text-text-primary">{skill.name}</span>
                  </div>
                  <p className="text-xs text-text-secondary font-medium mt-1.5">{skill.description}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setSelectedCat(null)}
                className="flex-1 py-3.5 text-text-secondary font-bold rounded-2xl border border-border-strong hover:bg-surface-secondary transition-all cursor-pointer"
              >
                关闭
              </button>
              <button
                onClick={() => { setSelectedCat(null); navigate(`/teams/${teamId}/cats/${selectedCat.id}`); }}
                className="flex-1 py-3.5 bg-text-primary text-text-inverse font-bold rounded-2xl hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
              >
                编辑猫猫
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 工作流执行弹窗 */}
      {executingWorkflow && (
        <div className={`workflow-overlay ${executingWorkflow ? 'visible' : ''}`}>
          <div className="overlay-backdrop" onClick={handleCloseExecution} />
          <div className="execution-stage">
            <div className="stage-header">
              <div className="stage-title">
                <span className="stage-name">{executingWorkflow.icon} {executingWorkflow.name}</span>
              </div>
              <button className="stage-close" onClick={handleCloseExecution}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="stage-body">
              <div className="pipeline">
                {executingWorkflow.steps.map((step: any, i: number) => {
                  const cat = team.cats.find(c => c.id === step.agentId || c.templateId === step.agentId);
                  const skill = cat?.skills.find((s: any) => s.id === step.skillId);
                  const isCompleted = completedSteps.includes(i);
                  const isCurrent = runningStepIndex === i;
                  const isPending = !isCompleted && !isCurrent;
                  const statusClass = isCompleted ? 'done' : isCurrent ? 'active' : 'waiting';
                  const result = stepResults.get(i);
                  const resultStatus = result?.status ?? 'success';

                  return (
                    <React.Fragment key={i}>
                      <div className={`pipeline-node ${statusClass}`}>
                        {isCurrent && (
                          <div className="cat-bubble show">
                            <span className="bubble-text">{currentDialog}</span>
                          </div>
                        )}

                        <div className={`cat-avatar ${isCurrent ? 'working' : ''}`}>
                          {cat && <CatSVG colors={cat.catColors} className="pipeline-cat" />}
                        </div>

                        <div className="node-info">
                          <span className="node-name" style={{ color: cat?.accent }}>
                            {cat?.name ?? step.agentId}
                          </span>
                          {skill && (
                            <span className="node-skill">
                              {skill.icon} {skill.name}
                            </span>
                          )}
                          {!skill && step.action && (
                            <span className="node-skill">
                              {step.action}
                            </span>
                          )}
                        </div>

                        {isCurrent && (
                          <div className="node-progress">
                            <div className="node-progress-bar" style={{ animationDuration: `${STEP_DURATION}ms` }} />
                          </div>
                        )}

                        {isCompleted && result && (
                          <div className={`node-result status-${resultStatus}`}>
                            <div className="node-result-header">
                              {resultStatus === 'success' && '✅'}
                              {resultStatus === 'warning' && '⚠️'}
                              {resultStatus === 'error' && '❌'}
                              <span className="node-result-status">
                                {resultStatus === 'success' ? '完成' : resultStatus === 'warning' ? '警告' : '失败'}
                              </span>
                            </div>
                            {result.summary && (
                              <div className="node-result-summary markdown-body">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                  {result.summary}
                                </ReactMarkdown>
                              </div>
                            )}
                          </div>
                        )}

                        {!isCompleted && skill && (
                          <div className="node-io">
                            <span className="io-tag io-in">{skill.input}</span>
                            <span className="io-arrow">→</span>
                            <span className="io-tag io-out">{skill.output}</span>
                          </div>
                        )}

                        {isPending && <div className="node-dim" />}
                      </div>

                      {i < executingWorkflow.steps.length - 1 && (
                        <div className={`pipeline-arrow ${isCompleted ? 'done' : ''}`}>
                          <div className="arrow-line" />
                          <div className="arrow-head">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M8 5v14l11-7z" />
                            </svg>
                          </div>
                          {isCompleted && (
                            <div className="arrow-data-tag">
                              <span className="data-type">
                                {skill?.output ?? ''}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>

            <div className="stage-footer">
              {isRunning && (
                <div className="exec-status">
                  <div className="exec-dots">
                    <span /><span /><span />
                  </div>
                  <span className="exec-label">
                    步骤 {Math.min(runningStepIndex + 1, executingWorkflow.steps.length)} / {executingWorkflow.steps.length} 执行中...
                  </span>
                </div>
              )}
              {allDone && (
                <div className="exec-done">
                  <span className="done-icon">🎉</span>
                  <span className="done-text">全部完成！</span>
                  <button className="replay-btn" onClick={() => handleRunWorkflow(executingWorkflow.id)}>
                    再来一次
                  </button>
                  <button className="replay-btn" onClick={handleCloseExecution} style={{ marginLeft: 8 }}>
                    关闭
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeamDetailPage;

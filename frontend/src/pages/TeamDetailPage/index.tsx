import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAuth } from '../../contexts/AuthContext';
import { apiClient } from '../../utils/apiClient';
import { showToast } from '../../components/Toast';
import { getSkillHandler } from '../../skills';
import type { SkillResult } from '../../skills/types';
import CatSVG, { CatColors } from '../../components/CatSVG';
import CatMiniAvatar from '../../components/CatMiniAvatar';
import CatLogo from '../../components/CatLogo';
import Navbar from '../../components/Navbar';
import UserProfileDropdown from '../DashboardPage/UserProfileDropdown';
import '../../styles/WorkflowPanel.scss';
import { injectAdminSkillsToCats } from '../../data/skills';

const STEP_DURATION = 3000;

const workingDialogs: string[] = ['准备中...', '努力工作中~ 🐱', '马上就好!'];

/* ─── 自然语言 cron 解析 → 判断「现在是否该执行」 ─── */
/**
 * 解析中文自然语言 cron 规则，返回检查函数。
 * 支持格式示例：
 *   "每天 09:00"  "每天 9:00"
 *   "每小时"  "每30分钟"  "每2小时"
 *   "每周一 10:00"  "每周五 18:00"
 *   "每月1号 08:00"
 *   "工作日 09:30"
 */
function parseCronRule(cron: string): { intervalMs: number; shouldRun: (now: Date) => boolean } | null {
  if (!cron || !cron.trim()) return null;
  const s = cron.trim();

  // 每 N 分钟
  const minMatch = s.match(/每\s*(\d+)\s*分钟/);
  if (minMatch) {
    const mins = parseInt(minMatch[1], 10);
    return { intervalMs: mins * 60_000, shouldRun: (now) => now.getMinutes() % mins === 0 && now.getSeconds() < 30 };
  }

  // 每 N 小时
  const hourMatch = s.match(/每\s*(\d+)\s*小时/);
  if (hourMatch) {
    const hrs = parseInt(hourMatch[1], 10);
    return { intervalMs: hrs * 3600_000, shouldRun: (now) => now.getHours() % hrs === 0 && now.getMinutes() === 0 && now.getSeconds() < 30 };
  }

  // 每小时
  if (/每小时/.test(s)) {
    return { intervalMs: 3600_000, shouldRun: (now) => now.getMinutes() === 0 && now.getSeconds() < 30 };
  }

  // 提取时间 HH:MM
  const timeMatch = s.match(/(\d{1,2}):(\d{2})/);
  const hour = timeMatch ? parseInt(timeMatch[1], 10) : -1;
  const minute = timeMatch ? parseInt(timeMatch[2], 10) : 0;

  const timeOk = (now: Date) => now.getHours() === hour && now.getMinutes() === minute && now.getSeconds() < 30;

  // 每天
  if (/每天|每日/.test(s) && hour >= 0) {
    return { intervalMs: 30_000, shouldRun: timeOk };
  }

  // 工作日
  if (/工作日/.test(s) && hour >= 0) {
    return { intervalMs: 30_000, shouldRun: (now) => { const d = now.getDay(); return d >= 1 && d <= 5 && timeOk(now); } };
  }

  // 每周X
  const weekMap: Record<string, number> = { '日': 0, '天': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6 };
  const weekMatch = s.match(/每?周([一二三四五六日天])/);
  if (weekMatch && hour >= 0) {
    const dayOfWeek = weekMap[weekMatch[1]] ?? -1;
    return { intervalMs: 30_000, shouldRun: (now) => now.getDay() === dayOfWeek && timeOk(now) };
  }

  // 每月N号
  const monthMatch = s.match(/每月\s*(\d{1,2})\s*[号日]/);
  if (monthMatch && hour >= 0) {
    const dayOfMonth = parseInt(monthMatch[1], 10);
    return { intervalMs: 30_000, shouldRun: (now) => now.getDate() === dayOfMonth && timeOk(now) };
  }

  // 仅有时间，默认每天
  if (hour >= 0) {
    return { intervalMs: 30_000, shouldRun: timeOk };
  }

  return null;
}

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
  persistent?: boolean;
}

interface WorkflowRunRecord {
  id: string;
  workflowId: string | null;
  teamId: string;
  triggeredBy: string | null;
  workflowName: string;
  status: 'running' | 'success' | 'failed' | 'cancelled';
  steps: any[] | null;
  startedAt: string;
  completedAt: string | null;
  totalDuration: number | null;
  createdAt: string;
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
  const { user, logout, isAdmin } = useAuth();
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'cats' | 'workflows' | 'history'>('cats');
  const [selectedCat, setSelectedCat] = useState<TeamCat | null>(null);
  const [workflowRuns, setWorkflowRuns] = useState<WorkflowRunRecord[]>([]);

  // 执行弹窗状态
  const [executingWorkflow, setExecutingWorkflow] = useState<TeamWorkflow | null>(null);
  const [runningStepIndex, setRunningStepIndex] = useState(-1);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [currentDialog, setCurrentDialog] = useState('');
  const [stepResults, setStepResults] = useState<Map<number, SkillResult>>(new Map());
  const stepResultsRef = useRef<Map<number, SkillResult>>(new Map());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const schedulerRunningRef = useRef<Set<string>>(new Set()); // 正在自动执行的工作流 ID
  const teamWorkflowsRef = useRef<TeamWorkflow[]>([]); // 调度器用的 workflows 快照
  const currentRunIdRef = useRef<string | null>(null); // 当前手动执行的 run 记录 ID
  const runStartTimeRef = useRef<number>(0);
  const [viewingRun, setViewingRun] = useState<WorkflowRunRecord | null>(null); // 查看历史执行详情

  /** 点击历史记录，用 workflowPanel 展示执行详情 */
  const handleViewRunDetail = (run: WorkflowRunRecord) => {
    const wf = team?.workflows.find(w => w.id === run.workflowId);
    if (!wf) return;
    // 用 run 数据还原弹窗状态（只读模式）
    setViewingRun(run);
    setExecutingWorkflow(wf);
    setIsRunning(false);
    setRunningStepIndex(-1);
    setCurrentDialog('');
    // 还原所有步骤为已完成 + 结果
    const steps = Array.isArray(run.steps) ? run.steps : [];
    const completed = steps.map((_: any, i: number) => i);
    setCompletedSteps(completed);
    const resultsMap = new Map<number, SkillResult>();
    steps.forEach((step: any, idx: number) => {
      resultsMap.set(idx, {
        success: step.success ?? true,
        data: null,
        summary: step.summary || '',
        status: step.status || (step.success ? 'success' : 'error'),
      });
    });
    setStepResults(resultsMap);
    stepResultsRef.current = resultsMap;
  };

  /** 关闭历史详情查看 */
  const handleCloseRunDetail = () => {
    setViewingRun(null);
    setExecutingWorkflow(null);
    setRunningStepIndex(-1);
    setCompletedSteps([]);
    setIsRunning(false);
    setCurrentDialog('');
    const emptyMap = new Map<number, SkillResult>();
    setStepResults(emptyMap);
    stepResultsRef.current = emptyMap;
  };

  const loadTeam = useCallback(async () => {
    if (!teamId) return;
    try {
      const data = await apiClient.get(`/api/teams/${teamId}`);
      // 管理员的 Default 猫动态注入管理员私有技能
      if (data.cats) data.cats = injectAdminSkillsToCats(data.cats, isAdmin);
      setTeam(data);
    } catch (err) {
      console.error(err);
      navigate('/dashboard');
    } finally {
      setLoading(false);
    }
  }, [teamId, navigate, isAdmin]);

  const loadWorkflowRuns = useCallback(async () => {
    if (!teamId) return;
    try {
      const runs = await apiClient.get(`/api/workflows/team/${teamId}/runs`);
      setWorkflowRuns(Array.isArray(runs) ? runs : []);
    } catch (err) {
      console.error('[loadWorkflowRuns]', err);
    }
  }, [teamId]);

  useEffect(() => { loadTeam(); }, [loadTeam]);
  useEffect(() => { loadWorkflowRuns(); }, [loadWorkflowRuns]);

  /* ─── 定时工作流调度器 ─── */
  // 保持 workflows ref 与 team 同步
  useEffect(() => {
    teamWorkflowsRef.current = team?.workflows ?? [];
  }, [team]);

  // 调度器只在 teamId 变化时启动一次，通过 ref 读取最新 workflows
  useEffect(() => {
    if (!teamId) return;

    const autoExecuteWorkflow = async (wf: TeamWorkflow) => {
      if (schedulerRunningRef.current.has(wf.id)) return; // 防止重复
      schedulerRunningRef.current.add(wf.id);
      console.log(`[scheduler] 自动执行工作流: ${wf.name}`);
      showToast(`定时工作流「${wf.name}」开始自动执行`, 'success');

      const startTime = Date.now();
      let runId: string | null = null;
      const stepsData: any[] = [];

      try {
        // 创建后端 run 记录
        const run = await apiClient.post(`/api/workflows/${wf.id}/run`, {}).catch(() => null);
        runId = run?.id || null;

        // 逐步执行
        let prevResults: Record<string, unknown> = {};
        let hasFailed = false;
        for (let i = 0; i < wf.steps.length; i++) {
          const step = wf.steps[i];
          const handler = getSkillHandler(step.skillId);
          // 合并上游结果
          const merged: Record<string, unknown> = { ...prevResults };
          if (step.action) merged._action = step.action;
          if (step.params?.length) {
            const pv: Record<string, unknown> = {};
            for (const p of step.params) {
              if (p.value !== undefined) pv[p.key] = p.value;
              else if (p.defaultValue !== undefined) pv[p.key] = p.defaultValue;
            }
            if (Object.keys(pv).length > 0) merged._params = pv;
          }

          const input = Object.keys(merged).length > 0 ? merged : undefined;
          const result = handler
            ? await handler.execute({ agentId: step.agentId, input, timestamp: new Date().toISOString() })
            : { success: true, data: null, summary: step.action || '完成', status: 'success' as const };

          stepsData.push({
            index: i, skillId: step.skillId, action: step.action,
            success: result.success, status: result.status, summary: result.summary,
          });

          if (result.data && typeof result.data === 'object') {
            prevResults = { ...prevResults, ...(result.data as Record<string, unknown>) };
          }

          if (!result.success) {
            hasFailed = true;
            console.warn(`[scheduler] ${wf.name} 步骤 ${i + 1} 失败:`, result.summary);
            showToast(`定时工作流「${wf.name}」步骤 ${i + 1} 失败`, 'warning');
            break;
          }
        }

        // 更新 run 记录
        if (runId) {
          apiClient.put(`/api/workflows/runs/${runId}`, {
            status: hasFailed ? 'failed' : 'success',
            steps: stepsData,
            completedAt: new Date().toISOString(),
            totalDuration: Math.round((Date.now() - startTime) / 1000),
          }).catch(() => {});
        }

        console.log(`[scheduler] 工作流 ${wf.name} 执行完成`);
        loadWorkflowRuns();
      } catch (err) {
        console.error(`[scheduler] ${wf.name} 执行异常:`, err);
        if (runId) {
          apiClient.put(`/api/workflows/runs/${runId}`, {
            status: 'failed', steps: stepsData,
            completedAt: new Date().toISOString(),
            totalDuration: Math.round((Date.now() - startTime) / 1000),
          }).catch(() => {});
        }
      } finally {
        schedulerRunningRef.current.delete(wf.id);
      }
    };

    // 每 15 秒检查一次，通过 ref 读取最新的 workflows 和 cron 规则
    const timer = setInterval(() => {
      const workflows = teamWorkflowsRef.current;
      const cronWorkflows = workflows.filter(
        wf => (wf.trigger === 'cron' || (wf as any).scheduled) && wf.enabled && wf.cron
      );
      if (cronWorkflows.length === 0) return;

      const now = new Date();
      for (const wf of cronWorkflows) {
        const rule = parseCronRule(wf.cron || '');
        if (rule && rule.shouldRun(now)) {
          autoExecuteWorkflow(wf);
        }
      }
    }, 15_000);

    console.log(`[scheduler] 已启动，每 15s 检查定时工作流`);

    return () => {
      clearInterval(timer);
      console.log('[scheduler] 已停止');
    };
  }, [teamId]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const handleRunWorkflow = async (wfId: string) => {
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
    runStartTimeRef.current = Date.now();
    // 在后端创建 run 记录并保存 ID
    try {
      const run = await apiClient.post(`/api/workflows/${wfId}/run`, {});
      currentRunIdRef.current = run?.id || null;
    } catch {
      currentRunIdRef.current = null;
    }
  };

  const handleCloseExecution = () => {
    // 如果 run 记录还未更新（用户中途关闭），标记为 cancelled
    if (currentRunIdRef.current) {
      const allCompleted = executingWorkflow && completedSteps.length === executingWorkflow.steps.length;
      if (!allCompleted) {
        updateRunRecord('cancelled');
      }
    }

    currentRunIdRef.current = null;
    setViewingRun(null);
    setExecutingWorkflow(null);
    setRunningStepIndex(-1);
    setCompletedSteps([]);
    setIsRunning(false);
    setCurrentDialog('');
    const emptyMap = new Map<number, SkillResult>();
    setStepResults(emptyMap);
    stepResultsRef.current = emptyMap;
    loadTeam();
    loadWorkflowRuns();
  };

  /** 更新后端 run 记录状态 */
  const updateRunRecord = (status: 'success' | 'failed' | 'cancelled') => {
    const runId = currentRunIdRef.current;
    if (!runId || !executingWorkflow) return;
    const allResults = Array.from(stepResultsRef.current.entries()).sort((a, b) => a[0] - b[0]);
    const totalDuration = Math.round((Date.now() - runStartTimeRef.current) / 1000);
    const stepsData = allResults.map(([idx, r]) => ({
      index: idx,
      skillId: executingWorkflow.steps[idx]?.skillId,
      action: executingWorkflow.steps[idx]?.action,
      success: r.success,
      status: r.status,
      summary: r.summary,
    }));
    apiClient.put(`/api/workflows/runs/${runId}`, {
      status, steps: stepsData,
      completedAt: new Date().toISOString(),
      totalDuration,
    }).then(() => loadWorkflowRuns()).catch(() => {});
    currentRunIdRef.current = null;
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
            // 步骤失败 → 更新 run 记录为 failed
            updateRunRecord('failed');
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
          updateRunRecord('failed');
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

  // 工作流全部步骤完成后，自动更新后端 run 记录
  useEffect(() => {
    if (!allDone || !currentRunIdRef.current) return;
    const allResults = Array.from(stepResultsRef.current.entries());
    const hasFailed = allResults.some(([, r]) => r.status === 'error' || !r.success);
    updateRunRecord(hasFailed ? 'failed' : 'success');
  }, [allDone]);

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
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRunWorkflow(wf.id); }}
                        className="opacity-0 group-hover:opacity-100 transition-all p-1.5 rounded-lg shrink-0 cursor-pointer text-text-tertiary hover:text-primary-600 hover:bg-primary-50"
                        title="执行工作流"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                      </button>
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
        {activeTab === 'history' && (() => {
          // 只显示持久化工作流的执行记录
          const persistentWfIds = new Set(team.workflows.filter(wf => wf.persistent).map(wf => wf.id));
          const filteredRuns = workflowRuns.filter(r => r.workflowId && persistentWfIds.has(r.workflowId));

          // 按日期分组
          const grouped: Record<string, WorkflowRunRecord[]> = {};
          for (const run of filteredRuns) {
            const dateKey = new Date(run.startedAt).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
            (grouped[dateKey] ||= []).push(run);
          }
          const dateKeys = Object.keys(grouped);

          return (
            <section className="pb-16">
              {filteredRuns.length === 0 ? (
                <div className="text-center py-20 rounded-[32px] border border-border bg-surface-secondary/50">
                  <h3 className="text-xl font-black text-text-primary mb-2">暂无工作日志</h3>
                  <p className="text-text-secondary font-medium max-w-sm mx-auto">持久化工作流执行后，记录会出现在这里</p>
                </div>
              ) : (
                <div className="space-y-8">
                  {dateKeys.map(dateKey => (
                    <div key={dateKey}>
                      <h3 className="text-sm font-bold text-text-tertiary uppercase tracking-widest mb-4">{dateKey}</h3>
                      <div className="space-y-3">
                        {grouped[dateKey].map(run => {
                          const wf = team.workflows.find(w => w.id === run.workflowId);
                          const statusConfig: Record<string, { icon: string; color: string; bg: string; label: string }> = {
                            success: { icon: '✅', color: 'text-green-600', bg: 'bg-green-50 border-green-200', label: '成功' },
                            failed: { icon: '❌', color: 'text-red-600', bg: 'bg-red-50 border-red-200', label: '失败' },
                            running: { icon: '⏳', color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200', label: '执行中' },
                            cancelled: { icon: '⏹', color: 'text-gray-500', bg: 'bg-gray-50 border-gray-200', label: '已取消' },
                          };
                          const sc = statusConfig[run.status] || statusConfig.running;
                          const startTime = new Date(run.startedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                          const steps = Array.isArray(run.steps) ? run.steps : [];

                          return (
                            <div key={run.id} className="bg-surface rounded-[20px] border border-border p-5 hover:shadow-md transition-shadow cursor-pointer" onClick={() => handleViewRunDetail(run)}>
                              <div className="flex items-start justify-between mb-3">
                                <div className="flex items-center gap-3">
                                  <span className="text-2xl">{wf?.icon || '📋'}</span>
                                  <div>
                                    <h4 className="font-bold text-text-primary">{run.workflowName}</h4>
                                    <div className="flex items-center gap-2 mt-1">
                                      <span className="text-xs text-text-tertiary font-medium">{startTime}</span>
                                      {run.totalDuration != null && (
                                        <span className="text-xs text-text-tertiary font-medium">· 耗时 {run.totalDuration}s</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${sc.bg} ${sc.color}`}>
                                  {sc.icon} {sc.label}
                                </span>
                              </div>

                              {/* 步骤详情 */}
                              {steps.length > 0 && (
                                <div className="mt-3 space-y-1.5">
                                  {steps.map((step: any, idx: number) => {
                                    const stepCat = wf?.steps[step.index]?.agentId
                                      ? team.cats.find(c => c.id === wf.steps[step.index].agentId || c.templateId === wf.steps[step.index].agentId)
                                      : null;
                                    return (
                                      <div key={idx} className="flex items-start gap-2 pl-2 py-1.5 rounded-lg bg-surface-secondary/60">
                                        <span className="text-xs mt-0.5 shrink-0">
                                          {step.success ? '✅' : '❌'}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                          <div className="flex items-center gap-1.5">
                                            {stepCat && (
                                              <div className="w-4 h-4 rounded-full overflow-hidden border border-border bg-surface flex items-center justify-center shrink-0">
                                                <CatMiniAvatar colors={stepCat.catColors} size={14} />
                                              </div>
                                            )}
                                            <span className="text-xs font-bold text-text-secondary">
                                              {step.action || step.skillId}
                                            </span>
                                          </div>
                                          {step.summary && (
                                            <p className="text-xs text-text-tertiary mt-0.5 line-clamp-2">{step.summary}</p>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })()}
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

      {/* 工作流执行弹窗（实时执行 / 查看历史） */}
      {executingWorkflow && (() => {
        const isViewingHistory = !!viewingRun;
        const closeHandler = isViewingHistory ? handleCloseRunDetail : handleCloseExecution;
        const statusConfig: Record<string, { icon: string; label: string; color: string }> = {
          success: { icon: '✅', label: '执行成功', color: 'text-green-600' },
          failed: { icon: '❌', label: '执行失败', color: 'text-red-600' },
          cancelled: { icon: '⏹', label: '已取消', color: 'text-gray-500' },
          running: { icon: '⏳', label: '执行中', color: 'text-blue-600' },
        };
        const runStatus = isViewingHistory ? (statusConfig[viewingRun!.status] || statusConfig.running) : null;

        return (
        <div className={`workflow-overlay ${executingWorkflow ? 'visible' : ''}`}>
          <div className="overlay-backdrop" onClick={closeHandler} />
          <div className="execution-stage">
            <div className="stage-header">
              <div className="stage-title">
                <span className="stage-name">{executingWorkflow.icon} {executingWorkflow.name}</span>
                {isViewingHistory && (
                  <span className={`ml-3 text-xs font-bold ${runStatus!.color}`}>
                    {runStatus!.icon} {runStatus!.label}
                  </span>
                )}
              </div>
              <button className="stage-close" onClick={closeHandler}>
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
              {isViewingHistory ? (
                <div className="exec-done">
                  <span className="done-text" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {new Date(viewingRun!.startedAt).toLocaleString('zh-CN')}
                    {viewingRun!.totalDuration != null && ` · 耗时 ${viewingRun!.totalDuration}s`}
                  </span>
                  <button className="replay-btn" onClick={closeHandler}>
                    关闭
                  </button>
                </div>
              ) : (
                <>
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
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
};

export default TeamDetailPage;

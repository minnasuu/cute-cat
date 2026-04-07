import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAuth } from '../../contexts/AuthContext';
import { apiClient } from '../../utils/apiClient';
import { getAgentHandler } from '../../agents';
import type { AgentResult } from '../../agents/types';
import type { WorkflowStep } from '../../data/types';
import { resolveInputFromIndex } from '../../data/types';
import CatSVG, { CatColors } from '../../components/CatSVG';
import CatMiniAvatar from '../../components/CatMiniAvatar';
import CatLogo from '../../components/CatLogo';
import Navbar from '../../components/Navbar';
import UserProfileDropdown from '../DashboardPage/UserProfileDropdown';
import '../../styles/WorkflowPanel.scss';
import { AppIcon } from '../../components/icons';
import { Clock } from 'lucide-react';

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
  const [totalAiCalls, setTotalAiCalls] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'cats' | 'workflows' | 'history'>('cats');
  const [selectedCat, setSelectedCat] = useState<TeamCat | null>(null);
  const [workflowRuns, setWorkflowRuns] = useState<WorkflowRunRecord[]>([]);

  // 执行弹窗状态
  const [executingWorkflow, setExecutingWorkflow] = useState<TeamWorkflow | null>(null);
  const [isPreparing, setIsPreparing] = useState(false); // 预览确认阶段（尚未执行）
  const [editableStepParams, setEditableStepParams] = useState<Map<number, Record<string, unknown>>>(new Map()); // 每步可编辑参数
  const [runningStepIndices, setRunningStepIndices] = useState<Set<number>>(new Set()); // 当前并行执行中的步骤索引集合
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const completedStepsRef = useRef<number[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [currentDialog, setCurrentDialog] = useState('');
  const [stepResults, setStepResults] = useState<Map<number, AgentResult>>(new Map());
  const stepResultsRef = useRef<Map<number, AgentResult>>(new Map());
  const currentRunIdRef = useRef<string | null>(null); // 当前手动执行的 run 记录 ID
  const runStartTimeRef = useRef<number>(0);
  // 每步耗时: { start: 开始时间戳ms, duration: 耗时ms(完成后填入) }
  const [stepTimings, setStepTimings] = useState<Map<number, { start: number; duration?: number }>>(new Map());
  const stepTimingsRef = useRef<Map<number, { start: number; duration?: number }>>(new Map());
  // footer 实时总耗时（秒）
  const [totalElapsed, setTotalElapsed] = useState(0);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [viewingRun, setViewingRun] = useState<WorkflowRunRecord | null>(null); // 查看历史执行详情
  // DAG 层级信息
  const [dagLayers, setDagLayers] = useState<number[][]>([]);
  const [dagParentIndex, setDagParentIndex] = useState<number[]>([]);

  /** 点击历史记录，用 workflowPanel 展示执行详情 */
  const handleViewRunDetail = (run: WorkflowRunRecord) => {
    const wf = team?.workflows.find(w => w.id === run.workflowId);
    if (!wf) return;
    // 用 run 数据还原弹窗状态（只读模式）
    setViewingRun(run);
    setExecutingWorkflow(wf);
    setIsRunning(false);
    setRunningStepIndices(new Set());
    setCurrentDialog('');

    const runSteps = Array.isArray(run.steps) ? run.steps : [];

    if (runSteps.length > 0) {
      // 有步骤数据 → 用 run.steps 中的 index 映射到 wf.steps
      const completed = runSteps.map((s: any) => s.index ?? 0);
      setCompletedSteps(completed);
      const resultsMap = new Map<number, AgentResult>();
      const timingsMap = new Map<number, { start: number; duration?: number }>();
      runSteps.forEach((step: any) => {
        const idx = step.index ?? 0;
        resultsMap.set(idx, {
          success: step.success ?? true,
          data: { text: step.summary || '' },
          summary: step.summary || '',
          status: step.status || (step.success ? 'success' : 'error'),
        });
        if (step.duration != null) {
          timingsMap.set(idx, { start: 0, duration: step.duration });
        }
      });
      setStepResults(resultsMap);
      stepResultsRef.current = resultsMap;
      setStepTimings(timingsMap);
      stepTimingsRef.current = timingsMap;
    } else {
      // 没有步骤数据（可能执行中或异常退出）
      // 根据 run.status 决定展示方式
      if (run.status === 'running') {
        // 仍在执行中：所有步骤标记为 pending
        setCompletedSteps([]);
      } else {
        // failed / cancelled / success 但没有 steps 数据：将所有步骤标记为完成，用 run.status 推断结果
        const completed = wf.steps.map((_: any, i: number) => i);
        setCompletedSteps(completed);
        const resultsMap = new Map<number, AgentResult>();
        const isFailed = run.status === 'failed';
        wf.steps.forEach((_: any, i: number) => {
          resultsMap.set(i, {
            success: !isFailed,
            data: { text: isFailed ? '执行失败（无详细记录）' : '执行完成（无详细记录）' },
            summary: isFailed ? '执行失败（无详细记录）' : '执行完成（无详细记录）',
            status: isFailed ? 'error' : 'success',
          });
        });
        setStepResults(resultsMap);
        stepResultsRef.current = resultsMap;
      }
      const emptyMap = new Map<number, AgentResult>();
      if (run.status === 'running') {
        setStepResults(emptyMap);
        stepResultsRef.current = emptyMap;
      }
    }
  };

  /** 关闭历史详情查看 */
  const handleCloseRunDetail = () => {
    setViewingRun(null);
    setExecutingWorkflow(null);
    setIsPreparing(false);
    setEditableStepParams(new Map());
    setRunningStepIndices(new Set());
    setCompletedSteps([]);
    setIsRunning(false);
    setCurrentDialog('');
    const emptyMap = new Map<number, AgentResult>();
    setStepResults(emptyMap);
    stepResultsRef.current = emptyMap;
    const emptyTimings = new Map<number, { start: number; duration?: number }>();
    setStepTimings(emptyTimings);
    stepTimingsRef.current = emptyTimings;
    setTotalElapsed(0);
  };

  const loadTeam = useCallback(async () => {
    if (!teamId) return;
    try {
      const [data, stats] = await Promise.all([
        apiClient.get(`/api/teams/${teamId}`),
        apiClient.get<Array<{ count: number }>>(`/api/teams/${teamId}/ai-stats`).catch(() => []),
      ]);
      setTeam(data);
      setTotalAiCalls(Array.isArray(stats) ? stats.reduce((s, r) => s + (r.count || 0), 0) : 0);
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

  // 定期轮询执行记录（后端调度器执行的定时工作流结果会自动刷新）
  useEffect(() => {
    if (!teamId) return;
    const pollTimer = setInterval(() => {
      loadWorkflowRuns();
    }, 30_000); // 每 30 秒刷新一次
    return () => clearInterval(pollTimer);
  }, [teamId, loadWorkflowRuns]);

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

    // ── 进入预览确认阶段：初始化每步的可编辑参数 ──
    const paramsMap = new Map<number, Record<string, unknown>>();
    wf.steps.forEach((step: any, i: number) => {
      const cat = team?.cats.find(c => c.id === step.agentId || c.templateId === step.agentId);
      const skill = cat?.skills?.find((s: any) => s.id === step.agentId);
      const paramDefs = step.params || skill?.paramDefs || [];
      if (paramDefs.length > 0) {
        const values: Record<string, unknown> = {};
        for (const p of paramDefs) {
          // 优先使用步骤上已配置的 value，其次 defaultValue
          if (p.value !== undefined) values[p.key] = p.value;
          else if (p.defaultValue !== undefined) values[p.key] = p.defaultValue;
          else values[p.key] = p.type === 'toggle' ? false : p.type === 'tags' ? [] : p.type === 'number' ? '' : '';
        }
        paramsMap.set(i, values);
      }
    });

    setExecutingWorkflow(wf);
    setIsPreparing(true);
    setEditableStepParams(paramsMap);
    setRunningStepIndices(new Set());
    setCompletedSteps([]);
    setIsRunning(false);
    setCurrentDialog('');
    const emptyMap = new Map<number, AgentResult>();
    setStepResults(emptyMap);
    stepResultsRef.current = emptyMap;
    const emptyTimings = new Map<number, { start: number; duration?: number }>();
    setStepTimings(emptyTimings);
    stepTimingsRef.current = emptyTimings;
    setTotalElapsed(0);
    setDagLayers([]);
    setDagParentIndex([]);
  };

  /** 更新某步某参数 */
  const handleStepParamChange = (stepIndex: number, key: string, value: unknown) => {
    setEditableStepParams(prev => {
      const next = new Map(prev);
      const current = next.get(stepIndex) || {};
      next.set(stepIndex, { ...current, [key]: value });
      return next;
    });
  };

  /** 确认执行工作流（预览确认后点击执行） */
  const handleConfirmRun = async () => {
    if (!executingWorkflow) return;

    // 将用户编辑的参数写回到 workflow steps 上（内存中），供执行逻辑读取
    const wf = { ...executingWorkflow, steps: executingWorkflow.steps.map((step: any, i: number) => {
      const editedParams = editableStepParams.get(i);
      if (!editedParams) return step;
      const cat = team?.cats.find(c => c.id === step.agentId || c.templateId === step.agentId);
      const skill = cat?.skills?.find((s: any) => s.id === step.agentId);
      const paramDefs = step.params || skill?.paramDefs || [];
      const mergedParams = paramDefs.map((p: any) => ({
        ...p,
        value: editedParams[p.key] !== undefined ? editedParams[p.key] : p.value,
      }));
      return { ...step, params: mergedParams };
    }) };

    setExecutingWorkflow(wf);
    setIsPreparing(false);

    // ── 构建 DAG：解析每个步骤的上游依赖索引和拓扑层级 ──
    const steps = wf.steps as WorkflowStep[];
    const pIndex: number[] = [];
    for (let i = 0; i < steps.length; i++) {
      pIndex.push(resolveInputFromIndex(steps, i, steps[i].inputFrom));
    }
    // 计算拓扑层级
    const depth: number[] = new Array(steps.length).fill(0);
    for (let i = 0; i < steps.length; i++) {
      depth[i] = pIndex[i] >= 0 ? depth[pIndex[i]] + 1 : 1;
    }
    const maxDepth = Math.max(...depth, 0);
    const layers: number[][] = [];
    for (let d = 0; d <= maxDepth; d++) layers.push([]);
    for (let i = 0; i < steps.length; i++) layers[depth[i]].push(i);

    setDagParentIndex(pIndex);
    setDagLayers(layers);

    // 启动第一层步骤（depth=1）
    const firstLayer = layers[1] || [];
    completedStepsRef.current = [];
    setRunningStepIndices(new Set(firstLayer));
    setIsRunning(true);
    runStartTimeRef.current = Date.now();
    setTotalElapsed(0);
    // 启动实时总耗时定时器
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    const startTs = Date.now();
    elapsedTimerRef.current = setInterval(() => {
      setTotalElapsed(Math.round((Date.now() - startTs) / 1000));
    }, 1000);
    // 在后端创建 run 记录并保存 ID
    try {
      const run = await apiClient.post(`/api/workflows/${executingWorkflow.id}/run`, {});
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
    setIsPreparing(false);
    setEditableStepParams(new Map());
    setRunningStepIndices(new Set());
    setCompletedSteps([]);
    setIsRunning(false);
    setCurrentDialog('');
    const emptyMap = new Map<number, AgentResult>();
    setStepResults(emptyMap);
    stepResultsRef.current = emptyMap;
    const emptyTimings = new Map<number, { start: number; duration?: number }>();
    setStepTimings(emptyTimings);
    stepTimingsRef.current = emptyTimings;
    setTotalElapsed(0);
    setDagLayers([]);
    setDagParentIndex([]);
    if (elapsedTimerRef.current) { clearInterval(elapsedTimerRef.current); elapsedTimerRef.current = null; }
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
      agentId: executingWorkflow.steps[idx]?.agentId,
      success: r.success,
      status: r.status,
      summary: r.summary,
      duration: stepTimingsRef.current.get(idx)?.duration ?? null,
    }));
    apiClient.put(`/api/workflows/runs/${runId}`, {
      status, steps: stepsData,
      completedAt: new Date().toISOString(),
      totalDuration,
    }).then(() => loadWorkflowRuns()).catch(() => {});
    currentRunIdRef.current = null;
  };

  // ── DAG 分层并行执行引擎 ──
  useEffect(() => {
    if (!isRunning || !executingWorkflow || runningStepIndices.size === 0) return;

    const steps = executingWorkflow.steps;
    const dialogs = workingDialogs;
    setCurrentDialog(dialogs[0]);

    // 为当前层的每个步骤创建执行 Promise
    const cleanups: (() => void)[] = [];

    const layerPromises = Array.from(runningStepIndices).map(async (stepIdx) => {
      const step = steps[stepIdx];
      const cat = team?.cats.find(c => c.id === step.agentId || c.templateId === step.agentId);
      const skill = cat?.skills?.find((s: any) => s.id === step.agentId);

      // 记录步骤开始时间
      const stepStartTime = Date.now();
      setStepTimings(prev => {
        const next = new Map(prev);
        next.set(stepIdx, { start: stepStartTime });
        stepTimingsRef.current = next;
        return next;
      });

      const handler = getAgentHandler(step.agentId);

      // 构建 skillInput：合并上游步骤输出 + action + params
      let skillInput: unknown = undefined;
      {
        const merged: Record<string, unknown> = {};
        // 合并上游步骤输出（按 DAG 依赖关系，只取直接上游的结果）
        const parentIdx = dagParentIndex[stepIdx] ?? (stepIdx === 0 ? -1 : stepIdx - 1);
        if (parentIdx >= 0) {
          const prev = stepResultsRef.current.get(parentIdx)?.data;
          if (prev && typeof prev === 'object') Object.assign(merged, prev as Record<string, unknown>);
        }
        // 将步骤的 action 作为任务指令注入
        if (step.action) merged._action = step.action;
        // 参数配置注入（支持 valueSource 来源解析）
        if (step.params && step.params.length > 0) {
          const paramValues: Record<string, unknown> = {};
          for (const p of step.params) {
            const source = p.valueSource || 'static';
            if (source === 'upstream') {
              let found: unknown = undefined;
              // 从上游依赖链中提取
              let searchIdx = parentIdx;
              while (searchIdx >= 0 && found === undefined) {
                const prevData = stepResultsRef.current.get(searchIdx)?.data;
                if (prevData != null) {
                  if (typeof prevData === 'string') {
                    found = prevData;
                  } else if (typeof prevData === 'object') {
                    const d = prevData as Record<string, unknown>;
                    found = d.text ?? d.summary ?? d.notes ?? d.content ?? d.result ?? d.html ?? d.body ?? d.data;
                    if (found === undefined) found = JSON.stringify(prevData);
                  }
                }
                // 继续向上游追溯
                searchIdx = dagParentIndex[searchIdx] ?? -1;
              }
              paramValues[p.key] = found !== undefined ? found : (p.value ?? p.defaultValue);
            } else if (source === 'system') {
              const sysKey = p.systemKey || '';
              if (sysKey === 'user.email') paramValues[p.key] = user?.email || '';
              else if (sysKey === 'user.name') paramValues[p.key] = user?.nickname || '';
              else if (sysKey === 'workflow.name') paramValues[p.key] = executingWorkflow?.name || '';
              else if (sysKey === 'timestamp') paramValues[p.key] = new Date().toISOString();
              else paramValues[p.key] = p.value ?? p.defaultValue;
            } else {
              if (p.value !== undefined) paramValues[p.key] = p.value;
              else if (p.defaultValue !== undefined) paramValues[p.key] = p.defaultValue;
            }
          }
          if (Object.keys(paramValues).length > 0) merged._params = paramValues;
        }
        skillInput = Object.keys(merged).length > 0 ? merged : undefined;
      }

      const executePromise = handler
        ? handler.execute({
            agentId: step.agentId,
            input: typeof skillInput === 'string' ? skillInput : JSON.stringify(skillInput ?? ''),
            timestamp: new Date().toISOString(),
            catName: cat?.name,
            catRole: cat?.role,
            workflowName: executingWorkflow?.name,
            onChunk: (_chunk, accumulated) => {
              const preview = accumulated.length > 60
                ? accumulated.slice(accumulated.length - 60)
                : accumulated;
              setCurrentDialog(preview + '▍');
            },
          })
        : Promise.resolve<AgentResult>({
            success: true,
            data: { text: skill?.mockResult ?? step.action ?? '执行完成' },
            summary: skill?.mockResult ?? step.action ?? "执行完成",
            status: "success",
          });

      // 等待最小展示时间
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, STEP_DURATION);
        cleanups.push(() => clearTimeout(t));
      });

      try {
        const result = await executePromise;
        const stepDuration = Date.now() - stepStartTime;
        setStepTimings(prev => {
          const next = new Map(prev);
          next.set(stepIdx, { start: stepStartTime, duration: stepDuration });
          stepTimingsRef.current = next;
          return next;
        });
        setStepResults(prev => {
          const next = new Map(prev);
          next.set(stepIdx, result);
          stepResultsRef.current = next;
          return next;
        });
        return { stepIdx, result, failed: result.status === 'error' || result.success === false };
      } catch {
        const stepDuration = Date.now() - stepStartTime;
        setStepTimings(prev => {
          const next = new Map(prev);
          next.set(stepIdx, { start: stepStartTime, duration: stepDuration });
          stepTimingsRef.current = next;
          return next;
        });
        const errResult: AgentResult = { success: false, data: { text: '执行出错' }, summary: '执行出错', status: 'error' };
        setStepResults(prev => {
          const next = new Map(prev);
          next.set(stepIdx, errResult);
          stepResultsRef.current = next;
          return next;
        });
        return { stepIdx, result: errResult, failed: true };
      }
    });

    // 当前层所有步骤执行完毕后，决定下一步
    Promise.all(layerPromises).then(results => {
      const completedIndices = results.map(r => r.stepIdx);
      const hasFailed = results.some(r => r.failed);

      setCurrentDialog(hasFailed ? '出错了...' : (results[0]?.result.summary || dialogs[2]));

      setTimeout(() => {
        setCompletedSteps(prev => {
          const next = [...prev, ...completedIndices];
          completedStepsRef.current = next;
          return next;
        });

        if (hasFailed) {
          updateRunRecord('failed');
          setIsRunning(false);
          setRunningStepIndices(new Set());
          return;
        }

        // 找到下一层可执行的步骤（所有上游依赖都已完成的步骤）
        const allCompleted = new Set([...completedStepsRef.current, ...completedIndices]);
        const nextSteps: number[] = [];
        for (let i = 0; i < steps.length; i++) {
          if (allCompleted.has(i)) continue;
          // 检查上游依赖是否已完成
          const parentIdx = dagParentIndex[i] ?? (i === 0 ? -1 : i - 1);
          if (parentIdx < 0 || allCompleted.has(parentIdx)) {
            nextSteps.push(i);
          }
        }

        if (nextSteps.length > 0) {
          setRunningStepIndices(new Set(nextSteps));
        } else {
          // 所有步骤都已完成
          setIsRunning(false);
          setRunningStepIndices(new Set());
          setCurrentDialog('');
        }
      }, 500);
    });

    return () => {
      cleanups.forEach(fn => fn());
    };
  }, [isRunning, runningStepIndices, executingWorkflow, team]);

  const allDone = executingWorkflow && !isRunning && completedSteps.length === executingWorkflow.steps.length;

  // 工作流全部步骤完成后，自动更新后端 run 记录 & 停止计时
  useEffect(() => {
    if (!allDone) return;
    // 停止实时计时器
    if (elapsedTimerRef.current) { clearInterval(elapsedTimerRef.current); elapsedTimerRef.current = null; }
    setTotalElapsed(Math.round((Date.now() - runStartTimeRef.current) / 1000));
    if (!currentRunIdRef.current) return;
    const allResults = Array.from(stepResultsRef.current.entries());
    const hasFailed = allResults.some(([, r]) => r.status === 'error' || !r.success);
    updateRunRecord(hasFailed ? 'failed' : 'success');
  }, [allDone]);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">加载中...</div>;
  if (!team) return null;

  return (
    <div className="min-h-screen bg-surface text-text-primary selection:bg-primary-100 selection:text-primary-900">
      <Navbar
        rightSlot={
          user ? (
            <UserProfileDropdown
              user={user}
              workflowCount={team._count.workflows}
              officialCatCount={team._count.cats}
              workflowRuns={team._count.workflowRuns}
              totalAiCalls={totalAiCalls}
              onLogout={logout}
            />
          ) : undefined
        }
      />

      <main
        className="max-w-6xl mx-auto px-6"
        style={{ minHeight: "calc(100vh - 133px)" }}
      >
        {/* Hero header */}
        <section className="relative pb-10 pt-3 md:pb-14 md:pt-4">
          <div className="absolute top-0 left-1/4 w-72 h-72 bg-primary-100/30 rounded-full blur-[100px] -z-10 pointer-events-none" />
          <div className="absolute top-8 right-1/4 w-72 h-72 bg-accent-100/30 rounded-full blur-[100px] -z-10 pointer-events-none" />

          <button
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-1.5 text-sm font-medium text-text-tertiary hover:text-text-secondary transition-colors mb-4 cursor-pointer"
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
            返回工作台
          </button>

          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-xl md:text-2xl font-black tracking-tight">
              {team.name}
            </h1>
            <div className="w-px h-4 bg-black/10"></div>
            {team.description && (
              <p className="text-xs text-text-tertiary max-w-xl">
                {team.description}
              </p>
            )}
          </div>
        </section>

        {/* Stats bar */}
        <section className="py-6 mb-8 border-y border-border bg-surface-secondary/30 -mx-6 px-6">
          <div className="grid grid-cols-3 gap-8">
            {[
              { label: "猫猫", val: String(team._count.cats) },
              { label: "工作流", val: String(team._count.workflows) },
              { label: "执行次数", val: String(team._count.workflowRuns) },
            ].map((s, i) => (
              <div key={i} className="text-center">
                <div className="text-2xl font-black text-text-primary">
                  {s.val}
                </div>
                <div className="text-xs font-bold text-text-tertiary uppercase tracking-widest mt-1">
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Tabs */}
        <div className="flex gap-1 mb-8 bg-surface-tertiary/60 rounded-2xl p-1.5 w-fit">
          {(["cats", "workflows", "history"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer ${
                activeTab === tab
                  ? "bg-surface text-text-primary shadow-sm"
                  : "text-text-tertiary hover:text-text-secondary"
              }`}
            >
              {tab === "cats"
                ? `猫猫 (${team._count.cats})`
                : tab === "workflows"
                  ? `工作流 (${team._count.workflows})`
                  : `工作日志`}
            </button>
          ))}
        </div>

        {/* === Cats Tab === */}
        {activeTab === "cats" && (
          <section className="pb-16">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
              {team.cats.map((cat) => (
                <div
                  key={cat.id}
                  className="bg-surface rounded-[24px] border border-border p-5 hover:shadow-lg hover:border-border-strong transition-all cursor-pointer group relative"
                  onClick={() => setSelectedCat(cat)}
                >
                  {isAdmin && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteCat(cat.id, cat.name);
                      }}
                      className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 text-text-tertiary hover:text-danger-500 transition-all p-1.5 rounded-lg hover:bg-danger-50 cursor-pointer"
                      title="移除猫猫"
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
                  <div className="flex justify-center mb-4">
                    <div className="w-20 h-20">
                      <CatSVG
                        colors={cat.catColors}
                        className="w-full h-full"
                      />
                    </div>
                  </div>
                  <h4 className="font-black text-text-primary text-center">
                    {cat.name}
                  </h4>
                  <p
                    className="text-xs font-bold text-center mt-1"
                    style={{ color: cat.accent }}
                  >
                    {cat.role}
                  </p>
                  <div className="flex flex-wrap gap-1.5 justify-center mt-3">
                    <span className="text-[10px] font-bold bg-primary-50 text-primary-700 px-2 py-0.5 rounded-full border border-primary-200">
                      ✨ AIGC
                    </span>
                  </div>
                </div>
              ))}

              {isAdmin && (
                <div
                  className={`bg-surface/50 rounded-[24px] border-2 border-dashed border-border-strong p-5 transition-all cursor-pointer flex flex-col items-center justify-center min-h-[220px] hover:border-primary-400 hover:bg-primary-50/50`}
                  onClick={() => navigate(`/teams/${teamId}/cats/new`)}
                >
                  <div className="w-14 h-14 rounded-full bg-primary-50 border border-primary-100 flex items-center justify-center text-primary-500 text-2xl mb-3">
                    +
                  </div>
                  <span className="text-sm font-bold text-text-secondary">
                    添加官方猫猫
                  </span>
                </div>
              )}
            </div>
          </section>
        )}

        {/* === Workflows Tab === */}
        {activeTab === "workflows" && (
          <section className="pb-16">
            <div className="space-y-4">
              {team.workflows.map((wf) => (
                <div
                  key={wf.id}
                  className="bg-surface rounded-[24px] border border-border p-6 hover:shadow-lg hover:border-border-strong transition-all group cursor-pointer"
                  onClick={() =>
                    navigate(`/teams/${teamId}/workflows/${wf.id}`)
                  }
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-surface-secondary border border-border flex items-center justify-center text-primary-600 shrink-0">
                        <AppIcon symbol={wf.icon} size={26} />
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-black text-text-primary group-hover:text-primary-600 transition-colors">
                          {wf.name}
                        </h4>
                        <p className="text-sm text-text-secondary font-medium mt-0.5 line-clamp-1">
                          {wf.description}
                        </p>
                        {/* Meta badges */}
                        <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                          <span className="px-2.5 py-1 rounded-full bg-surface-secondary border border-border text-[10px] font-bold text-text-tertiary">
                            {wf.steps.length} 步骤
                          </span>
                          {wf.trigger === "cron" && wf.cron && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-accent-50 border border-accent-200 text-[10px] font-bold text-accent-600">
                              <Clock size={12} strokeWidth={2.5} aria-hidden />
                              {wf.cron}
                            </span>
                          )}
                          <span
                            className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${wf.enabled ? "bg-green-50 border border-green-200 text-green-600" : "bg-surface-secondary border border-border text-text-tertiary"}`}
                          >
                            {wf.enabled ? "已启用" : "未启用"}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRunWorkflow(wf.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-all p-1.5 rounded-lg shrink-0 cursor-pointer text-text-tertiary hover:text-primary-600 hover:bg-primary-50"
                        title="执行工作流"
                      >
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                        >
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteWorkflow(wf.id, wf.name);
                        }}
                        className="opacity-0 group-hover:opacity-100 text-text-tertiary hover:text-danger-500 transition-all p-1.5 rounded-lg hover:bg-danger-50 shrink-0 cursor-pointer"
                      >
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  {/* Step preview */}
                  <div className="flex items-center gap-2 mt-4 overflow-x-auto pb-1">
                    {wf.steps.map((step: any, i: number) => {
                      const cat = team.cats.find(
                        (c) =>
                          c.id === step.agentId ||
                          c.templateId === step.agentId,
                      );
                      return (
                        <React.Fragment key={i}>
                          {i > 0 && (
                            <span className="text-text-tertiary text-xs shrink-0">
                              →
                            </span>
                          )}
                          <div className="flex items-center gap-1.5 bg-surface-secondary border border-border px-2.5 py-1.5 rounded-xl shrink-0">
                            {cat && (
                              <div className="w-5 h-5 rounded-full overflow-hidden border border-border bg-surface flex items-center justify-center">
                                <CatMiniAvatar
                                  colors={cat.catColors}
                                  size={16}
                                />
                              </div>
                            )}
                            <span className="text-xs font-bold text-text-secondary">
                              {step.action?.substring(0, 15) || step.agentId}
                            </span>
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
        {activeTab === "history" &&
          (() => {
            // 只显示持久化工作流的执行记录
            const persistentWfIds = new Set(
              team.workflows.filter((wf) => wf.persistent).map((wf) => wf.id),
            );
            const filteredRuns = workflowRuns.filter(
              (r) => r.workflowId && persistentWfIds.has(r.workflowId),
            );

            // 按日期分组
            const grouped: Record<string, WorkflowRunRecord[]> = {};
            for (const run of filteredRuns) {
              const dateKey = new Date(run.startedAt).toLocaleDateString(
                "zh-CN",
                { year: "numeric", month: "long", day: "numeric" },
              );
              (grouped[dateKey] ||= []).push(run);
            }
            const dateKeys = Object.keys(grouped);

            return (
              <section className="pb-16">
                {filteredRuns.length === 0 ? (
                  <div className="text-center py-20 rounded-[32px] border border-border bg-surface-secondary/50">
                    <h3 className="text-xl font-black text-text-primary mb-2">
                      暂无工作日志
                    </h3>
                    <p className="text-text-secondary font-medium max-w-sm mx-auto">
                      持久化工作流执行后，记录会出现在这里
                    </p>
                  </div>
                ) : (
                  <div className="space-y-8">
                    {dateKeys.map((dateKey) => (
                      <div key={dateKey}>
                        <h3 className="text-sm font-bold text-text-tertiary uppercase tracking-widest mb-4">
                          {dateKey}
                        </h3>
                        <div className="space-y-3">
                          {grouped[dateKey].map((run) => {
                            const wf = team.workflows.find(
                              (w) => w.id === run.workflowId,
                            );
                            const statusConfig: Record<
                              string,
                              {
                                symbol: string;
                                color: string;
                                bg: string;
                                label: string;
                              }
                            > = {
                              success: {
                                symbol: "CheckCircle",
                                color: "text-green-600",
                                bg: "bg-green-50 border-green-200",
                                label: "成功",
                              },
                              failed: {
                                symbol: "XCircle",
                                color: "text-red-600",
                                bg: "bg-red-50 border-red-200",
                                label: "失败",
                              },
                              running: {
                                symbol: "Loader2",
                                color: "text-blue-600",
                                bg: "bg-blue-50 border-blue-200",
                                label: "执行中",
                              },
                              cancelled: {
                                symbol: "Square",
                                color: "text-gray-500",
                                bg: "bg-gray-50 border-gray-200",
                                label: "已取消",
                              },
                            };
                            const sc =
                              statusConfig[run.status] || statusConfig.running;
                            const startTime = new Date(
                              run.startedAt,
                            ).toLocaleTimeString("zh-CN", {
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                            });
                            const steps = Array.isArray(run.steps)
                              ? run.steps
                              : [];

                            return (
                              <div
                                key={run.id}
                                className="bg-surface rounded-[20px] border border-border p-5 hover:shadow-md transition-shadow cursor-pointer"
                                onClick={() => handleViewRunDetail(run)}
                              >
                                <div className="flex items-start justify-between mb-3">
                                  <div className="flex items-center gap-3">
                                    <span className="text-primary-600 inline-flex">
                                      <AppIcon
                                        symbol={wf?.icon || "ClipboardList"}
                                        size={24}
                                      />
                                    </span>
                                    <div>
                                      <h4 className="font-bold text-text-primary">
                                        {run.workflowName}
                                      </h4>
                                      <div className="flex items-center gap-2 mt-1">
                                        <span className="text-xs text-text-tertiary font-medium">
                                          {startTime}
                                        </span>
                                        {run.totalDuration != null && (
                                          <span className="text-xs text-text-tertiary font-medium">
                                            · 耗时 {run.totalDuration}s
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  <span
                                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border ${sc.bg} ${sc.color}`}
                                  >
                                    <span
                                      className={
                                        run.status === "running"
                                          ? "inline-flex animate-spin"
                                          : "inline-flex"
                                      }
                                    >
                                      <AppIcon symbol={sc.symbol} size={12} />
                                    </span>
                                    {sc.label}
                                  </span>
                                </div>

                                {/* 步骤详情 */}
                                {steps.length > 0 && (
                                  <div className="mt-3 space-y-1.5">
                                    {steps.map((step: any, idx: number) => {
                                      const stepCat = wf?.steps[step.index]
                                        ?.agentId
                                        ? team.cats.find(
                                            (c) =>
                                              c.id ===
                                                wf.steps[step.index].agentId ||
                                              c.templateId ===
                                                wf.steps[step.index].agentId,
                                          )
                                        : null;
                                      return (
                                        <div
                                          key={idx}
                                          className="flex items-start gap-2 pl-2 py-1.5 rounded-lg bg-surface-secondary/60"
                                        >
                                          <span className="text-xs mt-0.5 shrink-0 inline-flex text-primary-600">
                                            <AppIcon
                                              symbol={
                                                step.success
                                                  ? "CheckCircle"
                                                  : "XCircle"
                                              }
                                              size={14}
                                            />
                                          </span>
                                          <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-1.5">
                                              {stepCat && (
                                                <div className="w-4 h-4 rounded-full overflow-hidden border border-border bg-surface flex items-center justify-center shrink-0">
                                                  <CatMiniAvatar
                                                    colors={stepCat.catColors}
                                                    size={14}
                                                  />
                                                </div>
                                              )}
                                              <span className="text-xs font-bold text-text-secondary">
                                                {step.action || step.agentId}
                                              </span>
                                            </div>
                                            {step.summary && (
                                              <p className="text-xs text-text-tertiary mt-0.5 line-clamp-2">
                                                {step.summary}
                                              </p>
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
        <div className="w-full mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-1">
          <Link to="/" className="flex items-center gap-2 cursor-pointer">
            <CatLogo size={36} />
          </Link>
          <p className="text-text-tertiary text-xs font-medium">
            &copy; 2026 CuCaTopia.
          </p>
        </div>
      </footer>

      {/* Cat Detail Modal */}
      {selectedCat && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setSelectedCat(null)}
        >
          <div
            className="bg-surface rounded-[28px] shadow-2xl p-8 w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto border border-border"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className="w-24 h-24">
                  <CatSVG
                    colors={selectedCat.catColors}
                    className="w-full h-full"
                  />
                </div>
                <div>
                  <h3 className="text-xl font-black text-text-primary">
                    {selectedCat.name}
                  </h3>
                  <span
                    className="text-sm font-bold"
                    style={{ color: selectedCat.accent }}
                  >
                    {selectedCat.role}
                  </span>
                  {selectedCat.description && (
                    <p className="text-sm text-text-secondary font-medium mt-1">
                      {selectedCat.description}
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={() => setSelectedCat(null)}
                className="text-text-tertiary hover:text-text-secondary transition-colors p-1"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p className="text-xs font-bold text-text-tertiary uppercase tracking-widest mb-3">
              协作方式
            </p>
            <div className="bg-surface-secondary rounded-2xl p-4 border border-border">
              <div className="flex items-center gap-2">
                <span className="text-lg">✨</span>
                <span className="font-bold text-sm text-text-primary">
                  AIGC 统一入口
                </span>
              </div>
              <p className="text-xs text-text-secondary font-medium mt-1.5">
                不再按「技能」罗列；该猫以岗位角色参与工作流，执行统一走
                AIGC（当前占位，后续接入真实生成）。
              </p>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setSelectedCat(null)}
                className="flex-1 py-3.5 text-text-secondary font-bold rounded-2xl border border-border-strong hover:bg-surface-secondary transition-all cursor-pointer"
              >
                关闭
              </button>
              <button
                onClick={() => {
                  setSelectedCat(null);
                  navigate(`/teams/${teamId}/cats/${selectedCat.id}`);
                }}
                className="flex-1 py-3.5 bg-text-primary text-text-inverse font-bold rounded-2xl hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
              >
                编辑猫猫
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 工作流执行弹窗（预览确认 / 实时执行 / 查看历史） */}
      {executingWorkflow &&
        (() => {
          const isViewingHistory = !!viewingRun;
          const closeHandler = isViewingHistory
            ? handleCloseRunDetail
            : handleCloseExecution;
          const statusConfig: Record<
            string,
            { symbol: string; label: string; color: string }
          > = {
            success: {
              symbol: "CheckCircle",
              label: "执行成功",
              color: "text-green-600",
            },
            failed: {
              symbol: "XCircle",
              label: "执行失败",
              color: "text-red-600",
            },
            cancelled: {
              symbol: "Square",
              label: "已取消",
              color: "text-gray-500",
            },
            running: {
              symbol: "Loader2",
              label: "执行中",
              color: "text-blue-600",
            },
          };
          const runStatus = isViewingHistory
            ? statusConfig[viewingRun!.status] || statusConfig.running
            : null;

          return (
            <div
              className={`workflow-overlay ${executingWorkflow ? "visible" : ""}`}
            >
              <div className="overlay-backdrop" onClick={closeHandler} />
              <div className="execution-stage">
                <div className="stage-header">
                  <div className="stage-title">
                    <span className="stage-name inline-flex items-center gap-2">
                      <AppIcon
                        symbol={executingWorkflow.icon}
                        size={18}
                        className="text-primary-600"
                      />
                      {executingWorkflow.name}
                    </span>
                    {isPreparing && (
                      <span className="ml-3 inline-flex items-center gap-1 text-xs font-bold text-amber-600">
                        <AppIcon symbol="ClipboardList" size={14} />
                        确认参数
                      </span>
                    )}
                    {isViewingHistory && (
                      <span
                        className={`ml-3 inline-flex items-center gap-1 text-xs font-bold ${runStatus!.color}`}
                      >
                        <span
                          className={
                            viewingRun!.status === "running"
                              ? "inline-flex animate-spin"
                              : "inline-flex"
                          }
                        >
                          <AppIcon symbol={runStatus!.symbol} size={14} />
                        </span>
                        {runStatus!.label}
                      </span>
                    )}
                  </div>
                  <button className="stage-close" onClick={closeHandler}>
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* ── 预览确认阶段：竖向显示步骤和可编辑参数 ── */}
                {isPreparing ? (
                  <div
                    className="stage-body"
                    style={{
                      flexDirection: "column",
                      alignItems: "stretch",
                      padding: "24px 32px",
                      paddingTop: "24px",
                      overflowY: "auto",
                      overflowX: "hidden",
                    }}
                  >
                    <p
                      style={{
                        fontSize: "0.82rem",
                        color: "#8D6E63",
                        fontWeight: 600,
                        marginBottom: 16,
                      }}
                    >
                      请确认以下步骤及参数，编辑完成后点击底部「开始执行」按钮。
                    </p>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 0,
                      }}
                    >
                      {executingWorkflow.steps.map((step: any, i: number) => {
                        const cat = team.cats.find(
                          (c) =>
                            c.id === step.agentId ||
                            c.templateId === step.agentId,
                        );
                        const skill = cat?.skills?.find(
                          (s: any) => s.id === step.agentId,
                        );
                        const paramDefs = step.params || skill?.paramDefs || [];
                        const editedValues = editableStepParams.get(i) || {};

                        return (
                          <React.Fragment key={i}>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "flex-start",
                                gap: 14,
                                padding: "16px 18px",
                                borderRadius: 16,
                                border: "1.5px solid #F0EBE6",
                                background: "#FFFCF9",
                              }}
                            >
                              {/* 序号 */}
                              <div
                                style={{
                                  width: 28,
                                  height: 28,
                                  borderRadius: "50%",
                                  flexShrink: 0,
                                  background: cat?.accent || "#FFB74D",
                                  color: "#fff",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontSize: "0.75rem",
                                  fontWeight: 800,
                                  marginTop: 2,
                                }}
                              >
                                {i + 1}
                              </div>

                              <div style={{ flex: 1, minWidth: 0 }}>
                                {/* 步骤基本信息 */}
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    marginBottom: paramDefs.length > 0 ? 10 : 0,
                                  }}
                                >
                                  {cat && (
                                    <div
                                      style={{
                                        width: 28,
                                        height: 28,
                                        borderRadius: "50%",
                                        overflow: "hidden",
                                        border: "1px solid #E0D6CC",
                                        flexShrink: 0,
                                      }}
                                    >
                                      <CatMiniAvatar
                                        colors={cat.catColors}
                                        size={26}
                                      />
                                    </div>
                                  )}
                                  <span
                                    style={{
                                      fontWeight: 800,
                                      fontSize: "0.88rem",
                                      color: cat?.accent || "#5D4037",
                                    }}
                                  >
                                    {cat?.name ?? step.agentId}
                                  </span>
                                  {skill && (
                                    <span
                                      style={{
                                        fontSize: "0.7rem",
                                        fontWeight: 600,
                                        color: "#8D6E63",
                                        background: "#F5F0EB",
                                        padding: "2px 8px",
                                        borderRadius: 6,
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: 4,
                                      }}
                                    >
                                      <AppIcon symbol={skill.icon} size={12} />
                                      {skill.name}
                                    </span>
                                  )}
                                  {step.action && (
                                    <span
                                      style={{
                                        fontSize: "0.72rem",
                                        color: "#BCAAA4",
                                        fontWeight: 500,
                                        marginLeft: "auto",
                                        maxWidth: 200,
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      {step.action}
                                    </span>
                                  )}
                                </div>

                                {/* 参数编辑区 */}
                                {paramDefs.length > 0 && (
                                  <div
                                    style={{
                                      display: "flex",
                                      flexDirection: "column",
                                      gap: 8,
                                      paddingLeft: 0,
                                    }}
                                  >
                                    {paramDefs.map((param: any) => {
                                      const val = editedValues[param.key];
                                      return (
                                        <div
                                          key={param.key}
                                          style={{
                                            display: "flex",
                                            flexDirection: "column",
                                            gap: 3,
                                          }}
                                        >
                                          <label
                                            style={{
                                              fontSize: "0.7rem",
                                              fontWeight: 700,
                                              color: "#8D6E63",
                                              display: "flex",
                                              alignItems: "center",
                                              gap: 4,
                                            }}
                                          >
                                            {param.label}
                                            {param.required && (
                                              <span
                                                style={{
                                                  color: "#EF5350",
                                                  fontSize: "0.65rem",
                                                }}
                                              >
                                                *
                                              </span>
                                            )}
                                            {param.description && (
                                              <span
                                                style={{
                                                  fontWeight: 400,
                                                  color: "#BCAAA4",
                                                  fontSize: "0.62rem",
                                                  marginLeft: 4,
                                                }}
                                              >
                                                {param.description}
                                              </span>
                                            )}
                                          </label>

                                          {/* text / url 类型 */}
                                          {(param.type === "text" ||
                                            param.type === "url") && (
                                            <input
                                              type={
                                                param.type === "url"
                                                  ? "url"
                                                  : "text"
                                              }
                                              value={String(val ?? "")}
                                              placeholder={
                                                param.placeholder || ""
                                              }
                                              onChange={(e) =>
                                                handleStepParamChange(
                                                  i,
                                                  param.key,
                                                  e.target.value,
                                                )
                                              }
                                              style={{
                                                padding: "7px 11px",
                                                border: "1.5px solid #E0D6CC",
                                                borderRadius: 10,
                                                fontSize: "0.8rem",
                                                fontWeight: 500,
                                                color: "#5D4037",
                                                background: "#fff",
                                                outline: "none",
                                                fontFamily: "inherit",
                                                transition: "border-color 0.2s",
                                              }}
                                              onFocus={(e) =>
                                                (e.target.style.borderColor =
                                                  "#FFB74D")
                                              }
                                              onBlur={(e) =>
                                                (e.target.style.borderColor =
                                                  "#E0D6CC")
                                              }
                                            />
                                          )}

                                          {/* textarea 类型 */}
                                          {param.type === "textarea" && (
                                            <textarea
                                              value={String(val ?? "")}
                                              placeholder={
                                                param.placeholder || ""
                                              }
                                              rows={3}
                                              onChange={(e) =>
                                                handleStepParamChange(
                                                  i,
                                                  param.key,
                                                  e.target.value,
                                                )
                                              }
                                              style={{
                                                padding: "7px 11px",
                                                border: "1.5px solid #E0D6CC",
                                                borderRadius: 10,
                                                fontSize: "0.8rem",
                                                fontWeight: 500,
                                                color: "#5D4037",
                                                background: "#fff",
                                                outline: "none",
                                                fontFamily: "inherit",
                                                resize: "vertical",
                                                minHeight: 44,
                                                transition: "border-color 0.2s",
                                              }}
                                              onFocus={(e) =>
                                                (e.target.style.borderColor =
                                                  "#FFB74D")
                                              }
                                              onBlur={(e) =>
                                                (e.target.style.borderColor =
                                                  "#E0D6CC")
                                              }
                                            />
                                          )}

                                          {/* number 类型 */}
                                          {param.type === "number" && (
                                            <input
                                              type="number"
                                              value={
                                                val !== undefined && val !== ""
                                                  ? String(val)
                                                  : ""
                                              }
                                              placeholder={
                                                param.placeholder || ""
                                              }
                                              onChange={(e) =>
                                                handleStepParamChange(
                                                  i,
                                                  param.key,
                                                  e.target.value
                                                    ? Number(e.target.value)
                                                    : "",
                                                )
                                              }
                                              style={{
                                                padding: "7px 11px",
                                                border: "1.5px solid #E0D6CC",
                                                borderRadius: 10,
                                                fontSize: "0.8rem",
                                                fontWeight: 500,
                                                color: "#5D4037",
                                                background: "#fff",
                                                outline: "none",
                                                fontFamily: "inherit",
                                                width: 140,
                                                transition: "border-color 0.2s",
                                              }}
                                              onFocus={(e) =>
                                                (e.target.style.borderColor =
                                                  "#FFB74D")
                                              }
                                              onBlur={(e) =>
                                                (e.target.style.borderColor =
                                                  "#E0D6CC")
                                              }
                                            />
                                          )}

                                          {/* select 类型 */}
                                          {param.type === "select" && (
                                            <select
                                              value={String(val ?? "")}
                                              onChange={(e) =>
                                                handleStepParamChange(
                                                  i,
                                                  param.key,
                                                  e.target.value,
                                                )
                                              }
                                              style={{
                                                padding: "7px 11px",
                                                border: "1.5px solid #E0D6CC",
                                                borderRadius: 10,
                                                fontSize: "0.8rem",
                                                fontWeight: 500,
                                                color: "#5D4037",
                                                background: "#fff",
                                                outline: "none",
                                                fontFamily: "inherit",
                                                cursor: "pointer",
                                                transition: "border-color 0.2s",
                                              }}
                                              onFocus={(e) =>
                                                (e.target.style.borderColor =
                                                  "#FFB74D")
                                              }
                                              onBlur={(e) =>
                                                (e.target.style.borderColor =
                                                  "#E0D6CC")
                                              }
                                            >
                                              <option value="">
                                                请选择...
                                              </option>
                                              {(param.options || []).map(
                                                (opt: any) => (
                                                  <option
                                                    key={opt.value}
                                                    value={opt.value}
                                                  >
                                                    {opt.label}
                                                  </option>
                                                ),
                                              )}
                                            </select>
                                          )}

                                          {/* toggle 类型 */}
                                          {param.type === "toggle" && (
                                            <label
                                              style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 8,
                                                cursor: "pointer",
                                                fontSize: "0.78rem",
                                                fontWeight: 600,
                                                color: "#5D4037",
                                              }}
                                            >
                                              <div
                                                onClick={() =>
                                                  handleStepParamChange(
                                                    i,
                                                    param.key,
                                                    !val,
                                                  )
                                                }
                                                style={{
                                                  position: "relative",
                                                  width: 36,
                                                  height: 20,
                                                  borderRadius: 10,
                                                  background: val
                                                    ? "#81C784"
                                                    : "#D0D0D0",
                                                  cursor: "pointer",
                                                  transition:
                                                    "background 0.25s",
                                                }}
                                              >
                                                <div
                                                  style={{
                                                    position: "absolute",
                                                    top: 2,
                                                    left: val ? 18 : 2,
                                                    width: 16,
                                                    height: 16,
                                                    borderRadius: "50%",
                                                    background: "#fff",
                                                    boxShadow:
                                                      "0 1px 3px rgba(0,0,0,0.15)",
                                                    transition: "left 0.25s",
                                                  }}
                                                />
                                              </div>
                                              <span>
                                                {val ? "开启" : "关闭"}
                                              </span>
                                            </label>
                                          )}

                                          {/* tags 类型 */}
                                          {param.type === "tags" &&
                                            (() => {
                                              const tags = Array.isArray(val)
                                                ? (val as string[])
                                                : [];
                                              return (
                                                <div>
                                                  <div
                                                    style={{
                                                      display: "flex",
                                                      flexWrap: "wrap",
                                                      gap: 4,
                                                      marginBottom:
                                                        tags.length > 0 ? 6 : 0,
                                                    }}
                                                  >
                                                    {tags.map((tag, ti) => (
                                                      <span
                                                        key={ti}
                                                        style={{
                                                          display:
                                                            "inline-flex",
                                                          alignItems: "center",
                                                          gap: 3,
                                                          fontSize: "0.72rem",
                                                          fontWeight: 600,
                                                          color: "#5D4037",
                                                          background: "#F5F0EB",
                                                          padding: "2px 8px",
                                                          borderRadius: 6,
                                                        }}
                                                      >
                                                        {tag}
                                                        <span
                                                          style={{
                                                            cursor: "pointer",
                                                            color: "#BCAAA4",
                                                            fontSize: "0.8rem",
                                                            lineHeight: 1,
                                                          }}
                                                          onClick={() => {
                                                            const next = [
                                                              ...tags,
                                                            ];
                                                            next.splice(ti, 1);
                                                            handleStepParamChange(
                                                              i,
                                                              param.key,
                                                              next,
                                                            );
                                                          }}
                                                        >
                                                          ×
                                                        </span>
                                                      </span>
                                                    ))}
                                                  </div>
                                                  <input
                                                    type="text"
                                                    placeholder={
                                                      param.placeholder ||
                                                      "输入后回车添加"
                                                    }
                                                    onKeyDown={(e) => {
                                                      if (e.key === "Enter") {
                                                        e.preventDefault();
                                                        const v = (
                                                          e.target as HTMLInputElement
                                                        ).value.trim();
                                                        if (v) {
                                                          handleStepParamChange(
                                                            i,
                                                            param.key,
                                                            [...tags, v],
                                                          );
                                                          (
                                                            e.target as HTMLInputElement
                                                          ).value = "";
                                                        }
                                                      }
                                                    }}
                                                    style={{
                                                      padding: "6px 11px",
                                                      border:
                                                        "1.5px solid #E0D6CC",
                                                      borderRadius: 10,
                                                      fontSize: "0.78rem",
                                                      fontWeight: 500,
                                                      color: "#5D4037",
                                                      background: "#fff",
                                                      outline: "none",
                                                      fontFamily: "inherit",
                                                      width: "100%",
                                                      transition:
                                                        "border-color 0.2s",
                                                    }}
                                                    onFocus={(e) =>
                                                      (e.target.style.borderColor =
                                                        "#FFB74D")
                                                    }
                                                    onBlur={(e) =>
                                                      (e.target.style.borderColor =
                                                        "#E0D6CC")
                                                    }
                                                  />
                                                </div>
                                              );
                                            })()}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}

                                {/* 无参数时的提示 */}
                                {paramDefs.length === 0 && (
                                  <span
                                    style={{
                                      fontSize: "0.72rem",
                                      color: "#BCAAA4",
                                      fontStyle: "italic",
                                    }}
                                  >
                                    无需配置参数
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* 步骤之间的连接箭头 */}
                            {i < executingWorkflow.steps.length - 1 && (
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "center",
                                  padding: "4px 0",
                                }}
                              >
                                <svg
                                  width="16"
                                  height="20"
                                  viewBox="0 0 16 20"
                                  fill="none"
                                >
                                  <path
                                    d="M8 0 L8 14 M3 10 L8 16 L13 10"
                                    stroke="#E0D6CC"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                </svg>
                              </div>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  /* ── 执行态 / 历史查看态（DAG 分层布局） ── */
                  <div className="stage-body">
                    <div className="pipeline">
                      {(() => {
                        // 计算 DAG 层级（执行态用已有 dagLayers，历史查看态需临时计算）
                        const steps = executingWorkflow.steps as WorkflowStep[];
                        let layers: number[][];
                        if (dagLayers.length > 0) {
                          layers = dagLayers;
                        } else {
                          // 历史查看态：临时计算层级
                          const pIdx: number[] = [];
                          for (let i = 0; i < steps.length; i++) {
                            pIdx.push(
                              resolveInputFromIndex(
                                steps,
                                i,
                                steps[i].inputFrom,
                              ),
                            );
                          }
                          const dep: number[] = new Array(steps.length).fill(0);
                          for (let i = 0; i < steps.length; i++) {
                            dep[i] = pIdx[i] >= 0 ? dep[pIdx[i]] + 1 : 1;
                          }
                          const mxDep = Math.max(...dep, 0);
                          layers = [];
                          for (let d = 0; d <= mxDep; d++) layers.push([]);
                          for (let i = 0; i < steps.length; i++)
                            layers[dep[i]].push(i);
                        }

                        // 过滤空层
                        const nonEmptyLayers = layers.filter(
                          (l) => l.length > 0,
                        );

                        return nonEmptyLayers.map((layer, layerIdx) => (
                          <React.Fragment key={`layer-${layerIdx}`}>
                            {/* 层间箭头（非首层） */}
                            {layerIdx > 0 && (
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "center",
                                  padding: "2px 0",
                                }}
                              >
                                <div
                                  className={`pipeline-arrow ${layer.every((i) => completedSteps.includes(i)) || nonEmptyLayers[layerIdx - 1].every((i) => completedSteps.includes(i)) ? "done" : ""}`}
                                >
                                  <div className="arrow-line" />
                                  <div className="arrow-head">
                                    <svg
                                      width="12"
                                      height="12"
                                      viewBox="0 0 24 24"
                                      fill="currentColor"
                                    >
                                      <path d="M8 5v14l11-7z" />
                                    </svg>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* 本层步骤：单步居中，多步水平并排 */}
                            <div
                              style={{
                                display: "flex",
                                gap: 12,
                                justifyContent: "center",
                                alignItems: "flex-start",
                                flexWrap: "wrap",
                              }}
                            >
                              {layer.map((i) => {
                                const step = steps[i];
                                const cat = team.cats.find(
                                  (c) =>
                                    c.id === step.agentId ||
                                    c.templateId === step.agentId,
                                );
                                const skill = cat?.skills?.find(
                                  (s: any) => s.id === step.agentId,
                                );
                                const isCompleted = completedSteps.includes(i);
                                const isCurrent = runningStepIndices.has(i);
                                const isPending = !isCompleted && !isCurrent;
                                const statusClass = isCompleted
                                  ? "done"
                                  : isCurrent
                                    ? "active"
                                    : "waiting";
                                const result = stepResults.get(i);
                                const resultStatus =
                                  result?.status ?? "success";
                                const timing = stepTimings.get(i);
                                const stepDurationSec =
                                  timing?.duration != null
                                    ? (timing.duration / 1000).toFixed(1)
                                    : null;

                                return (
                                  <div
                                    key={i}
                                    className={`pipeline-node ${statusClass}`}
                                    style={
                                      layer.length > 1
                                        ? {
                                            flex: "1 1 0",
                                            minWidth: 0,
                                            maxWidth: 280,
                                          }
                                        : undefined
                                    }
                                  >
                                    {isCurrent && (
                                      <div className="cat-bubble show">
                                        <span className="bubble-text">
                                          {currentDialog}
                                        </span>
                                      </div>
                                    )}

                                    <div
                                      className={`cat-avatar ${isCurrent ? "working" : ""}`}
                                    >
                                      {cat && (
                                        <CatSVG
                                          colors={cat.catColors}
                                          className="pipeline-cat"
                                        />
                                      )}
                                    </div>

                                    <div className="node-info">
                                      <span
                                        className="node-name"
                                        style={{ color: cat?.accent }}
                                      >
                                        {cat?.name ?? step.agentId}
                                      </span>
                                      {skill && (
                                        <span className="node-skill inline-flex items-center gap-1">
                                          <AppIcon
                                            symbol={skill.icon}
                                            size={12}
                                          />
                                          {skill.name}
                                        </span>
                                      )}
                                      {!skill && step.action && (
                                        <span className="node-skill">
                                          {step.action}
                                        </span>
                                      )}
                                      {((step as any).description ||
                                        (step as any).prompt) && (
                                        <span className="max-w-25 truncate text-xs text-tertiary">
                                          {(step as any).description ||
                                            (step as any).prompt}
                                        </span>
                                      )}
                                    </div>

                                    {isCurrent && (
                                      <div className="node-progress">
                                        <div
                                          className="node-progress-bar"
                                          style={{
                                            animationDuration: `${STEP_DURATION}ms`,
                                          }}
                                        />
                                      </div>
                                    )}
                                    {stepDurationSec && (
                                      <span
                                        style={{
                                          fontSize: "0.7rem",
                                          color: "var(--text-tertiary)",
                                          fontVariantNumeric: "tabular-nums",
                                        }}
                                      >
                                        ⏱ {stepDurationSec}s
                                      </span>
                                    )}

                                    {isCompleted && result && (
                                      <div
                                        className={`node-result status-${resultStatus}`}
                                      >
                                        <div className="node-result-header inline-flex items-center gap-1">
                                          {resultStatus === "success" && (
                                            <AppIcon
                                              symbol="CheckCircle"
                                              size={14}
                                            />
                                          )}
                                          {resultStatus === "warning" && (
                                            <AppIcon
                                              symbol="AlertTriangle"
                                              size={14}
                                            />
                                          )}
                                          {resultStatus === "error" && (
                                            <AppIcon
                                              symbol="XCircle"
                                              size={14}
                                            />
                                          )}
                                          <span className="node-result-status">
                                            {resultStatus === "success"
                                              ? "完成"
                                              : resultStatus === "warning"
                                                ? "警告"
                                                : "失败"}
                                          </span>
                                        </div>
                                        {result.summary && (
                                          <div className="node-result-summary markdown-body">
                                            <ReactMarkdown
                                              remarkPlugins={[remarkGfm]}
                                            >
                                              {result.summary}
                                            </ReactMarkdown>
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    {!isCompleted && skill && (
                                      <div className="node-io">
                                        <span className="io-tag io-in">
                                          {skill.input}
                                        </span>
                                        <span className="io-arrow">→</span>
                                        <span className="io-tag io-out">
                                          {skill.output}
                                        </span>
                                      </div>
                                    )}

                                    {isPending && <div className="node-dim" />}
                                  </div>
                                );
                              })}
                            </div>
                          </React.Fragment>
                        ));
                      })()}
                    </div>
                  </div>
                )}

                <div className="stage-footer">
                  {isPreparing ? (
                    /* ── 预览确认态底部 ── */
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        width: "100%",
                        justifyContent: "center",
                      }}
                    >
                      <button
                        onClick={closeHandler}
                        style={{
                          padding: "10px 24px",
                          border: "1.5px solid #DADADA",
                          borderRadius: 12,
                          background: "#fff",
                          color: "#8D6E63",
                          fontSize: "0.85rem",
                          fontWeight: 600,
                          cursor: "pointer",
                          transition: "all 0.2s",
                          fontFamily: "inherit",
                        }}
                        onMouseOver={(e) => {
                          (e.target as HTMLElement).style.borderColor =
                            "#BCAAA4";
                          (e.target as HTMLElement).style.background =
                            "#F5F0EB";
                        }}
                        onMouseOut={(e) => {
                          (e.target as HTMLElement).style.borderColor =
                            "#DADADA";
                          (e.target as HTMLElement).style.background = "#fff";
                        }}
                      >
                        取消
                      </button>
                      <button
                        onClick={handleConfirmRun}
                        style={{
                          padding: "10px 32px",
                          border: "none",
                          borderRadius: 12,
                          background: "#FFB74D",
                          color: "#fff",
                          fontSize: "0.85rem",
                          fontWeight: 700,
                          cursor: "pointer",
                          transition: "all 0.2s",
                          fontFamily: "inherit",
                          boxShadow: "0 3px 10px rgba(255, 183, 77, 0.3)",
                        }}
                        onMouseOver={(e) => {
                          (e.target as HTMLElement).style.background =
                            "#FFA726";
                          (e.target as HTMLElement).style.transform =
                            "translateY(-1px)";
                        }}
                        onMouseOut={(e) => {
                          (e.target as HTMLElement).style.background =
                            "#FFB74D";
                          (e.target as HTMLElement).style.transform =
                            "translateY(0)";
                        }}
                      >
                        ▶ 开始执行
                      </button>
                    </div>
                  ) : isViewingHistory ? (
                    <div className="exec-done">
                      <span
                        className="done-text"
                        style={{
                          fontSize: "0.8rem",
                          color: "var(--text-secondary)",
                        }}
                      >
                        {new Date(viewingRun!.startedAt).toLocaleString(
                          "zh-CN",
                        )}
                        {viewingRun!.totalDuration != null &&
                          ` · 耗时 ${viewingRun!.totalDuration}s`}
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
                            <span />
                            <span />
                            <span />
                          </div>
                          <span className="exec-label">
                            {completedSteps.length + runningStepIndices.size} /{" "}
                            {executingWorkflow.steps.length} 执行中
                            {runningStepIndices.size > 1
                              ? `（${runningStepIndices.size} 个并行）`
                              : "..."}
                          </span>
                          {totalElapsed > 0 && (
                            <span
                              style={{
                                marginLeft: "auto",
                                fontSize: "0.75rem",
                                color: "var(--text-tertiary)",
                                fontVariantNumeric: "tabular-nums",
                              }}
                            >
                              ⏱ {totalElapsed}s
                            </span>
                          )}
                        </div>
                      )}
                      {allDone && (
                        <div className="exec-done">
                          <span className="done-icon inline-flex text-primary-600">
                            <AppIcon symbol="PartyPopper" size={22} />
                          </span>
                          <span className="done-text">全部完成！</span>
                          <span
                            style={{
                              fontSize: "0.75rem",
                              color: "var(--text-tertiary)",
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            耗时 {totalElapsed}s
                          </span>
                          <button
                            className="replay-btn"
                            onClick={() =>
                              handleRunWorkflow(executingWorkflow.id)
                            }
                          >
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

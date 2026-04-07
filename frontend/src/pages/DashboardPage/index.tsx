import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { apiClient } from "../../utils/apiClient";
import CatLogo from "../../components/CatLogo";
import Navbar from "../../components/Navbar";
import UserProfileDropdown from "./UserProfileDropdown";
import { AppIcon } from "../../components/icons";
import { X } from "lucide-react";
import type {
  WorkflowRow,
  WorkbenchPayload,
  WorkflowRun,
  WorkflowRunStep,
} from "./workbenchTypes";
import {
  featureBlurb,
  featureLabel,
  isOfficialWorkflow,
  mergeQuietWorkbenchRefresh,
  parseSteps,
} from "./workbenchUtils";
import ResultCanvas from "./ResultCanvas";
import {
  normalizeRunSteps,
  RunExecutionProcessDetails,
  sortedRunSteps,
} from "./RunExecutionProcess";

/** 未选中能力时的引导说明（选中后切换为当前能力的 description） */
const HERO_DESCRIPTION_DEFAULT = (
  <>点选能力卡片后，输入框前会出现当前模式标签；提交后由猫猫接力完成。</>
);

/** 分栏：左侧占比下限；上限 2/5（40%） */
const SPLIT_LEFT_MIN_PCT = 22;
const SPLIT_LEFT_MAX_PCT = 40;
const SPLIT_LEFT_DEFAULT_PCT = 32;

function useMinWidthLg() {
  const q = "(min-width: 1024px)";
  const [ok, setOk] = useState(
    () => typeof window !== "undefined" && window.matchMedia(q).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(q);
    const fn = () => setOk(mq.matches);
    fn();
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);
  return ok;
}

/** 顶栏 Logo 右侧：聊天气泡式问候 */
function GreetingBubble({ nickname }: { nickname?: string | null }) {
  const hour = new Date().getHours();
  let line = "夜深了，有我们呢";
  if (hour >= 6 && hour < 9) line = "早上好呀";
  else if (hour >= 9 && hour < 12) line = "上午好呀";
  else if (hour >= 12 && hour < 14) line = "中午好呀";
  else if (hour >= 14 && hour < 18) line = "下午好呀";
  else if (hour >= 18 && hour < 24) line = "晚上好呀";

  const who = nickname?.trim() || "创作者";
  return (
    <div className="relative max-w-[min(11rem,46vw)] sm:max-w-[min(16rem,40vw)] shrink min-w-0">
      <div
        className="relative rounded-2xl rounded-tl-md border border-primary-200/70 bg-primary-50/90 text-text-primary px-3 py-2 backdrop-blur-sm"
        aria-live="polite"
      >
        <p className="text-[13px] font-semibold leading-snug">
          喵～ <span className="text-primary-700">{who}</span>，{line}！
        </p>
        <span
          className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-[5px] w-2.5 h-2.5 rotate-45 border-l border-b border-primary-200/70 bg-primary-50/90"
          aria-hidden
        />
      </div>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  blurb,
  selected,
  onSelect,
  splitMode
}: {
  icon: string;
  title: string;
  blurb: string;
  selected: boolean;
  onSelect: () => void;
  splitMode?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`shrink-0 flex flex-col gap-1 text-left border transition-all cursor-pointer ${
        selected
          ? "border-primary-400 bg-primary-50/50"
          : "border-border bg-surface hover:border-border-strong"
      } ${splitMode ? "min-w-[6.75rem] sm:min-w-[7.5rem] max-w-[9.5rem] rounded-lg px-2 py-1" : "rounded-2xl px-3 py-2.5"}`}
    >
      <div className="flex items-center gap-1 w-full">
        <span className="text-primary-600">
          <AppIcon symbol={icon} size={18} strokeWidth={2} />
        </span>
        <span className="text-sm sm:text-xs font-black text-text-primary leading-tight">
          {title}
        </span>
      </div>
      {!splitMode&&<span className="text-[10px] text-text-tertiary font-medium mt-1 line-clamp-2 leading-snug">
        {blurb}
      </span>}
    </button>
  );
}

/**
 * 创作主页交互要点：
 * - splitMode：是否进入左（输入+历史）右（ResultCanvas）分栏；首次「开始创作」、点「历史记录」或带 ?runId= 进入时为 true。
 * - historyRunId：用户从左侧点的某条 run；存在时右侧固定展示该条（历史查看态）。再次「开始创作」会清空，回到「本轮执行态」。
 * - rightPaneHistoryBrowse：由「历史记录」进入分栏且未点选左侧条目时为 true，右侧不自动挂靠某条 run（默认不选中高亮）。
 * - sessionStartedAtRef + sessionEpoch：最近一次点击「开始创作」的时间；在无 historyRunId 且非 browse 且 splitMode 下，用 startedAt 落在该时间附近匹配「刚跑的那条」run。
 */
const DashboardPage: React.FC = () => {
  const { user, logout } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialRunId = searchParams.get("runId");
  const [workbench, setWorkbench] = useState<WorkbenchPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [userInput, setUserInput] = useState("");
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(
    null,
  );
  /** 提交 API 中（尚未返回）→ 显示"正在提交任务…" */
  const [isSubmitting, setIsSubmitting] = useState(false);
  /** 提交后轮询执行进度中 → 显示流水线动画 */
  const [pollingWfId, setPollingWfId] = useState<string | null>(null);
  /** SSE 流式执行态：实时 steps */
  const [streamingRunId, setStreamingRunId] = useState<string | null>(null);
  const [streamingStatus, setStreamingStatus] = useState<string | null>(null);
  const [streamingSteps, setStreamingSteps] = useState<WorkflowRunStep[]>([]);
  const streamingAbortRef = useRef<AbortController | null>(null);
  /** 点击「开始创作」后进入左右分栏：左工作台、右画布 */
  const [splitMode, setSplitMode] = useState(false);
  /** lg+ 分栏时左侧宽度占主区域比例（%），最大 40% */
  const [splitLeftPct, setSplitLeftPct] = useState(SPLIT_LEFT_DEFAULT_PCT);
  /** 与 sessionStartedAtRef 联动递增，触发 displayRun 对「本轮」run 的重新计算 */
  const [sessionEpoch, setSessionEpoch] = useState(0);
  /** 左侧列表点选的 run；URL ?runId= 初始化时也会写入 */
  const [historyRunId, setHistoryRunId] = useState<string | null>(initialRunId);
  /** 最近一次「开始创作」点击时间戳；用于在无 historyRunId 时从同能力 runs 中框定本轮新记录 */
  const sessionStartedAtRef = useRef(0);
  /** 多次快速「开始创作」时让旧轮询提前结束，避免互抢状态 */
  const executeGenerationRef = useRef(0);
  /** true：仅从「历史记录」进入分栏、尚未点选左侧任务，右侧画布不自动展示某条 run */
  const [rightPaneHistoryBrowse, setRightPaneHistoryBrowse] = useState(false);
  /** 历史卡片删除：二次确认中的 runId */
  const [confirmDeleteRunId, setConfirmDeleteRunId] = useState<string | null>(
    null,
  );
  /** 历史卡片删除：请求中 */
  const [deletingRunId, setDeletingRunId] = useState<string | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);
  const splitDragActiveRef = useRef(false);
  const isLg = useMinWidthLg();

  /** 仅官方种子工作流，供能力卡片展示（不含团队自建流程） */
  const officialWorkflows = useMemo(
    () => (workbench?.workflows ?? []).filter(isOfficialWorkflow),
    [workbench],
  );

  const selectedFeature = useMemo((): WorkflowRow | null => {
    if (!selectedWorkflowId) return null;
    return officialWorkflows.find((w) => w.id === selectedWorkflowId) ?? null;
  }, [officialWorkflows, selectedWorkflowId]);

  const heroDescription = useMemo(() => {
    if (!selectedFeature) return null;
    const full = selectedFeature.description?.trim();
    if (full) return full;
    return featureBlurb(selectedFeature);
  }, [selectedFeature]);

  const totalAiCalls = useMemo(
    () => (workbench?.aiStats ?? []).reduce((s, r) => s + r.count, 0),
    [workbench],
  );

  /** 画布执行可视化：当前工作流的步骤定义（含 agentId → 团队猫） */
  const planSteps = useMemo(() => {
    const wf =
      selectedFeature ??
      workbench?.workflows.find((w) => w.id === selectedWorkflowId);
    return parseSteps(wf?.steps);
  }, [selectedFeature, selectedWorkflowId, workbench?.workflows]);

  const catNameById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of workbench?.cats ?? []) {
      m[c.id] = c.name;
    }
    return m;
  }, [workbench?.cats]);

  const loadWorkbench = useCallback(
    async (opts?: { quiet?: boolean }): Promise<WorkbenchPayload | null> => {
      const quiet = opts?.quiet ?? false;
      if (!quiet) setLoading(true);
      try {
        const wb = await apiClient.get<WorkbenchPayload>(
          "/api/teams/workbench",
        );
        setWorkbench((prev) =>
          quiet ? mergeQuietWorkbenchRefresh(prev, wb) : wb,
        );
        const officials = (wb.workflows ?? []).filter(isOfficialWorkflow);
        setSelectedWorkflowId((prev) =>
          prev && officials.some((w) => w.id === prev)
            ? prev
            : (officials[0]?.id ?? null),
        );
        return wb;
      } catch (e) {
        console.error(e);
        return null;
      } finally {
        if (!quiet) setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    loadWorkbench();
  }, [loadWorkbench]);

  // 须先于「能力不一致则清 history」：否则 ?runId= 首屏会因 selectedWorkflowId 尚未对齐而误清 historyRunId
  useEffect(() => {
    if (!historyRunId || !workbench?.runs?.length) return;
    const targetRun = workbench.runs.find((r) => r.id === historyRunId);
    if (!targetRun) return;
    if (targetRun.workflowId) {
      setSelectedWorkflowId(targetRun.workflowId);
    }
    setRightPaneHistoryBrowse(false);
    setSplitMode(true);
    if (searchParams.get("runId")) {
      setSearchParams({}, { replace: true });
    }
  }, [historyRunId, workbench, setSearchParams, searchParams]);

  /** 用户改选能力卡片时，若当前 history 指向另一工作流的 run，则退出历史查看态 */
  useEffect(() => {
    if (!historyRunId || !workbench?.runs?.length || !selectedWorkflowId) return;
    const r = workbench.runs.find((x) => x.id === historyRunId);
    if (r && r.workflowId !== selectedWorkflowId) {
      setHistoryRunId(null);
    }
  }, [selectedWorkflowId, historyRunId, workbench?.runs]);

  useEffect(() => {
    if (!splitMode) return;

    const clampPct = (pct: number) =>
      Math.min(SPLIT_LEFT_MAX_PCT, Math.max(SPLIT_LEFT_MIN_PCT, pct));

    const onMove = (e: PointerEvent) => {
      if (!splitDragActiveRef.current || !mainRef.current) return;
      const rect = mainRef.current.getBoundingClientRect();
      const raw = ((e.clientX - rect.left) / rect.width) * 100;
      setSplitLeftPct(clampPct(raw));
    };

    const endDrag = () => {
      splitDragActiveRef.current = false;
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
      endDrag();
    };
  }, [splitMode]);

  /** 右侧画布展示的 run：优先 historyRunId；否则为当前能力下、与本轮 session 时间对齐的最新一条 */
  const displayRun: WorkflowRun | null = useMemo(() => {
    if (!workbench?.runs?.length) return null;
    if (historyRunId) {
      return workbench.runs.find((r) => r.id === historyRunId) ?? null;
    }
    if (rightPaneHistoryBrowse) return null;
    if (!selectedWorkflowId) return null;
    const list = workbench.runs.filter(
      (r) => r.workflowId === selectedWorkflowId,
    );
    if (!list.length) return null;
    if (!splitMode) return list[0];
    const t0 = sessionStartedAtRef.current;
    if (!t0) return list[0];
    return (
      list.find((r) => new Date(r.startedAt).getTime() >= t0 - 15_000) ?? null
    );
  }, [
    workbench,
    selectedWorkflowId,
    splitMode,
    sessionEpoch,
    historyRunId,
    rightPaneHistoryBrowse,
  ]);

  /** 分栏左侧：工作台全部执行记录（新→旧），不限当前能力；点选行会同步 selectedWorkflowId */
  const runsForHistoryPanel = useMemo(() => {
    if (!workbench?.runs?.length) return [];
    return workbench.runs
      .slice()
      .sort(
        (a, b) =>
          new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
      );
  }, [workbench?.runs]);

  /** 进行中任务数；≥3 时禁止再提交 */
  const runningTasksCount = useMemo(
    () => (workbench?.runs ?? []).filter((r) => r.status === "running").length,
    [workbench?.runs],
  );
  const atExecutionCap = runningTasksCount >= 3;

  const workflowLabelForRun = useCallback(
    (run: WorkflowRun) => {
      if (!run.workflowId || !workbench?.workflows) return run.workflowName;
      const wf = workbench.workflows.find((w) => w.id === run.workflowId);
      return wf ? featureLabel(wf) : run.workflowName;
    },
    [workbench?.workflows],
  );

  const openHistorySplit = useCallback(() => {
    setSplitMode(true);
    setHistoryRunId(null);
    setRightPaneHistoryBrowse(true);
  }, []);

  /** 提交执行并轮询 workbench，直至本轮 run 结束或超时（主输入与历史「重试」共用） */
  const executeWorkflowPrompt = useCallback(
    async (wfId: string, prompt: string) => {
      const trimmed = prompt.trim();
      if (!wfId || !trimmed) return;
      if (isSubmitting) return;
      const running =
        (workbench?.runs ?? []).filter((r) => r.status === "running").length;
      if (running >= 3) return;

      const myGen = ++executeGenerationRef.current;
      streamingAbortRef.current?.abort();
      streamingAbortRef.current = null;
      setHistoryRunId(null);
      setRightPaneHistoryBrowse(false);
      sessionStartedAtRef.current = Date.now();
      setSessionEpoch((e) => e + 1);
      setSplitMode(true);
      setIsSubmitting(true);
      setStreamingRunId(null);
      setStreamingStatus("running");
      setStreamingSteps([]);
      try {
        const ac = new AbortController();
        streamingAbortRef.current = ac;

        const resp = await fetch(`/api/workflows/${wfId}/execute/stream`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userInput: trimmed }),
          signal: ac.signal,
        });
        setIsSubmitting(false);
        setPollingWfId(wfId);

        const reader = resp.body?.getReader();
        if (!resp.ok || !reader) {
          const errText = await resp.text().catch(() => "");
          throw new Error(
            errText || `HTTP ${resp.status} (${resp.statusText || "请求失败"})`,
          );
        }

        const decoder = new TextDecoder();
        let buffer = "";
        let currentEvent = "";
        const accByIndex = new Map<number, string>();
        let runIdSeen: string | null = null;

        const upsertStep = (idx: number, patch: Partial<WorkflowRunStep>) => {
          setStreamingSteps((prev) => {
            const next = prev.slice();
            const at = next.findIndex((s) => (s.index ?? 0) === idx);
            const base: WorkflowRunStep =
              at >= 0
                ? next[at]
                : { index: idx, agentId: patch.agentId, status: "running" };
            const mergedStep = { ...base, ...patch, index: idx };
            if (at >= 0) next[at] = mergedStep;
            else next.push(mergedStep);
            next.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
            return next;
          });
        };

        while (true) {
          if (myGen !== executeGenerationRef.current) break;
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine) {
              currentEvent = "";
              continue;
            }
            if (trimmedLine.startsWith(":")) continue; // heartbeat
            if (trimmedLine.startsWith("event: ")) {
              currentEvent = trimmedLine.slice(7).trim();
              continue;
            }
            if (trimmedLine.startsWith("data: ")) {
              const raw = trimmedLine.slice(6);
              let data: any = null;
              try {
                data = JSON.parse(raw);
              } catch {
                data = null;
              }
              if (!data) continue;

              if (currentEvent === "runCreated") {
                runIdSeen = String(data.runId || "");
                setStreamingRunId(runIdSeen);
                setStreamingStatus("running");
              } else if (currentEvent === "stepStart") {
                const idx = Number(data.index ?? 0);
                upsertStep(idx, {
                  index: idx,
                  agentId: data.agentId,
                  status: "running",
                  success: undefined,
                  summary: "",
                });
              } else if (currentEvent === "stepChunk") {
                const idx = Number(data.index ?? 0);
                const delta = String(data.textDelta || "");
                const prevAcc = accByIndex.get(idx) || "";
                const acc = prevAcc + delta;
                accByIndex.set(idx, acc);
                upsertStep(idx, { index: idx, summary: acc });
              } else if (currentEvent === "stepDone") {
                const idx = Number(data.index ?? 0);
                const acc = accByIndex.get(idx) || "";
                const ok = data.success !== false && data.status !== "error";
                const resultType = data.resultType || undefined;
                upsertStep(idx, {
                  index: idx,
                  success: ok,
                  status: data.status,
                  summary: data.summary || acc,
                  ...(resultType
                    ? { resultType, resultData: acc }
                    : undefined),
                });
              } else if (currentEvent === "runDone") {
                setStreamingStatus(String(data.status || ""));
              } else if (currentEvent === "error") {
                throw new Error(String(data.message || "stream error"));
              }
            }
          }
        }

        if (myGen === executeGenerationRef.current) {
          const wb = await loadWorkbench({ quiet: true });
          if (runIdSeen && wb?.runs?.some((r) => r.id === runIdSeen)) {
            setHistoryRunId(runIdSeen);
          }
        }
      } catch {
        /* toast via apiClient */
      } finally {
        setIsSubmitting(false);
        if (myGen === executeGenerationRef.current) {
          setPollingWfId(null);
          streamingAbortRef.current = null;
        }
      }
    },
    [isSubmitting, loadWorkbench, workbench?.runs],
  );

  const runSelected = async () => {
    const wfId = selectedWorkflowId;
    if (!wfId) return;
    const prompt = userInput.trim();
    if (!prompt) return;
    setUserInput("");
    await executeWorkflowPrompt(wfId, prompt);
  };

  const handleDeleteHistoryRun = useCallback(
    async (runId: string) => {
      setDeletingRunId(runId);
      try {
        await apiClient.delete(`/api/workflows/runs/${runId}`);
        await loadWorkbench({ quiet: true });
        setHistoryRunId((prev) => (prev === runId ? null : prev));
        setConfirmDeleteRunId(null);
      } catch {
        /* toast via apiClient */
      } finally {
        setDeletingRunId(null);
      }
    },
    [loadWorkbench],
  );

  const handleRetryHistoryRun = useCallback(
    (run: WorkflowRun) => {
      const wfId = run.workflowId;
      if (!wfId || run.status === "running") return;
      if (atExecutionCap) return;
      const prompt =
        run.userInput?.trim() ||
        run.workflowName?.trim() ||
        "";
      if (!prompt) return;
      setSelectedWorkflowId(wfId);
      void executeWorkflowPrompt(wfId, prompt);
    },
    [executeWorkflowPrompt, atExecutionCap],
  );

  const inputPlaceholder = selectedFeature
    ? "描述你的页面或站点：目标用户、必备模块、风格气质…"
    : "请先点选上方一个创作方向";

  const executeBusy = isSubmitting || !!pollingWfId;

  return (
    <div className="h-screen flex flex-col bg-surface text-text-primary selection:bg-primary-100 selection:text-primary-900">
      <Navbar
        afterLogo={<GreetingBubble nickname={user?.nickname} />}
        rightSlot={
          user ? (
            <UserProfileDropdown
              user={user}
              workflowRuns={workbench?.counts.workflowRuns ?? 0}
              totalAiCalls={totalAiCalls}
              onLogout={logout}
            />
          ) : undefined
        }
      />

      <main
        ref={mainRef}
        className={`w-full mx-auto flex-1 h-px flex flex-col ${
          splitMode
            ? "lg:flex-row lg:items-stretch lg:justify-start"
            : "max-w-4xl justify-center px-6"
        }`}
        style={{ minHeight: "calc(100vh - 133px)" }}
      >
        <div
          className={
            splitMode
              ? "flex flex-col shrink-0 w-full h-full px-8 lg:min-w-0 lg:shrink-0"
              : "w-full h-full flex flex-col justify-center items-center"
          }
          style={
            splitMode && isLg
              ? {
                  width: `${splitLeftPct}%`,
                  maxWidth: `${SPLIT_LEFT_MAX_PCT}%`,
                  flexShrink: 0,
                }
              : undefined
          }
        >
          {!splitMode && (
            <section className="relative py-8 md:py-11 text-center max-w-2xl mx-auto">
              {!splitMode ? (
                <>
                  <div className="absolute top-0 left-1/4 w-72 h-72 bg-primary-100/30 rounded-full blur-[100px] -z-10 pointer-events-none" />
                  <div className="absolute top-8 right-1/4 w-72 h-72 bg-accent-100/30 rounded-full blur-[100px] -z-10 pointer-events-none" />
                </>
              ) : null}
              <h1
                className={`font-black tracking-tight text-text-primary mb-3 leading-tight ${
                  splitMode ? "text-xl md:text-2xl" : "text-2xl md:text-3xl"
                }`}
              >
                选好方向，写下需求，
                <span className="text-primary-600"> 一键开跑</span>
              </h1>
              <p
                className={`text-text-secondary font-medium leading-relaxed ${
                  splitMode ? "text-xs md:text-sm" : "text-sm md:text-base"
                } ${splitMode ? "text-left" : ""}`}
                aria-live="polite"
              >
                {heroDescription ?? HERO_DESCRIPTION_DEFAULT}
              </p>
            </section>
          )}

          <section
            className={`w-full mb-8 justify-center ${splitMode ? "flex-1 flex flex-col h-full" : ""}`}
          >
            {/* 对话区 */}
            {splitMode && (
              <div className="flex-1 min-h-0 flex flex-col mb-3 overflow-auto border-b border-border/70 pb-3">
                <div className="flex flex-col overflow-auto">
                  <ul className="flex-1 overflow-y-auto p-2 space-y-1.5 min-h-0 scrollbar-hide">
                    {runsForHistoryPanel.length === 0 ? (
                      <li className="text-xs text-text-tertiary px-2 py-6 text-center font-medium">
                        暂无记录，提交任务后将显示在此
                      </li>
                    ) : (
                      runsForHistoryPanel.map((run) => {
                        const active =
                          run.id === historyRunId ||
                          (!historyRunId &&
                            !rightPaneHistoryBrowse &&
                            run.id === displayRun?.id);
                        const st = run.status;
                        const statusClass =
                          st === "success"
                            ? "bg-emerald-100 text-emerald-800"
                            : st === "failed"
                              ? "bg-red-100 text-red-800"
                              : st === "running"
                                ? "bg-sky-100 text-sky-800"
                                : "bg-surface text-text-secondary";
                        const rawPreview =
                          run.userInput?.trim() || run.workflowName || "无描述";
                        const preview =
                          rawPreview.length > 72
                            ? `${rawPreview.slice(0, 72)}…`
                            : rawPreview;
                        const t = new Date(run.startedAt);
                        const timeStr = `${t.getMonth() + 1}/${t.getDate()} ${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
                        const capability = workflowLabelForRun(run);
                        const canRetry =
                          !!run.workflowId &&
                          st !== "running" &&
                          !!(run.userInput?.trim() || run.workflowName?.trim());
                        const runSteps = sortedRunSteps(
                          normalizeRunSteps(run.steps),
                        );
                        const planForRun = parseSteps(
                          workbench?.workflows.find(
                            (w) => w.id === run.workflowId,
                          )?.steps,
                        );
                        return (
                          <li key={run.id}>
                            <div
                              className={`rounded-xl border transition-colors ${
                                active
                                  ? "border-primary-400 bg-primary-50/80"
                                  : "border-gray-200 hover:bg-surface-secondary cursor-pointer"
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  if (run.workflowId) {
                                    setSelectedWorkflowId(run.workflowId);
                                  }
                                  setRightPaneHistoryBrowse(false);
                                  setHistoryRunId(run.id);
                                }}
                                className="w-full text-left rounded-t-xl px-3 pt-2.5 pb-2 flex flex-col gap-2 transition-[background-color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/35 focus-visible:ring-inset"
                              >
                                <div className="flex items-start gap-3">
                                  <div className="min-w-0 flex-1 space-y-1">
                                    <p className="text-xs text-text-primary font-semibold line-clamp-2 leading-snug">
                                      {preview}
                                    </p>
                                    <p className="text-[10px] font-semibold text-primary-600/90 truncate">
                                      {capability}
                                    </p>
                                  </div>
                                  <div className="flex gap-1 shrink-0">
                                    <span
                                      className={`text-[10px] font-bold px-2 py-0.5 rounded-md leading-none ${statusClass}`}
                                    >
                                      {st === "success"
                                        ? "成功"
                                        : st === "failed"
                                          ? "失败"
                                          : st === "running"
                                            ? "进行中"
                                            : st}
                                    </span>
                                    {run.totalDuration != null ? (
                                      <span className="text-[10px] font-semibold text-text-tertiary tabular-nums">
                                        {run.totalDuration}s
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                              </button>
                              <div className="flex items-center justify-between px-3">
                                <span className="text-[11px] font-medium text-text-tertiary/85 tabular-nums">
                                  {timeStr}
                                </span>
                                <div className="flex flex-wrap items-center justify-end gap-x-1 gap-y-1 px-3 pb-2.5 pt-1.5 border-t border-border/50">
                                  {canRetry ? (
                                    <button
                                      type="button"
                                      disabled={executeBusy || atExecutionCap}
                                      onClick={() => handleRetryHistoryRun(run)}
                                      className="text-[11px] font-semibold text-primary-600 hover:text-primary-700 bg-primary-500/10 hover:bg-primary-500/20 rounded-md px-2 py-1 -my-0.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent cursor-pointer transition-colors"
                                    >
                                      {st === "failed" ? "重试" : "再跑"}
                                    </button>
                                  ) : null}
                                  {confirmDeleteRunId === run.id ? (
                                    <span className="flex items-center gap-1 text-[11px]">
                                      <button
                                        type="button"
                                        disabled={deletingRunId === run.id}
                                        onClick={() =>
                                          void handleDeleteHistoryRun(run.id)
                                        }
                                        className="font-semibold text-red-600 hover:text-red-700 bg-red-500/10 hover:bg-red-500/20 rounded-md px-2 py-1 -my-0.5 disabled:opacity-50 disabled:hover:bg-transparent cursor-pointer transition-colors"
                                      >
                                        {deletingRunId === run.id
                                          ? "删除中…"
                                          : "确认"}
                                      </button>
                                      <button
                                        type="button"
                                        disabled={deletingRunId === run.id}
                                        onClick={() =>
                                          setConfirmDeleteRunId(null)
                                        }
                                        className="font-medium text-text-tertiary hover:text-text-secondary hover:bg-surface-secondary rounded-md px-2 py-1 -my-0.5 cursor-pointer transition-colors"
                                      >
                                        取消
                                      </button>
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setConfirmDeleteRunId(run.id)
                                      }
                                      className="text-[11px] font-semibold text-text-tertiary hover:text-red-600 hover:bg-red-500/5 rounded-md px-2 py-1 -my-0.5 cursor-pointer transition-colors"
                                    >
                                      删除
                                    </button>
                                  )}
                                </div>
                              </div>
                              {runSteps.length > 0 ? (
                                <div className="px-2 pb-2 pt-0">
                                  <RunExecutionProcessDetails
                                    steps={runSteps}
                                    planSteps={planForRun}
                                    catNameById={catNameById}
                                    compact
                                  />
                                </div>
                              ) : null}
                            </div>
                          </li>
                        );
                      })
                    )}
                  </ul>
                </div>
              </div>
            )}
            <div className="rounded-[28px] border border-border-strong bg-surface-secondary/40 p-3 sm:p-4">
              <div
                className={`flex flex-col lg:items-stretch ${
                  splitMode ? "gap-2" : "lg:flex-row gap-4"
                }`}
              >
                {/* 功能卡片：横向排列，与输入区在同一行（大屏） */}
                <div
                  className="flex flex-row flex-wrap gap-2 content-start shrink-0 lg:max-w-[min(100%,14rem)] xl:max-w-[min(100%,22rem)] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden overflow-x-auto pb-1 lg:overflow-x-visible lg:pb-0"
                  role="tablist"
                  aria-label="创作能力"
                >
                  {loading ? (
                    <div className="text-xs text-text-tertiary font-medium py-4 px-2">
                      加载中…
                    </div>
                  ) : !officialWorkflows.length ? (
                    <div className="text-xs text-text-tertiary font-medium py-4 px-2">
                      暂无官方创作能力
                    </div>
                  ) : (
                    officialWorkflows.map((wf) => (
                      <FeatureCard
                        key={wf.id}
                        icon={wf.icon}
                        title={featureLabel(wf)}
                        blurb={featureBlurb(wf)}
                        selected={selectedWorkflowId === wf.id}
                        onSelect={() => setSelectedWorkflowId(wf.id)}
                        splitMode={splitMode}
                      />
                    ))
                  )}
                </div>

                <div
                  className={
                    splitMode
                      ? "relative flex-1 flex flex-col min-w-0 border-t border-border pt-3"
                      : "flex-1 flex flex-col min-w-0 border-t border-border lg:border-t-0 lg:border-l lg:pl-4 pt-3 lg:pt-0 lg:min-w-[12rem]"
                  }
                >
                  <div
                    className={`flex gap-2 items-start min-h-[9rem] sm:min-h-[9rem] bg-gray-100 rounded-2xl ${splitMode ? "pb-16" : ""}`}
                  >
                    <textarea
                      value={userInput}
                      onChange={(e) => setUserInput(e.target.value)}
                      placeholder={inputPlaceholder}
                      rows={6}
                      disabled={!selectedFeature}
                      className={`flex-1 min-h-[6rem] sm:min-h-[6rem] px-3 border-0 outline-none resize-none text-sm font-medium placeholder:text-text-tertiary disabled:opacity-50 ${splitMode ? "pt-2" : "py-2"}`}
                    />
                  </div>

                  <div
                    className={`flex flex-wrap items-center justify-between gap-3 px-1 pt-2 ${splitMode ? "absolute bottom-3 right-3" : ""}`}
                  >
                    {/* <span className="text-xs text-text-tertiary font-medium max-w-[20rem]">
                    {selectedFeature
                      ? "内容会作为第一步的主题描述提交给当前模式。"
                      : "选择左侧或上方的能力后再输入。"}
                  </span> */}
                    {selectedFeature && !splitMode ? (
                      <div
                        className="shrink-0 pt-1"
                        role="status"
                        aria-label="当前模式"
                      >
                        <span className="inline-flex items-center gap-1 rounded-full border border-primary-300/80 bg-primary-50 pl-2 pr-1 py-1 text-xs font-bold text-primary-900">
                          <AppIcon
                            symbol={selectedFeature.icon}
                            size={14}
                            className="text-primary-700"
                          />
                          {featureLabel(selectedFeature)}
                          <button
                            type="button"
                            onClick={() => setSelectedWorkflowId(null)}
                            className="p-0.5 rounded-full hover:bg-primary-200/60 text-primary-700 cursor-pointer"
                            aria-label="清除所选能力"
                          >
                            <X size={14} strokeWidth={2.5} />
                          </button>
                        </span>
                      </div>
                    ) : null}
                    <button
                      type="button"
                      disabled={
                        !selectedWorkflowId ||
                        !userInput.trim() ||
                        atExecutionCap
                      }
                      onClick={() => void runSelected()}
                      className="ml-auto px-7 py-2.5 rounded-2xl bg-text-primary text-text-inverse text-sm font-bold hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0"
                    >
                      {isSubmitting
                        ? "提交中…"
                        : pollingWfId
                          ? "执行中…"
                          : "开始创作"}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {!splitMode && (
              <nav
                className={`flex flex-wrap items-center gap-y-2 text-xs font-bold text-text-tertiary ${
                  splitMode
                    ? "mt-2 gap-x-4 justify-start"
                    : "mt-6 gap-x-8 justify-center"
                }`}
                aria-label="更多入口"
              >
                <button
                  type="button"
                  onClick={openHistorySplit}
                  className="hover:text-primary-600 transition-colors text-left"
                >
                  历史记录
                </button>
                <Link
                  to="/dashboard/usage"
                  className="hover:text-primary-600 transition-colors"
                >
                  角色调用次数
                </Link>
              </nav>
            )}
          </section>
        </div>

        {splitMode && isLg ? (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-valuemin={SPLIT_LEFT_MIN_PCT}
            aria-valuemax={SPLIT_LEFT_MAX_PCT}
            aria-valuenow={Math.round(splitLeftPct)}
            aria-label="拖动调整左右宽度"
            tabIndex={0}
            className="relative flex w-3 shrink-0 cursor-col-resize select-none items-stretch justify-center touch-none py-1 group outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 rounded-sm"
            onPointerDown={(e) => {
              e.preventDefault();
              splitDragActiveRef.current = true;
              document.body.style.cursor = "col-resize";
              document.body.style.userSelect = "none";
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                e.preventDefault();
                const delta = e.key === "ArrowLeft" ? -2 : 2;
                setSplitLeftPct((p) =>
                  Math.min(
                    SPLIT_LEFT_MAX_PCT,
                    Math.max(SPLIT_LEFT_MIN_PCT, p + delta),
                  ),
                );
              }
            }}
          >
            <div className="opacity-10 group-hover:opacity-20 w-px flex-1 min-h-[120px] my-auto bg-border group-hover:bg-primary-400/80 group-active:bg-primary-500 transition-colors" />
            <div className="absolute top-0 left-0 w-px h-full bg-gray-200"></div>
          </div>
        ) : null}

        {splitMode ? (
          <div className="flex-1 min-w-0 flex flex-col lg:min-h-0">
            <ResultCanvas
              workflowName={
                selectedFeature
                  ? featureLabel(selectedFeature)
                  : (workbench?.workflows.find(
                      (w) => w.id === selectedWorkflowId,
                    )?.name ?? "")
              }
              userPrompt={userInput.trim() || displayRun?.workflowName || ""}
              displayRun={displayRun}
              streamingRunId={streamingRunId}
              streamingStatus={streamingStatus}
              streamingSteps={streamingSteps}
              isSubmitting={isSubmitting}
              waitingForRunRecord={
                splitMode &&
                !displayRun &&
                !isSubmitting &&
                !!pollingWfId &&
                !streamingRunId &&
                streamingSteps.length === 0
              }
              planSteps={planSteps}
              catNameById={catNameById}
              cats={workbench?.cats ?? []}
            />
          </div>
        ) : null}
      </main>

      {splitMode ? null : (
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
      )}
    </div>
  );
};

export default DashboardPage;

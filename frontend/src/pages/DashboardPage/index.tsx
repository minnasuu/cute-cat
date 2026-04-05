import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { apiClient } from "../../utils/apiClient";
import CatLogo from "../../components/CatLogo";
import Navbar from "../../components/Navbar";
import UserProfileDropdown from "./UserProfileDropdown";
import { showToast } from "../../components/Toast";
import { AppIcon } from "../../components/icons";
import { X } from "lucide-react";
import type { WorkflowRow, WorkbenchPayload } from "./workbenchTypes";
import {
  featureBlurb,
  featureLabel,
  isOfficialWorkflow,
  parseSteps,
} from "./workbenchUtils";
import ResultCanvas from "./ResultCanvas";
import type { WorkflowRun } from "./workbenchTypes";

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
}: {
  icon: string;
  title: string;
  blurb: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`shrink-0 flex flex-col gap-1 text-left rounded-2xl border px-3 py-2.5 min-w-[6.75rem] sm:min-w-[7.5rem] max-w-[9.5rem] transition-all cursor-pointer ${
        selected
          ? "border-primary-400 bg-primary-50/50"
          : "border-border bg-surface hover:border-border-strong"
      }`}
    >
      <div className="flex items-center gap-1 w-full">
        <span className="text-primary-600">
          <AppIcon symbol={icon} size={18} strokeWidth={2} />
        </span>
        <span className="text-sm sm:text-xs font-black text-text-primary leading-tight">
          {title}
        </span>
      </div>
      <span className="text-[10px] text-text-tertiary font-medium mt-1 line-clamp-2 leading-snug">
        {blurb}
      </span>
    </button>
  );
}

const DashboardPage: React.FC = () => {
  const { user, logout } = useAuth();
  const [teamId, setTeamId] = useState<string | null>(null);
  const [workbench, setWorkbench] = useState<WorkbenchPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [userInput, setUserInput] = useState("");
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(
    null,
  );
  const [executingId, setExecutingId] = useState<string | null>(null);
  /** 点击「开始创作」后进入左右分栏：左工作台、右画布 */
  const [splitMode, setSplitMode] = useState(false);
  /** lg+ 分栏时左侧宽度占主区域比例（%），最大 40% */
  const [splitLeftPct, setSplitLeftPct] = useState(SPLIT_LEFT_DEFAULT_PCT);
  /** 递增以使本轮 run 匹配 useMemo 刷新 */
  const [sessionEpoch, setSessionEpoch] = useState(0);
  const sessionStartedAtRef = useRef(0);
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
        setTeamId(wb.teamId);
        setWorkbench(wb);
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

  const displayRun: WorkflowRun | null = useMemo(() => {
    if (!workbench?.runs?.length || !selectedWorkflowId) return null;
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
  }, [workbench, selectedWorkflowId, splitMode, sessionEpoch]);

  const runSelected = async () => {
    const wfId = selectedWorkflowId;
    if (!wfId) return;
    sessionStartedAtRef.current = Date.now();
    setSessionEpoch((e) => e + 1);
    setSplitMode(true);
    setExecutingId(wfId);
    try {
      await apiClient.post(`/api/workflows/${wfId}/execute`, {
        userInput: userInput.trim(),
      });
      showToast("已收到，猫猫们开始接力啦");
      for (let i = 0; i < 48; i++) {
        const wb = await loadWorkbench({ quiet: true });
        if (!wb) break;
        const match = wb.runs?.find(
          (r) =>
            r.workflowId === wfId &&
            new Date(r.startedAt).getTime() >=
              sessionStartedAtRef.current - 15_000,
        );
        if (match && match.status !== "running") break;
        await new Promise((r) => setTimeout(r, 1500));
      }
    } catch {
      /* toast via apiClient */
    } finally {
      setExecutingId(null);
    }
  };

  const inputPlaceholder = selectedFeature
    ? "描述你的页面或站点：目标用户、必备模块、风格气质…"
    : "请先点选上方一个创作方向";

  return (
    <div className="h-screen flex flex-col bg-surface text-text-primary selection:bg-primary-100 selection:text-primary-900">
      <Navbar
        afterLogo={<GreetingBubble nickname={user?.nickname} />}
        rightSlot={
          user ? (
            <UserProfileDropdown
              user={user}
              workflowCount={workbench?.counts.workflows ?? 0}
              officialCatCount={workbench?.counts.cats ?? 0}
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
          <section
            className={
              splitMode
                ? "relative py-5 text-left"
                : "relative py-8 md:py-11 text-center max-w-2xl mx-auto"
            }
          >
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

          <section className="w-full mb-8 flex-1">
            <div className="rounded-[28px] border border-border-strong bg-surface-secondary/40 p-3 sm:p-4">
              <div
                className={`flex flex-col gap-4 lg:items-stretch ${
                  splitMode ? "" : "lg:flex-row"
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
                      />
                    ))
                  )}
                </div>

                <div
                  className={
                    splitMode
                      ? "flex-1 flex flex-col min-w-0 border-t border-border pt-3"
                      : "flex-1 flex flex-col min-w-0 border-t border-border lg:border-t-0 lg:border-l lg:pl-4 pt-3 lg:pt-0 lg:min-w-[12rem]"
                  }
                >
                  <div className="flex gap-2 items-start min-h-[9rem] sm:min-h-[9rem]">
                    <textarea
                      value={userInput}
                      onChange={(e) => setUserInput(e.target.value)}
                      placeholder={inputPlaceholder}
                      rows={6}
                      disabled={!selectedFeature}
                      className="flex-1 min-h-[9rem] sm:min-h-[9rem] px-3 py-2 rounded-2xl bg-gray-100 border-0 outline-none resize-none text-sm font-medium placeholder:text-text-tertiary disabled:opacity-50"
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 px-1 pt-2">
                    {/* <span className="text-xs text-text-tertiary font-medium max-w-[20rem]">
                    {selectedFeature
                      ? "内容会作为第一步的主题描述提交给当前模式。"
                      : "选择左侧或上方的能力后再输入。"}
                  </span> */}
                    {selectedFeature ? (
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
                      disabled={!selectedWorkflowId || !!executingId || loading || !userInput}
                      onClick={runSelected}
                      className="ml-auto px-7 py-2.5 rounded-2xl bg-text-primary text-text-inverse text-sm font-bold hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0"
                    >
                      {executingId ? "处理中…" : "开始创作"}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <nav
              className={`mt-6 flex flex-wrap items-center gap-x-8 gap-y-2 text-xs font-bold text-text-tertiary ${
                splitMode ? "justify-start" : "justify-center"
              }`}
              aria-label="更多入口"
            >
              <Link
                to="/dashboard/history"
                className="hover:text-primary-600 transition-colors"
              >
                历史记录
              </Link>
              <Link
                to="/dashboard/usage"
                className="hover:text-primary-600 transition-colors"
              >
                猫猫调用次数
              </Link>
              {teamId ? (
                <Link
                  to={`/teams/${teamId}`}
                  className="hover:text-primary-600 transition-colors"
                >
                  团队与流程
                </Link>
              ) : null}
              {teamId && selectedWorkflowId ? (
                <Link
                  to={`/teams/${teamId}/workflows/${selectedWorkflowId}`}
                  className="hover:text-primary-600 transition-colors"
                >
                  流程设计（进阶）
                </Link>
              ) : null}
            </nav>
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
            className="flex w-3 shrink-0 cursor-col-resize select-none items-stretch justify-center touch-none py-1 group outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 rounded-sm"
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
            <div className="w-px flex-1 min-h-[120px] my-auto bg-border group-hover:bg-primary-400/80 group-active:bg-primary-500 transition-colors" />
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
              userPrompt={userInput}
              displayRun={displayRun}
              isSubmitting={!!executingId}
              waitingForRunRecord={
                splitMode && !displayRun && executingId === null
              }
              planSteps={planSteps}
              catNameById={catNameById}
            />
          </div>
        ) : null}
      </main>

    {splitMode ? null :<footer className="py-4 border-t border-border">
        <div className="w-full mx-auto px-6 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 cursor-pointer">
            <CatLogo size={36} />
          </Link>
          <p className="text-text-tertiary text-xs font-medium">
            &copy; 2026 CuCaTopia.
          </p>
        </div>
      </footer>}
    </div>
  );
};

export default DashboardPage;

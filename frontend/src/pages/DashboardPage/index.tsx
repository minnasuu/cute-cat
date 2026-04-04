import React, { useState, useEffect, useCallback, useMemo } from "react";
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
} from "./workbenchUtils";

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
      className={`shrink-0 flex flex-col text-left rounded-2xl border px-3 py-2.5 min-w-[6.75rem] sm:min-w-[7.5rem] max-w-[9.5rem] transition-all cursor-pointer ${
        selected
          ? "border-primary-400 bg-primary-50/50 shadow-sm ring-2 ring-primary-200/50"
          : "border-border bg-surface hover:border-border-strong hover:shadow-sm"
      }`}
    >
      <span className="mb-1 text-primary-600">
        <AppIcon symbol={icon} size={22} strokeWidth={2} />
      </span>
      <span className="text-[11px] sm:text-xs font-black text-text-primary leading-tight">
        {title}
      </span>
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

  /** 仅官方种子工作流，供能力卡片展示（不含团队自建流程） */
  const officialWorkflows = useMemo(
    () => (workbench?.workflows ?? []).filter(isOfficialWorkflow),
    [workbench],
  );

  const selectedFeature = useMemo((): WorkflowRow | null => {
    if (!selectedWorkflowId) return null;
    return officialWorkflows.find((w) => w.id === selectedWorkflowId) ?? null;
  }, [officialWorkflows, selectedWorkflowId]);

  const totalAiCalls = useMemo(
    () => (workbench?.aiStats ?? []).reduce((s, r) => s + r.count, 0),
    [workbench],
  );

  const loadWorkbench = useCallback(async (opts?: { quiet?: boolean }) => {
    const quiet = opts?.quiet ?? false;
    if (!quiet) setLoading(true);
    try {
      const wb = await apiClient.get<WorkbenchPayload>("/api/teams/workbench");
      setTeamId(wb.teamId);
      setWorkbench(wb);
      const officials = (wb.workflows ?? []).filter(isOfficialWorkflow);
      setSelectedWorkflowId((prev) =>
        prev && officials.some((w) => w.id === prev)
          ? prev
          : (officials[0]?.id ?? null),
      );
    } catch (e) {
      console.error(e);
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWorkbench();
  }, [loadWorkbench]);

  const refreshAfterRun = useCallback(async () => {
    try {
      await loadWorkbench({ quiet: true });
    } catch {
      /* ignore */
    }
  }, [loadWorkbench]);

  const runSelected = async () => {
    const wfId = selectedWorkflowId;
    if (!wfId) return;
    setExecutingId(wfId);
    try {
      await apiClient.post(`/api/workflows/${wfId}/execute`, {
        userInput: userInput.trim(),
      });
      showToast("已收到，猫猫们开始接力啦");
      setTimeout(() => refreshAfterRun(), 2500);
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
    <div className="min-h-screen bg-surface text-text-primary selection:bg-primary-100 selection:text-primary-900">
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
        className="w-full max-w-4xl mx-auto px-6 pb-16 flex flex-col justify-center"
        style={{ minHeight: "calc(100vh - 133px)" }}
      >
        <section className="relative py-8 md:py-11 text-center max-w-2xl mx-auto">
          <div className="absolute top-0 left-1/4 w-72 h-72 bg-primary-100/30 rounded-full blur-[100px] -z-10 pointer-events-none" />
          <div className="absolute top-8 right-1/4 w-72 h-72 bg-accent-100/30 rounded-full blur-[100px] -z-10 pointer-events-none" />
          <h1 className="text-2xl md:text-3xl font-black tracking-tight text-text-primary mb-3 leading-tight">
            选好方向，写下需求，
            <span className="text-primary-600"> 一键开跑</span>
          </h1>
          <p className="text-text-secondary font-medium text-sm md:text-base leading-relaxed">
            点选能力卡片后，输入框前会出现当前模式标签；提交后由猫猫按{" "}
            <span className="text-text-primary font-semibold">
              架构 → 交互 → 视觉 → 前端
            </span>{" "}
            接力完成（AIGC 占位）。
          </p>
        </section>

        <section className="w-full mb-8">
          <div className="rounded-[28px] border border-border-strong bg-surface-secondary/40 p-3 sm:p-4 shadow-sm">
            <div className="flex flex-col lg:flex-row gap-4 lg:items-stretch">
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

              <div className="flex-1 flex flex-col min-w-0 border-t border-border lg:border-t-0 lg:border-l lg:pl-4 pt-3 lg:pt-0 lg:min-w-[12rem]">
                <div className="flex gap-2 items-start min-h-[6.5rem] sm:min-h-[7.5rem]">
                  <textarea
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    placeholder={inputPlaceholder}
                    rows={4}
                    disabled={!selectedFeature}
                    className="flex-1 min-h-[6.5rem] sm:min-h-[7.5rem] px-3 py-2 rounded-2xl bg-gray-100 border-0 outline-none resize-none text-sm font-medium placeholder:text-text-tertiary disabled:opacity-50"
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
                      <span className="inline-flex items-center gap-1 rounded-full border border-primary-300/80 bg-primary-50 pl-2 pr-1 py-1 text-xs font-bold text-primary-900 shadow-sm">
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
                    disabled={!selectedWorkflowId || !!executingId}
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
            className="mt-6 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-xs font-bold text-text-tertiary"
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
      </main>

      <footer className="py-4 border-t border-border">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between">
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

export default DashboardPage;

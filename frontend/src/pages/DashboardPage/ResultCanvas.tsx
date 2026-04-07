import { useMemo } from "react";
import {
  CheckCircle2,
  ChevronRight,
  Loader2,
  Lock,
  XCircle,
} from "lucide-react";
import DashboardWorkflowPipeline from "../../components/DashboardWorkflowPipeline";
import type { PlanStep, TeamCat, WorkflowRun, WorkflowRunStep } from "./workbenchTypes";

export type { PlanStep } from "./workbenchTypes";

function normalizeSteps(raw: unknown): WorkflowRunStep[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as WorkflowRunStep[];
  return [];
}

function sortedRunSteps(steps: WorkflowRunStep[]): WorkflowRunStep[] {
  return [...steps].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
}

function labelForPlanStep(
  step: PlanStep,
  i: number,
  catNameById: Record<string, string>,
): string {
  if (step.agentId && catNameById[step.agentId]) {
    return catNameById[step.agentId];
  }
  if (step.agentId) {
    return step.agentId.replace(/-/g, " ");
  }
  return `步骤 ${i + 1}`;
}

export default function ResultCanvas({
  workflowName,
  userPrompt,
  displayRun,
  isSubmitting,
  waitingForRunRecord,
  planSteps,
  catNameById,
  cats,
}: {
  workflowName: string;
  userPrompt: string;
  displayRun: WorkflowRun | null;
  isSubmitting: boolean;
  /** 已提交但尚未在列表里匹配到本轮 run */
  waitingForRunRecord: boolean;
  planSteps: PlanStep[];
  catNameById: Record<string, string>;
  cats: TeamCat[];
}) {
  const steps = useMemo(
    () => sortedRunSteps(normalizeSteps(displayRun?.steps)),
    [displayRun?.steps],
  );
  const inProgress = displayRun?.status === "running";
  const failed = displayRun?.status === "failed";
  const lastStep = steps.length ? steps[steps.length - 1] : null;
  const failedStep = useMemo(
    () => steps.find((s) => s.success === false || s.status === "error"),
    [steps],
  );

  function stepDisplayText(s: WorkflowRunStep | null | undefined): string {
    if (!s) return "";
    if (s.resultType === "visual-design-output" && s.resultData) {
      return s.resultData;
    }
    return s.summary ?? "";
  }

  const resultHeadline = failed
    ? stepDisplayText(failedStep) || "执行未全部成功"
    : stepDisplayText(lastStep) || (steps.length ? "已完成全部步骤" : "");

  /** 检测最后一步是否为 HTML 页面类型 */
  const htmlPageData = useMemo(() => {
    if (!lastStep || failed) return null;
    if (lastStep.resultType === "html-page" && lastStep.resultData) {
      return lastStep.resultData;
    }
    // 兼容：summary 以 <!DOCTYPE 或 <html 开头
    const s = (lastStep.summary || "").trim();
    if (s.startsWith("<!DOCTYPE") || s.startsWith("<html")) return s;
    return null;
  }, [lastStep, failed]);

  return (
    <div
      className="relative flex flex-col h-full min-h-[min(70vh,560px)] bg-surface overflow-hidden"
      aria-label="创作画布"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(15, 23, 42, 0.07) 1px, transparent 1px)",
          backgroundSize: "18px 18px",
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-br from-primary-50/40 via-transparent to-accent-50/30 pointer-events-none" />

      <div className="relative z-10 flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {isSubmitting ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <Loader2
              className="w-9 h-9 text-primary-500 animate-spin"
              strokeWidth={2}
            />
            <p className="text-sm font-bold text-text-secondary">
              正在提交任务…
            </p>
          </div>
        ) : null}

        {!isSubmitting && waitingForRunRecord && !displayRun ? (
          <DashboardWorkflowPipeline
            workflowName={workflowName}
            planSteps={planSteps}
            catNameById={catNameById}
            cats={cats}
            running
            runSteps={[]}
            footerHint="正在创建运行记录…"
          />
        ) : null}

        {!isSubmitting && !waitingForRunRecord && !displayRun ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-surface-secondary/35 py-14 px-6 text-center">
            <p className="text-sm font-semibold text-text-secondary">
              在左侧点选一条历史任务可查看详情与预览
            </p>
            <p className="text-xs text-text-tertiary font-medium max-w-sm">
              或在本页输入新的创作需求后点击「开始创作」；执行开始后输入框会清空，可随时填写下一条。
            </p>
          </div>
        ) : null}

        {/* 执行中：主区域只展示 WorkflowPanel 同款流水线动画 */}
        {!isSubmitting && displayRun && inProgress ? (
          <DashboardWorkflowPipeline
            workflowName={workflowName || displayRun.workflowName}
            planSteps={planSteps}
            catNameById={catNameById}
            cats={cats}
            running
            runSteps={steps}
          />
        ) : null}

        {/* 已结束：结果为主，执行过程收入折叠 */}
        {!isSubmitting && displayRun && !inProgress ? (
          <section className="space-y-3">
            {/* HTML 页面预览 */}
            {htmlPageData ? (
              <div className="rounded-2xl border border-primary-200/80 bg-white/90 shadow-sm overflow-hidden">
                {/* macOS 风格窗口标题栏 + Safari 式地址栏 */}
                <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 border-b border-black/[0.07] bg-gradient-to-b from-[#ececec] to-[#dededf]">
                  <div
                    className="flex items-center gap-1.5 shrink-0 pl-0.5"
                    aria-hidden="true"
                  >
                    <span className="size-[11px] rounded-full bg-[#ff5f57] shadow-[inset_0_-1px_1px_rgba(0,0,0,0.15)] ring-1 ring-black/[0.12]" />
                    <span className="size-[11px] rounded-full bg-[#febc2e] shadow-[inset_0_-1px_1px_rgba(0,0,0,0.12)] ring-1 ring-black/[0.08]" />
                    <span className="size-[11px] rounded-full bg-[#28c840] shadow-[inset_0_-1px_1px_rgba(0,0,0,0.12)] ring-1 ring-black/[0.1]" />
                  </div>
                  <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md bg-white/95 px-2.5 sm:px-3 py-1 shadow-[inset_0_1px_1px_rgba(0,0,0,0.05)] ring-1 ring-black/[0.08]">
                    <Lock
                      className="size-3 shrink-0 text-emerald-600/85"
                      strokeWidth={2}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate text-center text-[11px] font-medium text-neutral-600 font-mono">
                      preview.html
                    </span>
                    <span className="shrink-0 text-[10px] font-medium tabular-nums text-neutral-400">
                      {htmlPageData.length.toLocaleString()} 字符
                    </span>
                  </div>
                </div>
                <iframe
                  srcDoc={htmlPageData}
                  sandbox="allow-scripts allow-same-origin"
                  className="w-full border-0"
                  style={{ minHeight: "min(60vh, 520px)", height: "calc(100vh - 109px)" }}
                  title="生成的网页预览"
                />
              </div>
            ) : (
              <div
                className={`rounded-2xl border px-4 py-4 ${
                  failed
                    ? "border-danger-200 bg-danger-50/50"
                    : "border-primary-200/80 bg-white/90 shadow-sm"
                }`}
              >
                <p className="text-[10px] font-black uppercase tracking-wide text-text-tertiary mb-2">
                  {failed ? "执行结果" : "生成结果"}
                </p>
                {steps.length === 0 ? (
                  <p className="text-sm font-medium text-text-secondary">
                    本轮已结束（后端未写入步骤明细）。可前往历史记录查看状态。
                  </p>
                ) : resultHeadline ? (
                  <p className="text-sm font-bold text-text-primary leading-relaxed whitespace-pre-wrap">
                    {resultHeadline}
                  </p>
                ) : (
                  <p className="text-sm font-medium text-text-secondary">
                    本轮已结束，可展开下方查看各步摘要。
                  </p>
                )}
              </div>
            )}

            {steps.length > 0 ? (
              <details className="group rounded-2xl border border-border bg-surface-secondary/40 overflow-hidden">
                <summary className="px-4 py-3 text-xs font-black text-text-secondary cursor-pointer list-none flex items-center justify-between gap-2 hover:bg-surface/80 transition-colors [&::-webkit-details-marker]:hidden">
                  <span>查看执行过程（已收起）</span>
                  <ChevronRight className="w-4 h-4 shrink-0 transition-transform group-open:rotate-90 text-text-tertiary" />
                </summary>
                <div className="px-4 pb-4 pt-0 border-t border-border/60">
                  <ol className="space-y-0 mt-3">
                    {steps.map((s, i) => {
                      const plan = planSteps[s.index ?? i];
                      const catLabel = plan
                        ? labelForPlanStep(plan, s.index ?? i, catNameById)
                        : null;
                      const ok = s.success !== false && s.status !== "error";
                      const Icon = ok ? CheckCircle2 : XCircle;
                      const stepOut = stepDisplayText(s);
                      return (
                        <li
                          key={`${s.index}-${i}`}
                          className="flex gap-3 pb-4 last:pb-0 border-l border-border pl-4 ml-2 relative"
                        >
                          <span className="absolute -left-[9px] top-0.5 w-[14px] h-[14px] rounded-full bg-surface border border-border flex items-center justify-center">
                            <Icon
                              className={`w-3.5 h-3.5 ${ok ? "text-primary-600" : "text-danger-500"}`}
                              strokeWidth={2}
                            />
                          </span>
                          <div className="min-w-0 flex-1 pt-0">
                            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                              <span className="text-xs font-black text-text-primary">
                                步骤 {(s.index ?? i) + 1}
                                {catLabel ? (
                                  <span className="text-text-tertiary font-bold">
                                    {" "}
                                    · {catLabel}
                                  </span>
                                ) : null}
                              </span>
                              {s.agentId ? (
                                <span className="text-[10px] font-bold text-text-tertiary">
                                  {s.agentId}
                                </span>
                              ) : null}
                            </div>
                            {stepOut ? (
                              <p className="text-xs text-text-tertiary font-medium mt-1.5 leading-snug whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
                                {stepOut}
                              </p>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              </details>
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}

import { useMemo } from "react";
import { Loader2, Lock } from "lucide-react";
import DashboardWorkflowPipeline from "../../components/DashboardWorkflowPipeline";
import ReactSandboxPreview from "./ReactSandboxPreview";
import type { PlanStep, TeamCat, WorkflowRun, WorkflowRunStep } from "./workbenchTypes";
import {
  normalizeRunSteps,
  sortedRunSteps,
  stepDisplayTextForRunStep,
} from "./RunExecutionProcess";

export type { PlanStep } from "./workbenchTypes";

export default function ResultCanvas({
  workflowName,
  userPrompt,
  displayRun,
  streamingRunId,
  streamingStatus,
  streamingSteps,
  isSubmitting,
  waitingForRunRecord,
  planSteps,
  catNameById,
  cats,
}: {
  workflowName: string;
  userPrompt: string;
  displayRun: WorkflowRun | null;
  /** SSE 流式执行中：后端创建的 runId */
  streamingRunId?: string | null;
  /** SSE 流式执行中：当前状态（running/failed/success） */
  streamingStatus?: string | null;
  /** SSE 流式执行中：实时 steps（含 partial 文本） */
  streamingSteps?: WorkflowRunStep[] | null;
  isSubmitting: boolean;
  /** 已提交但尚未在列表里匹配到本轮 run */
  waitingForRunRecord: boolean;
  planSteps: PlanStep[];
  catNameById: Record<string, string>;
  cats: TeamCat[];
}) {
  const steps = useMemo(() => {
    if (displayRun?.steps) return sortedRunSteps(normalizeRunSteps(displayRun.steps));
    if (streamingSteps && streamingSteps.length) return sortedRunSteps(streamingSteps);
    return [];
  }, [displayRun?.steps, streamingSteps]);

  const runStatus = displayRun?.status || streamingStatus || null;
  const inProgress = runStatus === "running";
  const failed = runStatus === "failed";
  const lastStep = steps.length ? steps[steps.length - 1] : null;
  const failedStep = useMemo(
    () => steps.find((s) => s.success === false || s.status === "error"),
    [steps],
  );

  const resultHeadline = failed
    ? stepDisplayTextForRunStep(failedStep) || "执行未全部成功"
    : stepDisplayTextForRunStep(lastStep) ||
      (steps.length ? "已完成全部步骤" : "");

  /** 检测最后一步是否为 HTML 页面类型（历史记录） */
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

  /** React 沙箱源码（shadcn 风格 + Tailwind，由前端工程师步骤产出） */
  const reactSandboxCode = useMemo(() => {
    if (!lastStep || failed) return null;
    if (lastStep.resultType === "react-sandbox" && lastStep.resultData) {
      return lastStep.resultData;
    }
    return null;
  }, [lastStep, failed]);

  const previewKind = reactSandboxCode
    ? "react"
    : htmlPageData
      ? "html"
      : null;

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

      <div className="relative z-10 flex-1 overflow-y-auto space-y-4 flex flex-col justify-center items-center">
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
        {!isSubmitting && (displayRun || (streamingRunId && inProgress)) && inProgress ? (
          <DashboardWorkflowPipeline
            workflowName={workflowName || displayRun?.workflowName || "执行中"}
            planSteps={planSteps}
            catNameById={catNameById}
            cats={cats}
            running
            runSteps={steps}
            disableTypewriter
          />
        ) : null}

        {/* 已结束：结果为主；步骤明细在左侧历史卡片「查看执行过程」 */}
        {!isSubmitting && displayRun && !inProgress ? (
          <section className="space-y-3">
            {/* HTML 页面预览 */}
            {previewKind ? (
              <div className="overflow-hidden">
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
                      {previewKind === "react" ? "preview.tsx" : "preview.html"}
                    </span>
                    <span className="shrink-0 text-[10px] font-medium tabular-nums text-neutral-400">
                      {(previewKind === "react"
                        ? reactSandboxCode!
                        : htmlPageData!
                      ).length.toLocaleString()}{" "}
                      字符
                    </span>
                  </div>
                </div>
                {previewKind === "react" ? (
                  <ReactSandboxPreview code={reactSandboxCode!} />
                ) : (
                  <iframe
                    srcDoc={htmlPageData!}
                    sandbox="allow-scripts allow-same-origin"
                    className="w-full border-0"
                    style={{
                      minHeight: "min(60vh, 520px)",
                      height: "calc(100vh - 109px)",
                    }}
                    title="生成的网页预览"
                  />
                )}
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
                    本轮已结束，可在左侧对应历史卡片中展开「查看执行过程」。
                  </p>
                )}
              </div>
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
}

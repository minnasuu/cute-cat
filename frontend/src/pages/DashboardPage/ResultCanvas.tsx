import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronRight, Loader2, XCircle } from "lucide-react";
import type { WorkflowRun, WorkflowRunStep } from "./workbenchTypes";

export type PlanStep = {
  agentId?: string;
  skillId?: string;
  action?: string;
  stepId?: string;
};

function normalizeSteps(raw: unknown): WorkflowRunStep[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as WorkflowRunStep[];
  return [];
}

function sortedRunSteps(steps: WorkflowRunStep[]): WorkflowRunStep[] {
  return [...steps].sort(
    (a, b) => (a.index ?? 0) - (b.index ?? 0),
  );
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

/** 执行中：可视化猫咪接力流水线（WorkflowPanel 风格） */
function CatExecutionFlow({
  planSteps,
  catNameById,
  running,
  steps,
}: {
  planSteps: PlanStep[];
  catNameById: Record<string, string>;
  running: boolean;
  steps: WorkflowRunStep[];
}) {
  const [pulseIdx, setPulseIdx] = useState(0);

  useEffect(() => {
    if (!running || planSteps.length === 0) return;
    setPulseIdx(0);
    const t = window.setInterval(() => {
      setPulseIdx((i) => (i + 1) % planSteps.length);
    }, 2000);
    return () => window.clearInterval(t);
  }, [running, planSteps.length]);

  if (planSteps.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-10">
        <div className="flex gap-3 text-3xl" aria-hidden>
          <span className="animate-bounce" style={{ animationDelay: "0ms" }}>
            🐱
          </span>
          <span className="animate-bounce" style={{ animationDelay: "150ms" }}>
            🐱
          </span>
          <span className="animate-bounce" style={{ animationDelay: "300ms" }}>
            🐱
          </span>
        </div>
        <p className="text-sm font-bold text-text-secondary text-center px-4">
          猫猫正在执行任务，请稍候…
        </p>
      </div>
    );
  }

  // 计算每个步骤的完成状态
  const completedSteps = steps.filter(s => s.success !== false && s.status !== 'error').map(s => s.index ?? 0);

  return (
    <div className="rounded-2xl border border-primary-200/70 bg-primary-50/40 px-4 py-6">
      <p className="text-center text-[10px] font-black uppercase tracking-wider text-primary-800 mb-6">
        猫咪执行流程
      </p>
      
      {/* 流水线视图 */}
      <div className="flex items-start justify-center gap-3 overflow-x-auto pb-2">
        {planSteps.map((step, i) => {
          const label = labelForPlanStep(step, i, catNameById);
          const isCompleted = completedSteps.includes(i);
          const isCurrent = running && pulseIdx === i;
          const isPending = !isCompleted && !isCurrent;
          
          return (
            <React.Fragment key={`${step.stepId ?? step.agentId ?? "s"}-${i}`}>
              {/* 单个节点 */}
              <div className="flex flex-col items-center gap-2 min-w-[90px]">
                {/* 对话气泡 - 仅在执行中显示 */}
                {isCurrent && (
                  <div className="relative mb-1 px-3 py-1.5 rounded-lg bg-white border border-primary-200 shadow-sm animate-pulse">
                    <span className="text-[10px] font-bold text-primary-700">执行中...</span>
                    {/* 气泡尖角 */}
                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-white border-b border-r border-primary-200 rotate-45" />
                  </div>
                )}
                
                {/* 猫猫节点 */}
                <div
                  className={`relative flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all duration-300 ${
                    isCurrent
                      ? "border-primary-500 bg-white shadow-lg scale-105"
                      : isCompleted
                        ? "border-primary-300 bg-white/90"
                        : "border-border bg-surface/60 opacity-70"
                  }`}
                >
                  {/* 猫猫图标 */}
                  <div className={`text-3xl transition-transform ${isCurrent ? "animate-bounce" : ""}`}>
                    {isCurrent ? "🐾" : isCompleted ? "✅" : "🐱"}
                  </div>
                  
                  {/* 名字 */}
                  <span className="text-[11px] font-black text-text-primary text-center leading-tight">
                    {label}
                  </span>
                  
                  {/* 状态指示 */}
                  {isCurrent && (
                    <div className="flex items-center gap-1 mt-1">
                      <Loader2 className="w-3 h-3 text-primary-600 animate-spin" strokeWidth={2.5} />
                      <span className="text-[9px] font-bold text-primary-600">运行中</span>
                    </div>
                  )}
                  {isCompleted && (
                    <span className="text-[9px] font-semibold text-primary-600 mt-1">已完成</span>
                  )}
                  {isPending && (
                    <span className="text-[9px] font-semibold text-text-tertiary mt-1">等待中</span>
                  )}
                  
                  {/* 进度条 - 仅当前执行步骤显示 */}
                  {isCurrent && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary-100 rounded-b-2xl overflow-hidden">
                      <div className="h-full bg-primary-500 animate-[progress_2s_ease-in-out_infinite]" />
                    </div>
                  )}
                </div>
              </div>
              
              {/* 箭头连线 */}
              {i < planSteps.length - 1 && (
                <div className="flex items-center pt-8">
                  <ChevronRight
                    className={`w-5 h-5 shrink-0 transition-colors ${
                      isCompleted ? "text-primary-500" : "text-border"
                    }`}
                    strokeWidth={3}
                  />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
      
      <p className="text-center text-[11px] text-text-secondary font-medium mt-6">
        流程按顺序接力，完成后将展示生成结果
      </p>
      
      <style>{`
        @keyframes progress {
          0% { width: 0%; }
          100% { width: 100%; }
        }
      `}</style>
    </div>
  );
}

export default function ResultCanvas({
  workflowName,
  userPrompt,
  displayRun,
  isSubmitting,
  waitingForRunRecord,
  planSteps,
  catNameById,
}: {
  workflowName: string;
  userPrompt: string;
  displayRun: WorkflowRun | null;
  isSubmitting: boolean;
  /** 已提交但尚未在列表里匹配到本轮 run */
  waitingForRunRecord: boolean;
  planSteps: PlanStep[];
  catNameById: Record<string, string>;
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

  const resultHeadline = failed
    ? failedStep?.summary || "执行未全部成功"
    : lastStep?.summary ||
      (steps.length ? "已完成全部步骤" : "");

  /** 检测最后一步是否为 HTML 页面类型 */
  const htmlPageData = useMemo(() => {
    if (!lastStep || failed) return null;
    if (lastStep.resultType === 'html-page' && lastStep.resultData) {
      return lastStep.resultData;
    }
    // 兼容：summary 以 <!DOCTYPE 或 <html 开头
    const s = (lastStep.summary || '').trim();
    if (s.startsWith('<!DOCTYPE') || s.startsWith('<html')) return s;
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

      <header className="relative z-10 px-5 pt-5 pb-3 border-b border-border/80 bg-surface/80 backdrop-blur-sm">
        <h2 className="text-sm font-black tracking-tight text-text-primary">
          创作画布
        </h2>
        <p className="text-[11px] text-text-tertiary font-semibold mt-0.5">
          {workflowName || "当前能力"}
        </p>
      </header>

      <div className="relative z-10 flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {userPrompt.trim() ? (
          <section className="rounded-2xl border border-primary-200/80 bg-primary-50/50 px-3 py-2.5">
            <p className="text-[10px] font-bold text-primary-800 uppercase tracking-wide mb-1">
              本次需求
            </p>
            <p className="text-sm font-medium text-text-primary leading-relaxed whitespace-pre-wrap">
              {userPrompt.trim()}
            </p>
          </section>
        ) : null}

        {isSubmitting ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <Loader2
              className="w-9 h-9 text-primary-500 animate-spin"
              strokeWidth={2}
            />
            <p className="text-sm font-bold text-text-secondary">正在提交任务…</p>
          </div>
        ) : null}

        {!isSubmitting && waitingForRunRecord && !displayRun ? (
          <div className="space-y-4">
            <div className="flex flex-col items-center justify-center gap-3 py-6 text-center">
              <Loader2
                className="w-10 h-10 text-primary-500 animate-spin"
                strokeWidth={2}
              />
              <p className="text-sm font-bold text-text-secondary">
                正在创建运行记录…
              </p>
            </div>
            <CatExecutionFlow
              planSteps={planSteps}
              catNameById={catNameById}
              running
              steps={[]}
            />
          </div>
        ) : null}

        {/* 执行中：主区域只展示可视化流程，不展示步骤列表 */}
        {!isSubmitting &&
        displayRun &&
        inProgress ? (
          <CatExecutionFlow
            planSteps={planSteps}
            catNameById={catNameById}
            running
            steps={steps}
          />
        ) : null}

        {/* 已结束：结果为主，执行过程收入折叠 */}
        {!isSubmitting && displayRun && !inProgress ? (
          <section className="space-y-3">
            {/* HTML 页面预览 */}
            {htmlPageData ? (
              <div className="rounded-2xl border border-primary-200/80 bg-white/90 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2 border-b border-border/60 bg-surface-secondary/30">
                  <p className="text-[10px] font-black uppercase tracking-wide text-text-tertiary">
                    网页预览
                  </p>
                  <span className="text-[10px] font-bold text-primary-600">
                    HTML · {htmlPageData.length} 字符
                  </span>
                </div>
                <iframe
                  srcDoc={htmlPageData}
                  sandbox="allow-scripts allow-same-origin"
                  className="w-full border-0"
                  style={{ minHeight: "min(60vh, 520px)", height: "60vh" }}
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
                        ? labelForPlanStep(
                            plan,
                            s.index ?? i,
                            catNameById,
                          )
                        : null;
                      const ok =
                        s.success !== false && s.status !== "error";
                      const Icon = ok ? CheckCircle2 : XCircle;
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
                              {s.skillId ? (
                                <span className="text-[10px] font-bold text-text-tertiary">
                                  {s.skillId}
                                </span>
                              ) : null}
                            </div>
                            {s.action ? (
                              <p className="text-[11px] text-text-secondary font-medium mt-1 line-clamp-4">
                                {s.action}
                              </p>
                            ) : null}
                            {s.summary ? (
                              <p className="text-xs text-text-tertiary font-medium mt-1.5 leading-snug">
                                {s.summary}
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

            <footer className="flex flex-wrap gap-3 text-[11px] font-bold text-text-tertiary">
              <span>
                状态{" "}
                <span
                  className={
                    displayRun.status === "success"
                      ? "text-primary-600"
                      : displayRun.status === "failed"
                        ? "text-danger-500"
                        : "text-text-primary"
                  }
                >
                  {displayRun.status}
                </span>
              </span>
              {displayRun.totalDuration != null ? (
                <span>耗时 {displayRun.totalDuration}s</span>
              ) : null}
            </footer>
          </section>
        ) : null}
      </div>
    </div>
  );
}

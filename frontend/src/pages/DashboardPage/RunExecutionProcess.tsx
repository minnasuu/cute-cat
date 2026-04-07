import { CheckCircle2, ChevronRight, XCircle } from "lucide-react";
import type { PlanStep, WorkflowRunStep } from "./workbenchTypes";

export function normalizeRunSteps(raw: unknown): WorkflowRunStep[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as WorkflowRunStep[];
  return [];
}

export function sortedRunSteps(steps: WorkflowRunStep[]): WorkflowRunStep[] {
  return [...steps].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
}

export function labelForPlanStep(
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

export function stepDisplayTextForRunStep(
  s: WorkflowRunStep | null | undefined,
): string {
  if (!s) return "";
  if (s.resultType && s.resultData) return s.resultData;
  return s.summary ?? "";
}

const summaryBase =
  "cursor-pointer list-none flex items-center justify-between gap-2 hover:bg-surface/80 transition-colors [&::-webkit-details-marker]:hidden font-black text-text-secondary";

/** 可折叠的步骤列表（历史卡片 / 右侧画布共用） */
export function RunExecutionProcessDetails({
  steps,
  planSteps,
  catNameById,
  compact,
}: {
  steps: WorkflowRunStep[];
  planSteps: PlanStep[];
  catNameById: Record<string, string>;
  /** 左侧历史卡片：更紧凑 */
  compact?: boolean;
}) {
  if (steps.length === 0) return null;
  const detailsClass = compact
    ? "group rounded-xl border border-border bg-surface-secondary/50 overflow-hidden"
    : "group rounded-2xl border border-border bg-surface-secondary/40 overflow-hidden";
  const summaryClass = compact
    ? `${summaryBase} px-3 py-2 text-[11px]`
    : `${summaryBase} px-4 py-3 text-xs`;
  const pad = compact ? "px-3 pb-3 pt-0" : "px-4 pb-4 pt-0";
  const olMt = compact ? "mt-2" : "mt-3";
  const liPb = compact ? "pb-3" : "pb-4";
  const liPl = compact ? "pl-3 ml-1.5" : "pl-4 ml-2";
  const dotLeft = compact ? "-left-[7px]" : "-left-[9px]";
  const dotSize = compact ? "w-[13px] h-[13px]" : "w-[14px] h-[14px]";
  const iconSize = compact ? "w-3 h-3" : "w-3.5 h-3.5";
  const titleText = compact ? "text-[11px]" : "text-xs";
  const bodyText = compact ? "text-[11px] mt-1 max-h-40" : "text-xs mt-1.5 max-h-48";
  return (
    <details className={detailsClass}>
      <summary className={summaryClass}>
        <span>{compact ? "查看执行过程" : "查看执行过程（已收起）"}</span>
        <ChevronRight className="w-4 h-4 shrink-0 transition-transform group-open:rotate-90 text-text-tertiary" />
      </summary>
      <div className={`${pad} border-t border-border/60`}>
        <ol className={`space-y-0 ${olMt}`}>
          {steps.map((s, i) => {
            const plan = planSteps[s.index ?? i];
            const catLabel = plan
              ? labelForPlanStep(plan, s.index ?? i, catNameById)
              : null;
            const ok = s.success !== false && s.status !== "error";
            const Icon = ok ? CheckCircle2 : XCircle;
            const stepOut = stepDisplayTextForRunStep(s);
            return (
              <li
                key={`${s.index}-${i}`}
                className={`flex gap-3 ${liPb} last:pb-0 border-l border-border ${liPl} relative`}
              >
                <span
                  className={`absolute ${dotLeft} top-0.5 ${dotSize} rounded-full bg-surface border border-border flex items-center justify-center`}
                >
                  <Icon
                    className={`${iconSize} ${ok ? "text-primary-600" : "text-danger-500"}`}
                    strokeWidth={2}
                  />
                </span>
                <div className="min-w-0 flex-1 pt-0">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span
                      className={`${titleText} font-black text-text-primary`}
                    >
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
                    <p
                      className={`${bodyText} text-text-tertiary font-medium leading-snug whitespace-pre-wrap break-words overflow-y-auto`}
                    >
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
  );
}

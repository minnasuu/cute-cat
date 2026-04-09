import type { WorkflowRow, WorkbenchPayload, WorkflowRun } from "./workbenchTypes";

/**
 * 轮询 workbench 时若 cats/workflows 等未变则复用上一帧引用，避免子树（如流水线气泡动画）因引用抖动反复 reset。
 * runs 按 id 合并：状态与 steps 序列化一致时复用原 run 对象，减少 displayRun / steps 引用抖动。
 */
export function mergeQuietWorkbenchRefresh(
  prev: WorkbenchPayload | null,
  next: WorkbenchPayload,
): WorkbenchPayload {
  if (!prev) return next;
  const merged: WorkbenchPayload = { ...next };
  try {
    if (JSON.stringify(prev.cats) === JSON.stringify(next.cats)) {
      merged.cats = prev.cats;
    }
    if (JSON.stringify(prev.workflows) === JSON.stringify(next.workflows)) {
      merged.workflows = prev.workflows;
    }
    if (JSON.stringify(prev.aiStats) === JSON.stringify(next.aiStats)) {
      merged.aiStats = prev.aiStats;
    }
    if (JSON.stringify(prev.counts) === JSON.stringify(next.counts)) {
      merged.counts = prev.counts;
    }
    merged.runs = mergeRunsStable(prev.runs, next.runs);
  } catch {
    /* 使用 next 全量 */
  }
  return merged;
}

function mergeRunsStable(
  prevRuns: WorkflowRun[] | undefined,
  nextRuns: WorkflowRun[],
): WorkflowRun[] {
  if (!prevRuns?.length) return nextRuns;
  return nextRuns.map((nr) => {
    const pr = prevRuns.find((r) => r.id === nr.id);
    if (!pr) return nr;
    if (
      pr.status === nr.status &&
      pr.completedAt === nr.completedAt &&
      pr.totalDuration === nr.totalDuration &&
      JSON.stringify(pr.steps) === JSON.stringify(nr.steps)
    ) {
      return pr;
    }
    return nr;
  });
}

export function parseSteps(
  steps: unknown,
): Array<{
  agentId?: string;
  stepId?: string;
}> {
  if (Array.isArray(steps)) return steps;
  if (typeof steps === "string") {
    try {
      const p = JSON.parse(steps);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** 官方种子工作流（工作台内置能力，如：落地页/海报/品牌气质卡） */
export function isOfficialWorkflow(w: WorkflowRow): boolean {
  if (w.name === "落地页" || w.name === "海报制作" || w.name === "品牌气质卡") return true;
  return parseSteps(w.steps).some((s) =>
    s.stepId === "wpb_arch" ||
    s.stepId === "poster_brand" ||
    s.stepId === "brandkit_brief",
  );
}

/** 对用户展示的功能名（不强调后端工作流概念） */
export function featureLabel(w: WorkflowRow): string {
  // 产品侧展示名收口：避免用户误以为会生成“全站/多页”
  if (w.name === "落地页") return "落地页（完整单页）";
  return w.name;
}

/** 功能卡片副文案 */
export function featureBlurb(w: WorkflowRow): string {
  const d = (w.description || "").trim();
  return d.length > 36 ? `${d.slice(0, 34)}…` : d || "描述需求即可开始";
}

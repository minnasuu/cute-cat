import type { WorkflowRow } from "./workbenchTypes";

export function parseSteps(
  steps: unknown,
): Array<{ agentId?: string; skillId?: string; stepId?: string }> {
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

/** 官方种子工作流（当前产品即网页制作流水线，含 stepId wpb_arch） */
export function isOfficialWorkflow(w: WorkflowRow): boolean {
  if (w.name === "网页制作流水线") return true;
  return parseSteps(w.steps).some((s) => s.stepId === "wpb_arch");
}

/** 对用户展示的功能名（不强调后端工作流概念） */
export function featureLabel(w: WorkflowRow): string {
  if (isOfficialWorkflow(w)) return "网页制作";
  const n = w.name.replace(/流水线\s*$/u, "").trim();
  return n || "创作";
}

/** 功能卡片副文案 */
export function featureBlurb(w: WorkflowRow): string {
  if (isOfficialWorkflow(w)) {
    return "从需求到页面，多角色接力";
  }
  const d = (w.description || "").trim();
  return d.length > 36 ? `${d.slice(0, 34)}…` : d || "描述需求即可开始";
}

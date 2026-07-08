// @ts-nocheck
import type { SkillArticle } from "../types/skill";
import { SKILL_PHASE_META } from "../types/skill";

export function skillHintsFor(
  prompt: string,
  all: SkillArticle[],
  opts: { n?: number; categoryBoost?: Record<string, number> } = {},
): string {
  const n = opts.n ?? 2;
  const catBoost = opts.categoryBoost ?? {};
  const tokens = new Set(prompt.toLowerCase().split(/[\s,;，。；#]+/));
  const scored = all
    .map((a) => {
      let s = 0;
      for (const t of a.tags) if (tokens.has(t.toLowerCase())) s += 3;
      s += (catBoost[a.category] ?? 0);
      s += (a.pinned ? 2 : 0);
      if (tokens.has(a.category)) s += 1;
      return { a, s };
    })
    .filter(({ s }) => s > 0)
    .sort((x, y) => y.s - x.s)
    .slice(0, n);
  if (scored.length === 0) return "";
  const blocks = scored
    .map(({ a }) => {
      const phaseMeta = SKILL_PHASE_META[a.category as keyof typeof SKILL_PHASE_META];
      const phaseLabel = phaseMeta ? `${phaseMeta.labelZh}(${phaseMeta.labelEn})` : a.category;
      const head = `[Knowledge · ${phaseLabel}] ${a.zhTitle} — ${a.title}`;
      const body = a.systemHint ?? a.body.slice(0, 300);
      return `### ${head}\n${body}`;
    })
    .join("\n\n");
  return ["## House knowledge (use these rules in your reply)", blocks].join("\n\n");
}

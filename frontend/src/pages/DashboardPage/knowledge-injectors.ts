/**
 * knowledge-injectors —— 把「资源 + 知识底座」按相关性注入 chat 的 system prompt。
 *
 * 每个 injector(prompt, deps) → Markdown 字符串(空字符串 = 无匹配)。
 * 调用方在发送 chat 前聚合 injectors 结果,拼到 AI 的 system prompt。
 *
 * 相关性打分复用 skill-hints 的「tag 匹配 + pinned 加权 + 类别 boost」,
 * 扩展到 asset/material/inspiration 三种资源。
 */

import { skillHintsFor } from "../LaisseAncie/lib/skill-hints";
import type { VisualAsset } from "../LaisseAncie/types/visual-asset";
import type { InspirationItem, MaterialRow } from "../LaisseAncie/store/resource";
import type { SkillArticle } from "../LaisseAncie/types/skill";
import type { Product } from "../LaisseAncie/types/design";

export interface BrandProfile {
  nameZh?: string;
  nameEn?: string;
  sloganZh?: string;
  sloganEn?: string;
  voice?: string[];
  audienceAgeMin?: number;
  audienceAgeMax?: number;
  priceMin?: number;
  priceMax?: number;
  cnFont?: string;
  enFont?: string;
  systemSnippet?: string;
  colors?: Array<{ bg: string; fg: string; usage?: string }>;
}

export interface KnowledgeDeps {
  skills: SkillArticle[];
  assets: VisualAsset[];
  inspirations: InspirationItem[];
  materials: MaterialRow[];
  products: Product[];
  brand?: BrandProfile;
}

type Injector = (prompt: string, deps: KnowledgeDeps) => string;

/** 技能知识注入(直接复用 skill-hints)。Boost 按 Fashion 10 phase 设定。 */
const skillInjector: Injector = (prompt, deps) =>
  skillHintsFor(prompt, deps.skills, {
    n: 2,
    categoryBoost: { "phase-03-design": 2, "phase-04-textile": 1, "phase-07-qa": 1 },
  });

/** 资产(visual assets)注入:按 title/description/tag/season 关键词匹配 */
const assetInjector: Injector = (prompt, deps) => {
  if (!deps.assets.length) return "";
  const tokens = tokenize(prompt);
  const scored = deps.assets
    .map((a) => {
      let s = 0;
      const hay = `${a.title} ${a.description ?? ""} ${(a.tags ?? []).join(" ")} ${(a.seasons ?? []).join(" ")}`.toLowerCase();
      for (const t of tokens) if (hay.includes(t)) s += 2;
      if (a.pinned) s += 3;
      return { a, s };
    })
    .filter(({ s }) => s > 0)
    .sort((x, y) => y.s - x.s)
    .slice(0, 2);
  if (!scored.length) return "";
  const blocks = scored
    .map(({ a }) => {
      const head = `[Asset · ${a.kind}] ${a.title}`;
      const body = a.description ?? a.tags?.join(", ") ?? "(no description)";
      return `### ${head}\n${body}`;
    })
    .join("\n\n");
  return `## Visual assets (reference these in your reply)\n${blocks}`;
};

/** 灵感注入:按 category/silhouette/color/brandAnalysis 匹配 */
const inspirationInjector: Injector = (prompt, deps) => {
  if (!deps.inspirations.length) return "";
  const tokens = tokenize(prompt);
  const scored = deps.inspirations
    .map((it) => {
      let s = 0;
      const hay = `${it.category ?? ""} ${it.silhouette ?? ""} ${(it.colors ?? []).join(" ")} ${it.brandAnalysis ?? ""}`.toLowerCase();
      for (const t of tokens) if (hay.includes(t)) s += 2;
      return { it, s };
    })
    .filter(({ s }) => s > 0)
    .sort((x, y) => y.s - x.s)
    .slice(0, 2);
  if (!scored.length) return "";
  const blocks = scored
    .map(({ it }) => {
      const head = `[Inspiration · ${it.category ?? "general"}] ${it.silhouette ?? ""}`;
      const body = it.brandAnalysis ?? `colors: ${(it.colors ?? []).join(", ") || "—"}`;
      return `### ${head}\n${body}`;
    })
    .join("\n\n");
  return `## Inspirations (reference these in your reply)\n${blocks}`;
};

/** 材料面料注入:按 name/composition/weight/texture/category 匹配 */
const materialInjector: Injector = (prompt, deps) => {
  if (!deps.materials.length) return "";
  const tokens = tokenize(prompt);
  const scored = deps.materials
    .map((m) => {
      let s = 0;
      const hay = `${m.name} ${m.composition ?? ""} ${m.weight ?? ""} ${m.texture ?? ""} ${m.category} ${m.code ?? ""}`.toLowerCase();
      for (const t of tokens) if (hay.includes(t)) s += 2;
      return { m, s };
    })
    .filter(({ s }) => s > 0)
    .sort((x, y) => y.s - x.s)
    .slice(0, 2);
  if (!scored.length) return "";
  const blocks = scored
    .map(({ m }) => {
      const head = `[Material · ${m.category}] ${m.name} (${m.code ?? "—"})`;
      const body = [m.composition, m.weight, m.texture].filter(Boolean).join(" · ") || m.notes || "(no detail)";
      return `### ${head}\n${body}`;
    })
    .join("\n\n");
  return `## Materials (reference these in your reply)\n${blocks}`;
};

/** 品牌资产注入:作为设计基调约束(不按相关性打分,始终注入) */
const brandInjector: Injector = (_prompt, deps) => {
  const b = deps.brand;
  if (!b) return "";
  const voice = b.voice?.length ? b.voice.join(" / ") : "优雅 · 松弛 · 乐趣";
  const lines: string[] = [
    "## Brand(baseline — every design must echo this)",
    `Brand: ${b.nameZh || "来兮·安兮"} / ${b.nameEn || "Laisse Ancie"}`,
    `Voice: ${voice}`,
    `Slogan: ${b.sloganZh || "既来之，则安之"} — ${b.sloganEn || "Come, be at ease."}`,
  ];
  if (b.audienceAgeMin != null && b.audienceAgeMax != null) lines.push(`Audience: ${b.audienceAgeMin}-${b.audienceAgeMax} 岁 · 独立自我的年轻女性`);
  if (b.priceMin != null && b.priceMax != null) lines.push(`Price band: ¥${b.priceMin} — ¥${b.priceMax}`);
  if (b.systemSnippet) lines.push(`\n${b.systemSnippet}`);
  const palette = (b.colors || []).filter((c) => c.bg && c.fg);
  if (palette.length) {
    lines.push(`Brand palette: ${palette.map((c) => `${c.bg}/${c.fg}${c.usage ? ` (${c.usage})` : ""}`).join(", ")}`);
  }
  return lines.join("\n");
};

/** 系列作品注入:按 category/colors/description 匹配 */
const productInjector: Injector = (prompt, deps) => {
  if (!deps.products.length) return "";
  const tokens = tokenize(prompt);
  const scored = deps.products
    .map((p) => {
      let s = 0;
      const hay = `${p.title} ${p.description ?? ""} ${p.category ?? ""} ${(p.colors ?? []).join(" ")} ${(p.silhouette ?? "")}`.toLowerCase();
      for (const t of tokens) if (hay.includes(t)) s += 2;
      if (p.status === "submitted") s += 1;
      return { p, s };
    })
    .filter(({ s }) => s > 0)
    .sort((x, y) => y.s - x.s)
    .slice(0, 1);
  if (!scored.length) return "";
  const blocks = scored
    .map(({ p }) => `### [Lookbook] ${p.title}\n${p.description?.slice(0, 300) ?? "(no description)"}`)
    .join("\n\n");
  return `## Lookbook pieces (reference these in your reply)\n${blocks}`;
};

function tokenize(prompt: string): Set<string> {
  return new Set(
    prompt
      .toLowerCase()
      .split(/[\s,;，。；#·、/]+/)
      .filter((t) => t.length > 1),
  );
}

/** 构建所有 injector。调用方在每次 chat 发送时遍历它们。 */
export function buildKnowledgeInjectors(deps: KnowledgeDeps): Injector[] {
  return [brandInjector, skillInjector, assetInjector, inspirationInjector, materialInjector, productInjector];
}

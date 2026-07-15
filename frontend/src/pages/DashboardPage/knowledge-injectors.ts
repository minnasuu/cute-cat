/**
 * knowledge-injectors —— 把「资源 + 知识底座」按相关性注入 chat 的 system prompt。
 *
 * 每个 injector(prompt, deps) → Markdown 字符串(空字符串 = 无匹配)。
 * 调用方在发送 chat 前聚合 injectors 结果,拼到 AI 的 system prompt。
 *
 * 设计阶段只引用:品牌(基调) + 知识库(技能) + 视觉资产 + 灵感。
 * 相关性打分复用 skill-hints 的「tag 匹配 + pinned 加权 + 类别 boost」。
 */

import { skillHintsFor } from "../LaisseAncie/lib/skill-hints";
import type { VisualAsset } from "../LaisseAncie/types/visual-asset";
import type { InspirationItem } from "../LaisseAncie/store/resource";
import type { SkillArticle } from "../LaisseAncie/types/skill";
import type { StyleRow } from "../LaisseAncie/types/design";

export interface BrandProfile {
  logo?: string | null;
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
  // materials / styles / products 保留给资源 tab / Lookbook / 材料组合自身消费,设计阶段注入已不再引用
  materials: any[];
  styles: StyleRow[];
  products: any[];
  brand?: BrandProfile;
}

type Injector = (prompt: string, deps: KnowledgeDeps) => string;

/** 技能知识注入(直接复用 skill-hints)。Boost 按 Fashion 10 phase 设定。 */
const skillInjector: Injector = (prompt, deps) =>
  skillHintsFor(prompt, deps.skills, {
    n: 2,
    categoryBoost: { "phase-03-design": 2, "phase-04-textile": 1, "phase-01-research": 1, "phase-05-visual": 1 },
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

/**
 * 灵感注入:按 category/silhouette/color/brandAnalysis + AI 分析字段(visualStyle/designApproach/inspiration)匹配。
 * visualStyle / designApproach 是单值文案,inspiration 是数组,一并纳入相关性打分。
 */
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

function tokenize(prompt: string): Set<string> {
  return new Set(
    prompt
      .toLowerCase()
      .split(/[\s,;，。；#·、/]+/)
      .filter((t) => t.length > 1),
  );
}

/**
 * 构建设计阶段要注入 chat system prompt 的 injector。
 *
 * 设计阶段引用:品牌(基调) + 知识库(技能) + 视觉资产。
 * 灵感库不再通过本 injector 注入,改为在 Composer.buildReferencesBlock 里以
 * 「品牌风格灵感池」形式整体注入(全库一行摘要 + #[ID] 标记),作为品牌风格来源。
 * 不引用材料(materials)和既有作品(products)—— 避免设计被实物/已有系列锚定,保持创意开放性。
 */
export function buildKnowledgeInjectors(deps: KnowledgeDeps): Injector[] {
  return [brandInjector, skillInjector, assetInjector];
}

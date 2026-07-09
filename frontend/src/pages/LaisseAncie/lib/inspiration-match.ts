// @ts-nocheck
/**
 * inspiration-match —— 根据用户输入,从灵感库中匹配最相关的 Top-N 张灵感图。
 *
 * 评分策略与 knowledge-injectors 一致:
 *   - tokenize 用户输入
 *   - 与每张灵感的 category / visualStyle / designApproach / inspiration / colors 做 token 命中
 *   - 命中 1 次 +2 分;pinned(置顶)加权 +3
 *   - 取分数最高的 topN 张(同分按 useCount)
 *
 * 用于设计工作台 chat「步骤 1」:用户输入主题后,先本地匹配 3 个最相关灵感作为借鉴。
 */
import type { InspirationItem } from "../store/resource";

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[\s,;，。；#·、/]+/)
      .filter((t) => t.length > 1),
  );
}

export interface MatchedInspiration extends InspirationItem {
  score: number;
}

/**
 * 匹配与用户输入最相关的灵感图。
 * @param input 用户输入的主题 / 需求
 * @param inspirations 灵感库(来自 resource store)
 * @param topN 取前几名,默认 3
 * @returns 按相关度降序的灵感数组(可能 < topN,依赖库里实际数量)
 */
export function matchInspirations(
  input: string,
  inspirations: InspirationItem[],
  topN = 3,
): MatchedInspiration[] {
  if (!input?.trim() || !inspirations.length) return [];
  const tokens = tokenize(input);

  return inspirations
    .map((it) => {
      let score = 0;
      const hay = [
        it.category ?? "",
        it.visualStyle ?? "",
        it.designApproach ?? "",
        (it.inspiration ?? []).join(" "),
        (it.colors ?? []).join(" "),
        it.silhouette ?? "",
        it.brandAnalysis ?? "",
        (it.styleFeatures ?? []).join(" "),
        (it.designHighlights ?? []).join(" "),
      ].join(" ").toLowerCase();
      for (const t of tokens) if (hay.includes(t)) score += 2;
      return { ...it, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || (b.useCount ?? 0) - (a.useCount ?? 0))
    .slice(0, topN);
}

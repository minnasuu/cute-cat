// @ts-nocheck
/**
 * inspiration-match —— 根据用户输入,从灵感库中模糊匹配最相关的 Top-N 张灵感。
 *
 * 评分策略(v2 —— 维度感知加权):
 *
 *   1. 品类簇命中(+8): 输入的 categoryCluster 与灵感 category 做同义词簇匹配
 *      「T恤」可匹配灵感 category「T-shirt 宽松扎染」
 *   2. 元素命中(+5): 输入的设计元素(字母/花卉/猫咪…)命中灵感
 *      designApproach / inspiration / designHighlights / styleFeatures
 *   3. 场景命中(+4): 输入场景(夏日/春日/节日…)命中灵感 colors / inspiration
 *   4. 精确 token 命中(+1): 旧逻辑保留(评分>1 时每个命中小写 token +1)
 *   5. pinned 加权(+3) + useCount 同分排序: 保留
 *
 * 输入可传原始字符串或已解析的 DesignIntent(避免重复 parse)。
 *
 * 例:「夏日字母印花T恤」→ categoryCluster:tshirt + 元素:lettering/print + scene:summer
 *     灵感 A「T恤 · 字母 slogan 排版」:+8(品类)+5(元素 lettering)+1(token)=14
 *     灵感 B「T恤 · 花卉水彩」:+8(品类)+5(元素 floral 与 print 无关)=13
 *     → A 排在 B 前 ✓
 *
 * 用于设计工作台 chat「步骤 1」:用户输入主题后,先本地匹配 Top-N 个最相关灵感作为借鉴。
 */
import type { InspirationItem } from "../store/resource";
import { parseDesignIntent, type DesignIntent } from "./design-intent";
import { CATEGORY_CLUSTERS } from "./design-intent";

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
  /** 调试用:哪些维度命中了 —— { category, element, scene, token} */
  matchDims?: { category?: string; element?: string; scene?: string[] };
}

/** 输入:解析 DesignIntent(若尚未解析) */
function toIntent(input: string | DesignIntent): DesignIntent {
  if (typeof input === "string") return parseDesignIntent(input);
  return input;
}

/**
 * 匹配与用户输入最相关的灵感图(模糊 / 同义词簇 / 维度加权)。
 * @param input 用户原始输入字符串,或已解析的 DesignIntent
 * @param inspirations 灵感库(来自 resource store)
 * @param topN 取前几名,默认 3
 * @returns 按相关度降序的灵感数组(可能 < topN,依赖库里实际数量)
 */
export function matchInspirations(
  input: string | DesignIntent,
  inspirations: InspirationItem[],
  topN = 3,
): MatchedInspiration[] {
  const intent = toIntent(input);
  if (!intent.raw?.trim() || !inspirations.length) return [];

  const tokens = tokenize(intent.raw);

  return inspirations
    .map((it) => {
      let score = 0;
      const dims: NonNullable<MatchedInspiration["matchDims"]> = {};

      const hayAll = [
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

      // ── 1. 品类簇命中(+8) ──
      if (intent.categoryCluster) {
        const hayCategory = [it.category ?? "", it.silhouette ?? "", it.brandAnalysis ?? ""].join(" ").toLowerCase();
        const cluster = CATEGORY_CLUSTERS.find((c) => c.id === intent.categoryCluster);
        if (cluster && cluster.aliases.some((a) => hayCategory.includes(a))) {
          score += 8;
          dims.category = cluster.id;
        }
      }

      // ── 2. 元素命中(+5 / 命中元素) ──
      // 元素 id → 关键词集合(用于子串命中灵感文本)
      const ELEMENT_KEYWORDS: Record<string, string[]> = {
        lettering: ["字", "字母", "文字", "标语", "logo", "slogan", "typography", "letter", "script", "calligraphy"],
        cat: ["猫", "猫咪", "kitty", "kitten", "喵"],
        floral: ["花", "玫瑰", "花卉", "floral", "flower", "rose", "植物", "牡丹"],
        print: ["印花", "图案", "print", "graphic", "满铺", "allover", "满地", "扎染", "迷彩"],
        embroidery: ["刺绣", "绣花", "embroider", "patch", "钩针", "编织"],
        minimal: ["极简", "纯色", "条纹", "格纹", "波点", "plain", "stripe", "check", "dot"],
        vintage: ["复古", "怀旧", "vintage", "retro", "法式", "做旧"],
        "cat-motif": ["来兮", "安兮", "laisse", "品牌猫", "miu"],
        abstract: ["抽象", "几何", "线条", "abstract", "geometric"],
        animal: ["动物", "豹纹", "蛇纹", "leopard", "zebra"],
      };
      if (intent.elements.length) {
        const matchedEls: string[] = [];
        for (const elId of intent.elements) {
          const kws = ELEMENT_KEYWORDS[elId];
          if (!kws) continue;
          if (kws.some((kw) => hayAll.includes(kw.toLowerCase()))) {
            score += 5;
            matchedEls.push(elId);
          }
        }
        if (matchedEls.length) dims.element = matchedEls.join("+");
      }

      // ── 3. 场景命中(+4) ──
      if (intent.scene.length) {
        const hayScene = [
          (it.inspiration ?? []).join(" "),
          it.brandAnalysis ?? "",
          (it.colors ?? []).join(" "),
        ].join(" ").toLowerCase();
        const matchedScene: string[] = [];
        for (const scId of intent.scene) {
          const SCENE_KEYWORDS: Record<string, string[]> = {
            summer: ["夏", "summer", "沙滩", "beach", "清爽", "海洋", "蓝", "黄"],
            spring: ["春", "spring", "樱花", "花粉", "绿", "粉"],
            autumn: ["秋", "autumn", "fall", "红", "棕", "暖"],
            winter: ["冬", "winter", "白", "雪", "冷"],
            festive: ["节", "festive", "圣诞", "春节", "红", "金"],
            everyday: ["日常", "通勤", "休闲", "casual"],
          };
          const kws = SCENE_KEYWORDS[scId] || [];
          if (kws.some((kw) => hayScene.includes(kw.toLowerCase()))) {
            score += 4;
            matchedScene.push(scId);
          }
        }
        if (matchedScene.length) dims.scene = matchedScene;
      }

      // ── 4. 精确 token 命中(+1 / token,评分>0 时才叠加) ──
      if (score > 0) {
        for (const t of tokens) {
          // 跳过品类簇已覆盖的词(避免品类词重复计分)
          if (intent.categoryCluster) {
            const cluster = CATEGORY_CLUSTERS.find((c) => c.id === intent.categoryCluster);
            if (cluster?.aliases.some((a) => a === t)) continue;
          }
          if (hayAll.includes(t)) score += 1;
        }
      }

      // ── 5. pinned 加权 ──
      if (it.pinned) score += 3;

      return { ...it, score, matchDims: score > 0 ? dims : undefined };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || (b.useCount ?? 0) - (a.useCount ?? 0))
    .slice(0, topN);
}

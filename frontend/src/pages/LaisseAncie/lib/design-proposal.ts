// @ts-nocheck
/**
 * design-proposal —— 把 AI 生成的完整设计提案文本,解析为结构化 DesignSections。
 *
 * AI 方案文本具有稳定的 Markdown 分段结构(由 DESIGNER_SYSTEM prompt 约束):
 *   ## / ### 产品名 / 主题叙述 / 灵感借鉴说明 / 材质与色彩方案 / 形态/结构/细节 / 目标价格带
 *
 * 这个模块用正则从原始文本中切分出这些维度,供 Lookbook 详情页结构化展示。
 *
 * 核心输出:parseDesignProposal(planText, recommendation?, references?) → DesignSections
 */
import type { MaterialRecommendation } from "../types/design";
import type { InspirationItem } from "../store/resource";
import type { DesignSections } from "../types/design";

/** 匹配所有 hex 颜色码(3/4/6/8 位)——自动过滤掉过短的误匹配(AA、BB 这类 ASCII) */
export function extractHexColors(text: string): string[] {
  const matches = text.match(/#[0-9A-Fa-f]{6}\b/g) || [];
  // 去重,保持顺序
  return [...new Set(matches.map((c) => c.toUpperCase()))];
}

/** 从文本中提取价格数字(¥/$ 前缀或「价格」「¥」) */
export function extractPrice(text: string): string | undefined {
  const m = text.match(/(?:目标)?(?:价格(?:带)?|price\s*band)[^¥$\d]*([¥$]?\s?\d[\d\s\-–—~.]*(?:\s*元|\s*RMB)?)/i);
  if (m?.[1]) return m[1].replace(/\s+/g, "");
  // 兜底:找最近的 ¥/$ 数字
  const m2 = text.match(/[¥$]\s?\d[\d.]*/);
  return m2 ? m2[0] : undefined;
}

/** 灵感 ID 匹配模式 */
const REF_PATTERN = /#\[([a-f0-9-]+)\]/gi;

/**
 * 解析完整设计提案文本。
 *
 * 输入:
 *   - planText: AI 生成的方案原始文本(含 ## 分段)
 *   - recommendation: 面料+配色推荐(可选,用于补色)
 *   - references: 前端匹配到的灵感数组(可选,用于补灵感 category)
 */
export function parseDesignProposal(
  planText: string,
  recommendation?: MaterialRecommendation | null,
  references?: InspirationItem[],
): DesignSections {
  if (!planText?.trim()) return {};

  // —— 区块切分(基于标题关键词) ——
  // 每个区块:该标题行到下一个标题行(或文末)之间的全部内容
  const lines = planText.split("\n");
  const sections: { key: string; text: string }[] = [];
  let currentKey = "_header";
  let currentBuf: string[] = [];

  const headingMatch = (line: string): string | null => {
    const t = line.trim();
    if (/^(产品|品名|[^#]*产品名|product\s*name)/i.test(t)) return "productName";
    if (/(主题|理念|叙述|theme|concept)/i.test(t)) return "themeNarrative";
    if (/(灵感|借鉴|参考|从\s*#\[|inspiration)/i.test(t)) return "inspirationRefs";
    if (/(材质|色彩|颜色|配色|面料|material|color|fabric|colourway)/i.test(t)) return "colorway";
    if (/(形态|结构|版型|裁剪|silhouette|版型|细节|detail|construction)/i.test(t)) return "silhouette";
    if (/(价格|price|目标价|成本)/i.test(t)) return "targetPrice";
    return null;
  };

  const flush = () => {
    if (currentKey && currentBuf.length) {
      sections.push({ key: currentKey, text: currentBuf.join("\n").trim() });
    }
  };

  for (const line of lines) {
    const h = headingMatch(line);
    if (h) {
      flush();
      currentKey = h;
      currentBuf = [line];
    } else {
      currentBuf.push(line);
    }
  }
  flush();

  const sectionText = (key: string): string =>
    sections.find((s) => s.key === key)?.text ?? "";

  // —— 组装 DesignSections ——

  // 产品名:去掉前缀 «产品名:»«产品名」等,去掉「**」标记
  const rawName = sectionText("productName").replace(/^#+\s*/, "").replace(/^[^:：]*[:：]\s*/, "").replace(/\*/g, "").trim();
  const productName = rawName.slice(0, 60);

  // 主题叙述:去掉标题行本身,取正文
  const themeNarrative = sectionText("themeNarrative").replace(/^#+\s*.*主题[^\n]*\n*/i, "").replace(/\*/g, "").trim();

  // 灵感引用:从灵感区块 + 全文中找所有 #[id] 对应的说明
  const refIds = new Set<string>();
  let m;
  const searchText = sectionText("inspirationRefs") + "\n" + planText;
  while ((m = REF_PATTERN.exec(searchText)) !== null) refIds.add(m[1]);

  const inspirationRefs = [...refIds].map((id) => {
    const ref = references?.find((r) => r.id === id);
    // 找到 id 后面的那行/段(截取 #[id] 后的 80 字符作为 summary)
    const idx = searchText.indexOf(`#[${id}]`);
    const snippet = idx !== -1
      ? searchText.slice(idx + id.length + 3, idx + id.length + 3 + 120).split("\n")[0].trim()
      : "";
    return {
      id,
      category: ref?.category ?? undefined,
      summary: snippet.replace(/^[、,，\s]*/, "").slice(0, 80) || ref?.category || "",
    };
  });

  // 色彩:从色彩区块 + 全文 extract hex + 找 PANTONE 引用
  const pantoneMatches = (sectionText("colorway") + searchText).match(/PANTONE\s+[\w\s\-]+\s*(?:TCX|TPG)?/gi) || [];
  const inlineColors = extractHexColors(sectionText("colorway") + "\n" + planText);
  const recColors = recommendation?.colors ?? [];
  const allHex = [...new Set([...inlineColors, ...recColors].map((c) => c.toUpperCase()))];

  // 材质与色彩:保留色彩区块原文作为描述
  const colorway = [{
    pantone: pantoneMatches[0]?.trim(),
    hex: allHex.slice(0, 6),
    description: sectionText("colorway").replace(/^#+\s*[^\n]*\n*/, "").replace(/\*/g, "").trim().slice(0, 280),
  }].filter((c) => c.hex.length || c.description);

  // 面料(从色彩区块中找面料相关行)
  const fabricSection = sectionText("colorway");
  const fabricLines = fabricSection.split("\n").filter((l) => /面料|材质|fabric|纯棉|真丝|针织|羊毛|亚麻|棉|麻|毛|丝|尼龙|涤纶|氨纶|天丝|莫代尔/.test(l));
  const fabric = fabricLines.length
    ? fabricLines.map((l) => ({
        name: l.replace(/^[*\-\s]*/, "").replace(/\*/g, "").trim().slice(0, 40),
        description: "",
      }))
    : recommendation?.name
      ? [{ name: recommendation.name, composition: recommendation.composition, description: recommendation.texture || "" }]
      : undefined;

  // 形态 / 结构 / 细节
  const silhouetteRaw = sectionText("silhouette").replace(/^#+\s*[^\n]*\n*/, "").replace(/\*/g, "").trim();
  // 若未显式分段,用全文做兜底(取灵感区块之后、价格之前)
  const silhouette = silhouetteRaw || (() => {
    const raw = planText;
    const afterIns = raw.indexOf(sectionText("inspirationRefs").slice(0, 20));
    return afterIns !== -1 ? raw.slice(afterIns, afterIns + 300).replace(/\*/g, "").trim().split("\n").slice(0, 6).join(" ").slice(0, 200) : "";
  })();

  // 价格
  const targetPrice = extractPrice(sectionText("targetPrice")) || extractPrice(planText);

  return {
    productName: productName || undefined,
    themeNarrative: themeNarrative || undefined,
    inspirationRefs: inspirationRefs.length ? inspirationRefs : undefined,
    colorway: colorway.length ? colorway : undefined,
    fabric,
    silhouette: silhouette || undefined,
    targetPrice,
    rawPlan: planText.trim(),
  };
}

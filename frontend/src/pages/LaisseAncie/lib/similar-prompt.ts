// @ts-nocheck
/**
 * similar-prompt —— 把一张灵感的信息整理为「制作相似」的设计提示。
 *
 * 整理规则(硬约束):
 *   - 只用: category(品类) / visualStyle(风格) / designApproach(设计思路) / inspiration[](启发)
 *   - 不用: colors(结构化色板) / brandAnalysis(品牌分析) —— 整段不出现
 *   - 轻度颜色词清洗:剥除 hex 码 + 常见具体颜色词(中/英),风格语义词(复古/法式/极简…)不动
 *
 * 输出为可读自然段落,供填入单品设计工作台输入框由用户审阅后发送。
 */

/** 具体颜色词(中/英)。只扣「具体颜色」,不动风格语义词(复古/港风/做旧/水洗/极简/撞色…) */
const COLOR_WORDS = [
  // 中文基础色 + 常见具体色名
  "红色", "橙色", "黄色", "绿色", "蓝色", "紫色", "粉色", "黑色", "白色",
  "灰色", "棕色", "金色", "银色", "米色", "卡其", "藏青", "酒红", "墨绿",
  "靛蓝", "天蓝", "湖蓝", "翠绿", "碧绿", "墨蓝", "藏蓝", "肉色", "驼色",
  "栗色", "酱色", "琥珀", "象牙", "杏色", "藕色", "裸色", "彩度", "撞色",
  "大地色", "马卡龙色", "莫兰迪色",
  // 英文基础色 + 常见具体色名
  "red", "orange", "yellow", "green", "blue", "purple", "pink", "black",
  "white", "grey", "gray", "brown", "gold", "golden", "silver", "beige",
  "khaki", "navy", "cyan", "indigo", "maroon", "burgundy", "teal", "turquoise",
  "coral", "salmon", "ivory", "cream", "camel", "charcoal", "olive", "mint",
  "lavender", "mauve", "peach", "ruby", "emerald", "sapphire", "amber",
];

// 具体颜色词正则(整词匹配、不区分大小写)。用单词/中文边界避免误伤风格词。
const COLOR_WORD_RE = new RegExp(
  "\\b(" + COLOR_WORDS.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")\\b",
  "gi",
);
// hex 色值 #RGB / #RRGGBB / #RRGGBBAA
const HEX_RE = /#([0-9a-fA-F]{3,8})\b/g;

/** 对单段 free-text 做轻度颜色清洗(剥 hex + 具体颜色词),再折叠空白 */
function scrubColors(text: string): string {
  return text
    .replace(HEX_RE, " ")
    .replace(COLOR_WORD_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clean(s: string | null | undefined): string {
  return scrubColors((s || "").trim());
}

/**
 * 把灵感整理为设计提示。
 * @param a 灵感对象只需 category/visualStyle/designApproach/inspiration 四项
 * @returns 整理后的自然段落;若四项全空则返回空字符串
 */
export function buildSimilarPrompt(a: {
  category?: string | null;
  visualStyle?: string | null;
  designApproach?: string | null;
  inspiration?: string[] | null;
}): string {
  const parts: string[] = [];

  const category = (a.category || "").trim();
  if (category) parts.push(`参考品类:${category}`);

  const styleBits = [clean(a.visualStyle), clean(a.designApproach)].filter(Boolean);
  if (styleBits.length) parts.push(`风格与思路:${styleBits.join("；")}`);

  const hints = (a.inspiration || []).map(clean).filter(Boolean);
  if (hints.length) parts.push(`设计启发:${hints.join("；")}`);

  return parts.join("\n");
}

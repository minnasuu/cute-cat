// @ts-nocheck
/**
 * design-intent —— 把用户自然语言输入,结构化解析为「设计意图」。
 *
 * 输出 DesignIntent 包含:
 *   - category: 原始品类关键词(用于展示)
 *   - categoryCluster: 品类簇 id,如 'tshirt' / 'dress' / 'bag'(同义词归一)
 *   - elements: 设计元素 id 列表,如 ['lettering', 'floral', 'cat']
 *   - scene: 场景 / 季节 id 列表,如 ['summer']
 *   - mode: 大类(clothing / bag / accessory / home / stationery / illustration)
 *
 * 例:「夏日字母印花T恤」→ {
 *   category: 'T恤',
 *   categoryCluster: 'tshirt',
 *   elements: ['lettering', 'print'],
 *   scene: ['summer'],
 *   mode: 'clothing',
 * }
 *
 * 注:同义词表和元素表放在这里集中维护,后续新增品类/元素只需改数据。
 */

// ── 品类同义词簇 ──────────────────────────────────────────────
export interface CategoryCluster {
  id: string;
  label: string;           // 中文展示名
  aliases: string[];       // 中/英文同义词(小写匹配)
  mode: DesignMode;        // 所属大类
}

export type DesignMode = "clothing" | "bag" | "accessory" | "home" | "stationery" | "illustration";

export const CATEGORY_CLUSTERS: CategoryCluster[] = [
  // 上衣
  { id: "tshirt",     label: "T恤/上衣",   aliases: ["t恤", "t-shirt", "tee", "短袖", "长袖", "上衣", "top", "棉毛衫", "polo", "卫衣", "hoodie"], mode: "clothing" },
  { id: "shirt",      label: "衬衫",       aliases: ["衬衫", "衬衣", "shirt", "blouse"], mode: "clothing" },
  { id: "blazer",     label: "西装/外套",  aliases: ["西装", "外套", "blazer", "jacket", "外套", "战袍"], mode: "clothing" },
  // 裙裤
  { id: "dress",      label: "连衣裙",     aliases: ["连衣裙", "dress", "吊带裙", "midi", "长裙"], mode: "clothing" },
  { id: "skirt",      label: "半裙",       aliases: ["半裙", "短裙", "半身裙", "skirt", "皮裙"], mode: "clothing" },
  { id: "pants",      label: "裤装",       aliases: ["裤", "长裤", "短裤", "pants", "trousers", "牛仔裤", "jeans", "legging"], mode: "clothing" },
  // 包袋
  { id: "bag",        label: "包袋",       aliases: ["包", "tote", "handbag", "托特", "挎包", "手袋", "背包", "backpack", "钱包", "wallet", "clutch"], mode: "bag" },
  // 配饰
  { id: "jewelry",    label: "首饰/配饰",  aliases: ["首饰", "项链", "戒指", "耳环", "手链", "jewelry", "necklace", "ring", "手链", "bracelet", "胸针", "brooch"], mode: "accessory" },
  { id: "hat",        label: "帽子",       aliases: ["帽", "帽子", "hat", "cap", "报童帽", "贝雷帽", "beret"], mode: "accessory" },
  { id: "scarf",      label: "围巾",       aliases: ["围巾", "头巾", "丝巾", "scarf", "披肩", "shawl"], mode: "accessory" },
  { id: "shoes",      label: "鞋履",       aliases: ["鞋", "鞋履", "靴子", "拖鞋", "shoes", "boots", "sneaker", "高跟", "跟鞋"], mode: "accessory" },
  // 家居
  { id: "home",       label: "家居",       aliases: ["抱枕", "香薰", "餐具", "花瓶", "cushion", "candle", "vase", "mug", "杯", "家居", "毯", "towel"], mode: "home" },
  // 文创
  { id: "stationery", label: "文创",       aliases: ["明信片", "贴纸", "手账", "本子", "手机壳", "sticker", "postcard", "phone case", "文创", "胶带", "鼠標墊", "書籤", "book"], mode: "stationery" },
  // 其他
  { id: "jewelry-wearable", label: "穿戴配饰", aliases: ["发箍", "发夹", "发卡", "hair", "领结", "领带", "tie", "腰带", "belt"], mode: "accessory" },
];

// ── 设计元素 ──────────────────────────────────────────────────
export interface ElementToken {
  id: string;       // 标识符
  label: string;    // 中文说明
  match: RegExp;    // 匹配正则(中文 + 英文关键词)
}

export const ELEMENT_TOKENS: ElementToken[] = [
  { id: "lettering",  label: "字母/文字/标语", match: /字|字母|文字|标语|logo|slogan|typography|letter|calligraphy|hand.?lettered|script/i },
  { id: "cat",        label: "猫咪",            match: /猫|猫咪|kitty|kitten|pussy/i },
  { id: "floral",     label: "花卉/植物",      match: /花|玫瑰|花卉|floral|flower|rose|植物|leaf|叶| botanical|peony|牡丹/i },
  { id: "print",      label: "印花/图案",      match: /印花|图案|print|graphic|满铺|all.?over|满地|满地印|扎染|tie.?dye|迷彩|camo/i },
  { id: "embroidery", label: "刺绣/工艺",      match: /刺绣|绣花|embroider|贴布|patch|手工|手缝|钩针|编织|knit/i },
  { id: "minimal",    label: "极简/纯色",      match: /极简|纯色|minimal|plain|条纹|stripe|格纹|check|波点|dot/i },
  { id: "vintage",    label: "复古/怀旧",      match: /复古|怀旧|vintage|retro|港式|法式|港风|做旧|水洗|washed/i },
  { id: "cat-motif",  label: "Laisse 猫咪",    match: /来兮|安兮|laisse|品牌猫|logo.?cat|immo|miu/i },
  { id: "abstract",   label: "抽象/几何",      match: /抽象|几何|线条|abstract|geometric|线条|线描|dotwork/i },
  { id: "animal",     label: "动物纹样",        match: /动物|豹纹|蛇纹|斑马|animal|leopard|zebra| snake/i },
];

// ── 场景 / 季节 ───────────────────────────────────────────────
export interface SceneToken {
  id: string;
  label: string;
  match: RegExp;
}

export const SCENE_TOKENS: SceneToken[] = [
  { id: "summer",   label: "夏日",   match: /夏|夏日|夏天|summer|沙滩|度假|beach/i },
  { id: "spring",   label: "春日",   match: /春|春日|春天|spring|樱花/i },
  { id: "autumn",   label: "秋日",   match: /秋|秋日|秋天|autumn|fall/i },
  { id: "winter",   label: "冬日",   match: /冬|冬日|冬天|winter|圣诞|过年/i },
  { id: "festive",  label: "节日/特别", match: /春|春节|新年|情人节|圣诞|节日|festive|跨年|万圣|halloween/i },
  { id: "everyday", label: "日常/通勤", match: /日常|通勤|上班|休闲|casual|周末|weekend/i },
];

// ── 输出类型 ──────────────────────────────────────────────────
export interface DesignIntent {
  raw: string;                        // 用户原始输入
  category: string | null;           // 原始品类关键词
  categoryCluster: string | null;    // 品类簇 id(归一后)
  elements: string[];                // 设计元素 id 列表
  scene: string[];                   // 场景 id 列表
  mode: DesignMode;                  // 大类
}

/**
 * 解析用户输入为结构化设计意图。
 * 无匹配时 category / categoryCluster 为 null,但 elements / scene 仍尝试匹配。
 */
export function parseDesignIntent(raw: string): DesignIntent {
  const text = (raw || "").trim();
  if (!text) return { raw, category: null, categoryCluster: null, elements: [], scene: [], mode: "illustration" };

  // ── 1. 品类匹配:找最长命中(「T恤」比「上衣」更精确) ──
  let bestCluster: CategoryCluster | null = null;
  let bestCategoryKw = "";
  for (const cluster of CATEGORY_CLUSTERS) {
    for (const alias of cluster.aliases) {
      if (text.toLowerCase().includes(alias) && alias.length > bestCategoryKw.length) {
        bestCluster = cluster;
        bestCategoryKw = alias;
      }
    }
  }

  // ── 2. 元素匹配 ──
  const elements: string[] = [];
  for (const el of ELEMENT_TOKENS) {
    if (el.match.test(text)) elements.push(el.id);
  }

  // ── 3. 场景匹配 ──
  const scene: string[] = [];
  for (const sc of SCENE_TOKENS) {
    if (sc.match.test(text)) scene.push(sc.id);
  }

  // ── 4. 大类推定:有品类簇直接用;没有但有「配饰/家居/文创」词推定;否则 clothing ──
  let mode: DesignMode = "clothing";
  if (bestCluster) {
    mode = bestCluster.mode as DesignMode;
  } else if (/插画|主视觉|illustration|海报|封面/i.test(text)) {
    mode = "illustration";
  }

  return {
    raw: text,
    category: bestCategoryKw || null,
    categoryCluster: bestCluster?.id ?? null,
    elements,
    scene,
    mode,
  };
}

/** 快捷判定:意图是否包含「字母/文字/标语」元素 */
export function hasLetteringElement(intent: DesignIntent): boolean {
  return intent.elements.includes("lettering");
}

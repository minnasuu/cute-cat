export type DesignMode = "illustration" | "single" | "material-combo" | "style-mutate" | "outfit-styling" | "occasion" | "regular-generate";

export const MODE_LABEL: Record<DesignMode, string> = {
  illustration:  "插画作品",
  single:        "灵感扩散",
  "material-combo": "材料组合",
  "style-mutate": "款式裂变",
  "outfit-styling": "穿搭效果",
  occasion:      "节日系列",
  "regular-generate": "常规生图",
};
export const MODE_HINT: Record<DesignMode, string> = {
  illustration:  "为 Lookbook / 印花 / 主视觉 / 包装等输出的原创图形作品。可同步存入视觉资产库。",
  single:        "围绕单件产品的灵感扩散：chat 汲取灵感库 → 方案 → 线稿 → 选材料 → 成图。",
  "material-combo": "固定输入(名称 + 面料图 + 款式参考 + 描述),AI 结合品牌信息自动出白底效果图。",
  "style-mutate": "钉死一张母款,沿廓形 / 领型 / 袖长 / 长短 / 细节轴裂变多张子款白底图。",
  "outfit-styling": "从 Lookbook 选 1-5 款单品 + 品牌/系统模特库选 1 张模特图,生成模特穿搭效果图。",
  occasion:      "围绕特定节日（春节、情人节、圣诞）按主题对齐的产品系列。",
  "regular-generate": "最轻量的通用生图入口:文生图 / 参考图生图 → 1–4 张白底产品图,可存入任意素材库。",
};

export type ProductStatus =
  | "draft" | "submitted" | "proto1" | "proto1_done"
  | "proto2" | "proto2_done" | "bulk" | "bulk_done"
  | "finished" | "pending_list" | "live";

export const STATUS_LABEL: Record<ProductStatus, string> = {
  draft:         "草稿",
  submitted:     "已录入 Lookbook",
  proto1:        "第 1 次打样中",
  proto1_done:   "第 1 次打样完成",
  proto2:        "第 2 次打样中",
  proto2_done:   "第 2 次打样完成",
  bulk:          "大货生产",
  bulk_done:     "大货交货",
  finished:      "成品确认",
  pending_list:  "待上架",
  live:          "已上架",
};

export const STATUS_FLOW: ProductStatus[] = [
  "draft","submitted","proto1","proto1_done","proto2","proto2_done",
  "bulk","bulk_done","finished","pending_list","live",
];

export interface StatusLogEntry {
  id: string;
  status: ProductStatus;
  at: string;
  actor: string;
  note?: string;
  attachments?: string[];
}

/**
 * 设计工作流生成的一张图片(录入 Lookbook 时存入 Product.images)。
 * 三种角色由 slot 区分(详见 lib/imageRole):
 *   "main"    — 主图(至多一张,封面首选);用户上传默认主图,可与效果图互换
 *   "lineart" — 线稿(灵感扩散专属,不参与主图互换)
 *   其余(final/material-combo/editorial/flat/render/...) — 效果图(AI 生成)
 */
export interface ProductImage {
  slot: string;
  label: string;
  url: string;
  /** AI 生成时的原图(URL),前端展示用压缩后的 url,下载时取 originalUrl */
  originalUrl?: string | null;
}

/** 生成图(single image)的库来源:款式图 / 面料图(仅当来源为「库」时存在) */
export interface SourceRef {
  url: string;
  name: string;
}

/** 单张生成图对应的参考图来源,与 Product.images 按索引对齐。
 *  style/fabric 缺省 = 该项为上传(非库),弹窗里不展示。 */
export type ImageSourceImages = { style?: SourceRef; fabric?: SourceRef };

/** 产品穿搭效果图一项:「穿搭效果」生成后追加到参与单品的 outfits 字段 */
export interface ProductOutfitEntry {
  id: string;
  url: string;
  originalUrl?: string | null;
  /** 选中的模特(品牌/系统模特库) */
  model: { id: string; name: string; url: string };
  /** 参与该穿搭的单品列表(含自身) */
  products: { id: string; title: string; url: string }[];
  /** 备注(生成时用户填写的描述) */
  note?: string;
  createdAt: string;
}

/** 面料色卡条目(colorImages 一项);同一面料多个颜色各一张图 */
export interface ColorImageEntry {
  hex?: string;
  url?: string;
  name?: string;
}

/** 款式资源行(Resources → 款式子 tab 的条目) */
export interface StyleRow {
  id: string;
  name: string;
  category: string;
  tags?: string[];
  image?: string | null;
  /** 管理员设为共享 → 所有用户可见可用(跨 teamId) */
  shared?: boolean;
  sharedById?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 插画资源行(可印/刺绣到衣服上) */
export interface IllustrationRow {
  id: string;
  name: string;
  tags?: string[];
  image?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 服装模特资源行(品牌模特,管理员可共享进系统模特库) */
export interface ModelRow {
  id: string;
  slug?: string;
  name: string;
  /** 身高(cm) */
  height?: number | null;
  /** 体重(kg) */
  weight?: number | null;
  /** 胸围(cm) */
  bust?: number | null;
  /** 腰围(cm) */
  waist?: number | null;
  /** 臀围(cm) */
  hip?: number | null;
  /** 鞋码 */
  shoes?: number | null;
  /** 模特图片列表(URL 数组,1-5 张) */
  images?: string[];
  tags?: string[];
  /** 管理员设为共享 → 所有用户可见可用(跨 teamId) */
  shared?: boolean;
  sharedById?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** AI 推荐的材质+配色方案(线稿→推荐→成图流程写入 Lookbook) */
export interface MaterialRecommendation {
  name: string;
  category?: string;
  texture?: string;
  composition?: string;
  finish?: string;
  reason?: string;
  colors: string[];
}

export interface Product {
  id: string;
  mode: DesignMode;
  collectionId?: string;
  title: string;
  description: string;
  seasons: string[];
  category: string;
  colors: string[];
  targetPriceNum?: number;
  silhouette?: string;
  fabricId?: string;
  fabricComposition?: string;
  liningId?: string;
  liningComposition?: string;
  trimIds?: string[];
  stitchNotes?: string;
  measureTable?: string;
  gradingNotes?: string;
  patternUrl?: string;
  techPackUrl?: string;
  /** 设计工作流选定的材料 id(线稿→选材料→成图流程写入) */
  materialId?: string;
  /** AI 材料+色彩推荐快照 */
  recommendation?: MaterialRecommendation;
  /** 设计工作流生成的图片数组:[{slot, label, url}] */
  images?: ProductImage[];
  /** 遗留单图字段(迁移自 images[] 前的旧数据),作为 images 缺主图时的兜底封面 */
  imageUrl?: string | null;
  /** 生成图来源(与 images 按索引对齐):每张效果图的款式图 / 面料图(仅库来源有值)。
   *  材料组合模式专用,用于详情弹窗回溯参考图。 */
  sourceImages?: ImageSourceImages[];
  /** 穿搭效果图列表:「穿搭效果」生成后,结果图追加到每个参与单品的 outfits 中 */
  outfits?: ProductOutfitEntry[];
  /** 插画 HTML 模式:生成的自包含 HTML 文档,可在 iframe 画布渲染 */
  html?: string;
  aiDraftRaw?: string;
  /** 解析后的设计提案结构化字段(产品名/主题/灵感/材质/色彩/形态/价格) */
  sections?: DesignSections;
  status: ProductStatus;
  statusHistory: StatusLogEntry[];
  createdAt: string;
  updatedAt: string;
  tech_pack_url?: string;
}

/** 解析后的设计提案结构化字段(Lookbook 详情页分块展示) */
export interface DesignSections {
  productName?: string;          // 产品名
  themeNarrative?: string;       // 主题叙述(设计理念)
  inspirationRefs?: { id: string; category?: string; summary: string }[]; // 引用的灵感 + 借鉴说明
  colorway?: { pantone?: string; hex: string[]; description?: string }[]; // 色彩方案
  fabric?: { name: string; composition?: string; description?: string }[]; // 材质
  silhouette?: string;           // 形态 / 结构 / 版型
  targetPrice?: string;          // 目标价格带
  /** 原始完整方案文本(用于 Lookbook 一键回看) */
  rawPlan?: string;
}

export interface Collection {
  id: string;
  mode: DesignMode;
  title: string;
  occasion?: string;
  theme?: string;
  seasons: string[];
  palette: string[];
  designerNote?: string;
  createdAt?: string;
}

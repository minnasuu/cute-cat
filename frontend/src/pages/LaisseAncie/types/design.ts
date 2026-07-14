// @ts-nocheck
export type DesignMode = "illustration" | "single" | "material-combo" | "occasion";

export const MODE_LABEL: Record<DesignMode, string> = {
  illustration:  "插画",
  single:        "灵感扩散",
  "material-combo": "材料组合",
  occasion:      "专题系列",
};
export const MODE_HINT: Record<DesignMode, string> = {
  illustration:  "为 Lookbook / 印花 / 主视觉 / 包装等输出的原创图形作品。可同步存入视觉资产库。",
  single:        "围绕单件产品的灵感扩散：chat 汲取灵感库 → 方案 → 线稿 → 选材料 → 成图。",
  "material-combo": "固定输入(名称 + 面料图 + 款式参考 + 描述),AI 结合品牌信息自动出白底效果图。",
  occasion:      "围绕特定节日（春节、情人节、圣诞）按主题对齐的产品系列。",
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

/** 设计工作流生成的一张图片(录入 Lookbook 时存入 Product.images) */
export interface ProductImage {
  slot: string;
  label: string;
  url: string;
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

// @ts-nocheck
export type DesignMode = "illustration" | "single" | "collection" | "occasion";

export const MODE_LABEL: Record<DesignMode, string> = {
  illustration: "插画",
  single:       "单品",
  collection:   "系列",
  occasion:     "专题系列",
};
export const MODE_HINT: Record<DesignMode, string> = {
  illustration: "为 Lookbook / 印花 / 主视觉 / 包装等输出的原创图形作品。可同步存入视觉资产库。",
  single:       "一件面向单点穿着的具体产品。专注 silhouette · colorway · fabric。",
  collection:   "多品共有的季节想法：capsule(s), drop(s), Lookbook-as-line.",
  occasion:     "围绕特定节日（春节、情人节、圣诞）按主题对齐的产品系列。",
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
  /** 设计工作流生成的图片数组:[{slot, label, url}] */
  images?: ProductImage[];
  /** 插画 HTML 模式:生成的自包含 HTML 文档,可在 iframe 画布渲染 */
  html?: string;
  aiDraftRaw?: string;
  status: ProductStatus;
  statusHistory: StatusLogEntry[];
  createdAt: string;
  updatedAt: string;
  tech_pack_url?: string;
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

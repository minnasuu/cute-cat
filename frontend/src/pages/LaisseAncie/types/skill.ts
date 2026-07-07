// @ts-nocheck
export type SkillCategory =
  | "design" | "craft" | "fabric" | "sourcing" | "brand" | "ops";

export const SKILL_CATEGORY_META: Record<
  SkillCategory,
  { labelZh: string; labelEn: string; hint: string; icon: string }
> = {
  design:    { labelZh: "版型设计", labelEn: "Silhouette",  hint: "Silhouette libraries — proportion, block, fit study comparisons.", icon: "✎" },
  craft:     { labelZh: "工艺结构", labelEn: "Construction", hint: "Seaming, finishing, fusing — every technique that makes a garment hold up.", icon: "✂" },
  fabric:    { labelZh: "面料科学", labelEn: "Textile Science", hint: "Hand-feel, weave, weight, shrinkage, care — engineering picks.", icon: "◫" },
  sourcing:  { labelZh: "供应链",   labelEn: "Sourcing",     hint: "Factory · MOQ · lead times — hard data from real POs.", icon: "◐" },
  brand:     { labelZh: "品牌运营", labelEn: "Brand Ops",     hint: "Voice, audience, copy — making every customer-facing touch feel like the house.", icon: "◆" },
  ops:       { labelZh: "生产流程", labelEn: "Production Ops", hint: "PO · fit · FQC · shipment calendar — every checkpoint on the register.", icon: "▦" },
};

export interface SkillArticle {
  id: string;
  category: SkillCategory;
  title: string;
  zhTitle: string;
  body: string;
  tags: string[];
  relatedProducts?: string[];
  relatedMaterials?: string[];
  systemHint?: string;
  pinned?: boolean;
  createdAt: string;
  updatedAt: string;
}

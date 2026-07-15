// @ts-nocheck
/**
 * Fashion AI Studio · 技能知识库 taxonomy（服装设计 4 阶段）。
 *
 * 仅保留与服装设计直接相关的知识阶段；品牌/营销/销售等非设计阶段已移除。
 */
export type SkillPhaseId =
  | "phase-01-research"
  | "phase-03-design"
  | "phase-04-textile"
  | "phase-05-visual";

export interface SkillPhaseMeta {
  /** 阶段序号 1..4，用于排序 */
  phase: 1 | 2 | 3 | 4;
  id: SkillPhaseId;
  labelZh: string;
  labelEn: string;
  hint: string;
  icon: string;
}

export const SKILL_PHASE_META: Record<SkillPhaseId, SkillPhaseMeta> = {
  "phase-01-research": { phase: 1, id: "phase-01-research", labelZh: "时装史与流行趋势", labelEn: "Trends", hint: "时装史 / 秀场 / 流行趋势 / 色彩预测 — 所有设计的起点。", icon: "◎" },
  "phase-03-design": { phase: 2, id: "phase-03-design", labelZh: "服装结构", labelEn: "Structure", hint: "廓形 / silhouette / 结构 / 版型 / 穿法实验。", icon: "✎" },
  "phase-04-textile": { phase: 3, id: "phase-04-textile", labelZh: "纺织品与面料", labelEn: "Textile", hint: "纤维 / 织造 / 克重 / 手感 / 缩率 / 后整 / 护理。", icon: "◫" },
  "phase-05-visual": { phase: 4, id: "phase-05-visual", labelZh: "服装色彩与图案", labelEn: "Color & Pattern", hint: "配色系统 / 图案 / 印花 / 视觉叙事。", icon: "◐" },
};

/** 写入白名单：comingSoon=true 的 phase 不允许新建/编辑 */
export const WRITEABLE_PHASE_IDS: SkillPhaseId[] = (Object.values(SKILL_PHASE_META) as SkillPhaseMeta[])
  .filter((m) => !m.comingSoon)
  .map((m) => m.id);

export const ALL_PHASE_IDS: SkillPhaseId[] = (Object.values(SKILL_PHASE_META) as SkillPhaseMeta[]).map((m) => m.id);

export type SkillCategory = SkillPhaseId;

/** @deprecated 改用 SKILL_PHASE_META */
export const SKILL_CATEGORY_META = SKILL_PHASE_META;

export interface SkillArticle {
  id: string;
  category: SkillPhaseId;
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

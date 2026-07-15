// @ts-nocheck
/**
 * Fashion AI Studio · 技能知识库 taxonomy（10 phase）。
 *
 * 与旧 Laisse Ancie 6 分类（design/craft/fabric/sourcing/brand/ops）解耦，
 * 改为按时尚设计流水线 10 阶段组织知识。phase-08/09/10 为骨架占位（comingSoon）。
 */
export type SkillPhaseId =
  | "phase-01-research" | "phase-02-concept" | "phase-03-design" | "phase-04-textile"
  | "phase-05-visual" | "phase-06-development" | "phase-07-qa"
  | "phase-08-brand" | "phase-09-marketing" | "phase-10-ecommerce";

export interface SkillPhaseMeta {
  /** 阶段序号 1..10，用于排序 */
  phase: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
  id: SkillPhaseId;
  labelZh: string;
  labelEn: string;
  hint: string;
  icon: string;
  /** phase-08/09/10 为骨架占位，UI 上置灰/折叠，禁止写入 */
  comingSoon?: boolean;
}

export const SKILL_PHASE_META: Record<SkillPhaseId, SkillPhaseMeta> = {
  "phase-01-research": { phase: 1, id: "phase-01-research", labelZh: "市场与趋势研究", labelEn: "Research", hint: "竞品 / 秀场 / 趋势报告 / 客群洞察 — 所有设计的起点。", icon: "◎" },
  "phase-02-concept": { phase: 2, id: "phase-02-concept", labelZh: "设计方案", labelEn: "Concept", hint: "Moodboard / 设计方案书 · 主题 / 故事 / 品牌调性对齐。", icon: "✦" },
  "phase-03-design": { phase: 3, id: "phase-03-design", labelZh: "服装设计", labelEn: "Design", hint: "廓形 / silhouette / 结构 / 版型 / 穿法实验。", icon: "✎" },
  "phase-04-textile": { phase: 4, id: "phase-04-textile", labelZh: "面料研究", labelEn: "Textile Science", hint: "Hand-feel / weave / weight / shrinkage / care。", icon: "◫" },
  "phase-05-visual": { phase: 5, id: "phase-05-visual", labelZh: "视觉表现", labelEn: "Visualization", hint: "主视觉 / Lookbook / 拍摄 / 配色与排版。", icon: "◐" },
  "phase-06-development": { phase: 6, id: "phase-06-development", labelZh: "版型工艺生产", labelEn: "Development", hint: "版型 / 缝制 / 供应链 / 打样 / 生产工艺闭环。", icon: "✂" },
  "phase-07-qa": { phase: 7, id: "phase-07-qa", labelZh: "设计评审", labelEn: "Quality Review", hint: "FQC / QCR / 试穿反馈 / 进仓检验清单。", icon: "◍" },
  "phase-08-brand": { phase: 8, id: "phase-08-brand", labelZh: "品牌运营", labelEn: "Brand Ops", hint: "品牌 voice / 人群 / 客户触点 — 即将开放。", icon: "◆", comingSoon: true },
  "phase-09-marketing": { phase: 9, id: "phase-09-marketing", labelZh: "营销增长", labelEn: "Marketing", hint: "Campaign / 投放 / 转化 — 即将开放。", icon: "▲", comingSoon: true },
  "phase-10-ecommerce": { phase: 10, id: "phase-10-ecommerce", labelZh: "销售转化", labelEn: "Ecommerce", hint: "Listing / 定价 / 客服知识库 — 即将开放。", icon: "◈", comingSoon: true },
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

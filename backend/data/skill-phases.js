'use strict';

/**
 * Fashion AI Studio · 技能知识库 taxonomy（10 phase）。
 *
 * 与旧 Laisse Ancie 6 分类（design/craft/fabric/sourcing/brand/ops）解耦，
 * 改为按时尚设计流水线 10 阶段组织知识。phase-08/09/10 为骨架占位（comingSoon），
 * 仅允许读取、不允许写入。
 *
 * 后端独立维护此 copy（避免跨目录 import 前端文件）。
 */

const PHASES = [
  { phase: 1, id: "phase-01-research", labelZh: "市场与趋势研究", labelEn: "Research", comingSoon: false },
  { phase: 2, id: "phase-02-concept", labelZh: "设计方案", labelEn: "Concept", comingSoon: false },
  { phase: 3, id: "phase-03-design", labelZh: "服装设计", labelEn: "Design", comingSoon: false },
  { phase: 4, id: "phase-04-textile", labelZh: "面料研究", labelEn: "Textile Science", comingSoon: false },
  { phase: 5, id: "phase-05-visual", labelZh: "视觉表现", labelEn: "Visualization", comingSoon: false },
  { phase: 6, id: "phase-06-development", labelZh: "版型工艺生产", labelEn: "Development", comingSoon: false },
  { phase: 7, id: "phase-07-qa", labelZh: "设计评审", labelEn: "Quality Review", comingSoon: false },
  { phase: 8, id: "phase-08-brand", labelZh: "品牌运营", labelEn: "Brand Ops", comingSoon: true },
  { phase: 9, id: "phase-09-marketing", labelZh: "营销增长", labelEn: "Marketing", comingSoon: true },
  { phase: 10, id: "phase-10-ecommerce", labelZh: "销售转化", labelEn: "Ecommerce", comingSoon: true },
];

const PHASE_MAP = Object.fromEntries(PHASES.map((p) => [p.id, p]));
const ALL_PHASE_IDS = PHASES.map((p) => p.id);
const WRITEABLE_PHASE_IDS = PHASES.filter((p) => !p.comingSoon).map((p) => p.id);

const VALID_PHASE_SET = new Set(ALL_PHASE_IDS);
const WRITEABLE_PHASE_SET = new Set(WRITEABLE_PHASE_IDS);

/**
 * 旧 Laisse Ancie 6 分类 → 新 10 phase 的映射。
 * 用于后端 normalizeCategory（查询兼容）和 migrate-skills-phase.js 迁移脚本。
 */
const LEGACY_TO_PHASE = {
  design: "phase-03-design",
  craft: "phase-06-development",
  fabric: "phase-04-textile",
  sourcing: "phase-06-development",
  brand: "phase-08-brand",
  ops: "phase-07-qa",
};

/** 把任意 category 字符串规范化成新 phase id；无法识别时返回 null */
function normalizeCategory(raw) {
  if (!raw) return null;
  const c = String(raw).trim();
  if (VALID_PHASE_SET.has(c)) return c;
  if (LEGACY_TO_PHASE[c]) return LEGACY_TO_PHASE[c];
  return null;
}

module.exports = {
  PHASES,
  PHASE_MAP,
  ALL_PHASE_IDS,
  WRITEABLE_PHASE_IDS,
  VALID_PHASE_SET,
  WRITEABLE_PHASE_SET,
  LEGACY_TO_PHASE,
  normalizeCategory,
};

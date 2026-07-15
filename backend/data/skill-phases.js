'use strict';

/**
 * Fashion AI Studio · 技能知识库 taxonomy（服装设计 4 阶段）。
 *
 * 仅保留与服装设计直接相关的知识阶段；品牌/营销/销售等非设计阶段已移除。
 * 后端独立维护此 copy（避免跨目录 import 前端文件）。
 */

const PHASES = [
  { phase: 1, id: "phase-01-research", labelZh: "时装史与流行趋势", labelEn: "Trends" },
  { phase: 2, id: "phase-03-design", labelZh: "服装结构", labelEn: "Structure" },
  { phase: 3, id: "phase-04-textile", labelZh: "纺织品与面料", labelEn: "Textile" },
  { phase: 4, id: "phase-05-visual", labelZh: "服装色彩与图案", labelEn: "Color & Pattern" },
];

const PHASE_MAP = Object.fromEntries(PHASES.map((p) => [p.id, p]));
const ALL_PHASE_IDS = PHASES.map((p) => p.id);
const WRITEABLE_PHASE_IDS = [...ALL_PHASE_IDS];

const VALID_PHASE_SET = new Set(ALL_PHASE_IDS);
const WRITEABLE_PHASE_SET = new Set(WRITEABLE_PHASE_IDS);

/**
 * 旧 Laisse Ancie 6 分类 → 新 4 phase 的映射。
 * 已移除的阶段统一收敛到结构/面料/视觉,供后端 normalizeCategory（查询兼容）使用。
 */
const LEGACY_TO_PHASE = {
  design: "phase-03-design",
  craft: "phase-03-design",
  fabric: "phase-04-textile",
  sourcing: "phase-04-textile",
  brand: "phase-05-visual",
  ops: "phase-03-design",
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

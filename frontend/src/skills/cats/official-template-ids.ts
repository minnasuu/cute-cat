/**
 * 与 backend/data/official-cats.js 中 CAT_TEMPLATES 的 id 保持一致（供前端 aigc 按猫分发）
 */
export const OFFICIAL_TEMPLATE_IDS = [
  'product-architect',
  'ux-designer',
  'visual-designer',
  'frontend-engineer',
] as const;

export type OfficialTemplateId = (typeof OFFICIAL_TEMPLATE_IDS)[number];

export const OFFICIAL_TEMPLATE_ID_SET = new Set<string>(OFFICIAL_TEMPLATE_IDS);

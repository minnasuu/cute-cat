import type { Assistant } from './types';
import { huajiao } from './cats/huajiao';
import { alan } from './cats/alan';
import { momo } from './cats/momo';
import { hupo } from './cats/hupo';

/** 社区页官方猫：网页制作流水线 4 只猫；与后端 official-cats 岗位一致 */
export const officialCatsCommunity: Assistant[] = [
  huajiao,
  alan,
  momo,
  hupo,
];

export const legacyWorkflowAgentLabels: Record<string, string> = {
  'product-architect': '花椒',
  'ux-designer': '阿蓝',
  'visual-designer': '墨墨',
  'frontend-engineer': '琥珀',
};

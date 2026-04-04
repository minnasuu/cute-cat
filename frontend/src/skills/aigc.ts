import type { SkillHandler } from './types';
import { runOfficialCatAigcStep } from './cats';

/**
 * 官方统一 AIGC：运行时按 TeamCat.templateId（或社区示意 workflow 的 agentId=templateId）分发到 skills/cats/*。
 */
const aigc: SkillHandler = {
  id: 'aigc',
  execute: runOfficialCatAigcStep,
};

export default aigc;

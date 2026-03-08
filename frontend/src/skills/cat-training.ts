import type { SkillHandler, SkillContext, SkillResult } from './types';
import { executePrimitive } from './primitives';

/** 📚 技能培训 — 发发 (HR)
 *  基于原型: structured-output
 */
const catTraining: SkillHandler = {
  id: 'cat-training',
  async execute(ctx: SkillContext): Promise<SkillResult> {
    console.log(`[cat-training] agent=${ctx.agentId} @${ctx.timestamp}`);

    const result = await executePrimitive('structured-output', ctx, {
      systemPrompt: '请根据以下培训需求，为指定猫猫生成新技能的定义和培训方案（JSON 格式，包含 catId、newSkill、plan 字段）。',
      difySkillId: '',
    });

    return { success: result.success, data: result.data, summary: result.summary, status: result.status };
  },
};

export default catTraining;

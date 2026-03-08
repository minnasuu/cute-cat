import type { SkillHandler, SkillContext, SkillResult } from './types';
import { executePrimitive } from './primitives';

/** 🐱 招募新猫 — 发发 (HR)
 *  基于原型: structured-output
 */
const recruitCat: SkillHandler = {
  id: 'recruit-cat',
  async execute(ctx: SkillContext): Promise<SkillResult> {
    console.log(`[recruit-cat] agent=${ctx.agentId} @${ctx.timestamp}`);

    const result = await executePrimitive('structured-output', ctx, {
      systemPrompt: '你是一位猫猫 HR。请根据以下需求，生成一只新猫的完整定义，包含 catId、role、name、skills、personality 等字段。',
      difySkillId: '',
    });

    return { success: result.success, data: result.data, summary: result.summary, status: result.status };
  },
};

export default recruitCat;

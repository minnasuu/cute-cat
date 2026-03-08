import type { SkillHandler, SkillContext, SkillResult } from './types';
import { executePrimitive } from './primitives';

/** 👥 团队盘点 — 发发 (HR)
 *  基于原型: structured-output
 */
const teamReview: SkillHandler = {
  id: 'team-review',
  async execute(ctx: SkillContext): Promise<SkillResult> {
    console.log(`[team-review] agent=${ctx.agentId} @${ctx.timestamp}`);

    const result = await executePrimitive('structured-output', ctx, {
      systemPrompt: '你是一位猫猫 HR。请盘点当前团队的能力分布和缺口，输出 JSON 格式（包含 totalCats、coverage、gaps 字段）。',
      difySkillId: '',
    });

    return { success: result.success, data: result.data, summary: result.summary, status: result.status };
  },
};

export default teamReview;

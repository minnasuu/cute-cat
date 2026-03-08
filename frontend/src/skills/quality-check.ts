import type { SkillHandler, SkillContext, SkillResult } from './types';
import { executePrimitive } from './primitives';

/** 🔎 质量检测 — 小白
 *  基于原型: structured-output
 */
const qualityCheck: SkillHandler = {
  id: 'quality-check',
  async execute(ctx: SkillContext): Promise<SkillResult> {
    console.log(`[quality-check] agent=${ctx.agentId} @${ctx.timestamp}`);

    const result = await executePrimitive('structured-output', ctx, {
      systemPrompt: '你是一位质量检测专家。请对以下内容进行质量评分和问题检测，输出 JSON 格式（包含 score、issues 字段）。',
      difySkillId: '',
    });

    return { success: result.success, data: result.data, summary: result.summary, status: result.status };
  },
};

export default qualityCheck;

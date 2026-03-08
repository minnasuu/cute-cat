import type { SkillHandler, SkillContext, SkillResult } from './types';
import { executePrimitive } from './primitives';

/** 🛡️ 内容审核 — 小白
 *  基于原型: structured-output
 */
const contentReview: SkillHandler = {
  id: 'content-review',
  async execute(ctx: SkillContext): Promise<SkillResult> {
    console.log(`[content-review] agent=${ctx.agentId} @${ctx.timestamp}`);

    const result = await executePrimitive('structured-output', ctx, {
      systemPrompt: '你是一位内容安全审核员。请检查以下内容是否合规、无敏感信息，输出 JSON 格式的审核结果（包含 result 和 issues 字段）。',
      difySkillId: '',
    });

    return { success: result.success, data: result.data, summary: result.summary, status: result.status };
  },
};

export default contentReview;

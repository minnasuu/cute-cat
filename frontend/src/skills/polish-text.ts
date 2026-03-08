import type { SkillHandler, SkillContext, SkillResult } from './types';
import { executePrimitive } from './primitives';

/** ✨ 内容润色 — 阿蓝
 *  基于原型: text-to-text
 */
const polishText: SkillHandler = {
  id: 'polish-text',
  async execute(ctx: SkillContext): Promise<SkillResult> {
    console.log(`[polish-text] agent=${ctx.agentId} @${ctx.timestamp}`);

    const result = await executePrimitive('text-to-text', ctx, {
      systemPrompt: '你是一位专业的文字编辑。请优化以下文本的表达，调整语气和风格使其更加流畅优雅，保持原意不变。',
      difySkillId: '',
      outputFormat: 'text',
    });

    return { success: result.success, data: result.data, summary: result.summary, status: result.status };
  },
};

export default polishText;

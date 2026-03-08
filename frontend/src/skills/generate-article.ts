import type { SkillHandler, SkillContext, SkillResult } from './types';
import { executePrimitive } from './primitives';

/** 📝 文章生成 — 阿蓝
 *  基于原型: text-to-text
 */
const generateArticle: SkillHandler = {
  id: 'generate-article',
  async execute(ctx: SkillContext): Promise<SkillResult> {
    console.log(`[generate-article] agent=${ctx.agentId} @${ctx.timestamp}`);

    const result = await executePrimitive('text-to-text', ctx, {
      systemPrompt: '你是一位资深内容创作者。请根据以下主题和素材，生成一篇结构清晰、文笔流畅的完整文章（Markdown 格式）。',
      difySkillId: '',
      outputFormat: 'markdown',
    });

    return { success: result.success, data: result.data, summary: result.summary, status: result.status };
  },
};

export default generateArticle;

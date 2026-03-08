import type { SkillHandler, SkillContext, SkillResult } from './types';
import { executePrimitive } from './primitives';

/** 📰 资讯摘要 — 雪
 *  基于原型: text-to-text
 */
const summarizeNews: SkillHandler = {
  id: 'summarize-news',
  async execute(ctx: SkillContext): Promise<SkillResult> {
    console.log(`[summarize-news] agent=${ctx.agentId} @${ctx.timestamp}`);

    const result = await executePrimitive('text-to-text', ctx, {
      systemPrompt: '你是一位数据分析师。请对以下爬取的资讯内容进行智能摘要和分类，按领域分组输出重点信息。',
      difySkillId: '',
      outputFormat: 'text',
    });

    return { success: result.success, data: result.data, summary: result.summary, status: result.status };
  },
};

export default summarizeNews;

import type { SkillHandler, SkillContext, SkillResult } from './types';
import { executePrimitive } from './primitives';

/** 📰 资讯转文章 — 阿蓝
 *  基于原型: text-to-text
 */
const newsToArticle: SkillHandler = {
  id: 'news-to-article',
  async execute(ctx: SkillContext): Promise<SkillResult> {
    console.log(`[news-to-article] agent=${ctx.agentId} @${ctx.timestamp}`);

    const result = await executePrimitive('text-to-text', ctx, {
      systemPrompt: '你是一位资讯编辑。请将以下零散的资讯摘要整理为一篇可发布的资讯汇总博文（Markdown 格式），注意分类、去重和连贯性。',
      difySkillId: '',
      outputFormat: 'markdown',
    });

    return { success: result.success, data: result.data, summary: result.summary, status: result.status };
  },
};

export default newsToArticle;

import type { SkillHandler, SkillContext, SkillResult } from './types';
import { executePrimitive } from './primitives';

/** 📰 资讯摘要 — 雪
 *  基于原型: text-to-text
 *  接收上游 crawl-news 输出的资讯列表，调用 LLM 进行智能摘要分类。
 */
const summarizeNews: SkillHandler = {
  id: 'summarize-news',
  async execute(ctx: SkillContext): Promise<SkillResult> {
    console.log(`[summarize-news] agent=${ctx.agentId} @${ctx.timestamp}`);

    // 将上游爬取结果转成 LLM 可读的文本
    let newsText = '';
    const input = ctx.input as Record<string, unknown> | string | undefined;
    if (typeof input === 'string') {
      newsText = input;
    } else if (input && typeof input === 'object') {
      const items = (input.items || input.data) as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(items)) {
        newsText = items
          .filter((it: any) => !it.error)
          .map((it: any, i: number) => `[${i + 1}] ${it.title}\n${it.summary || ''}\n${it.link || ''}`)
          .join('\n\n');
      }
      if (!newsText) {
        newsText = JSON.stringify(input, null, 2);
      }
    }

    const enrichedCtx: typeof ctx = { ...ctx, input: newsText };

    const result = await executePrimitive('text-to-text', enrichedCtx, {
      systemPrompt: '你是一位数据分析师。请对以下爬取的资讯内容进行智能摘要和分类，按领域分组输出重点信息。每条资讯用一句话概括核心要点。最后给出整体趋势判断。',
      difySkillId: 'summarize-news',
      model: 'qwen',
      outputFormat: 'text',
    });

    return { success: result.success, data: result.data, summary: result.summary, status: result.status };
  },
};

export default summarizeNews;

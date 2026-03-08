import type { SkillHandler, SkillContext, SkillResult } from './types';
import { executePrimitive } from './primitives';

/** 🕸️ 资讯爬取 — 雪
 *  基于原型: api-call
 */
const crawlNews: SkillHandler = {
  id: 'crawl-news',
  async execute(ctx: SkillContext): Promise<SkillResult> {
    console.log(`[crawl-news] agent=${ctx.agentId} @${ctx.timestamp}`);

    const result = await executePrimitive('api-call', ctx, {
      url: '',
      method: 'GET',
      headers: '{}',
    });

    return { success: result.success, data: result.data, summary: result.summary, status: result.status };
  },
};

export default crawlNews;

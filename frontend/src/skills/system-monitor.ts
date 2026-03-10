import type { SkillHandler, SkillContext, SkillResult } from './types';
import { executePrimitive } from './primitives';

/** 📖 查看文章 — 管理员私有
 *  基于原型: api-call
 *  查看所有文章列表或按 ID 查看单篇文章详情。
 */
const viewArticles: SkillHandler = {
  id: 'view-articles',
  async execute(ctx: SkillContext): Promise<SkillResult> {
    console.log(`[view-articles] agent=${ctx.agentId} @${ctx.timestamp}`);

    let articleId = '';

    const input = ctx.input as Record<string, unknown> | string | undefined;
    if (typeof input === 'string') {
      articleId = input.trim();
    } else if (input && typeof input === 'object') {
      const params = (input._params || input) as Record<string, unknown>;
      articleId = String(params.articleId || '').trim();
    }

    const endpoint = articleId
      ? `/api/articles/${articleId}`
      : '/api/articles';

    const result = await executePrimitive('api-call', ctx, {
      proxyEndpoint: endpoint,
      proxyBody: {},
    });

    if (!result.success) {
      return {
        success: false,
        data: null,
        summary: `查看文章失败: ${result.summary}`,
        status: 'error',
      };
    }

    const data = result.data;
    const summary = articleId
      ? `已获取文章详情: ${(data as any)?.title || articleId}`
      : `共获取 ${Array.isArray(data) ? data.length : 0} 篇文章`;

    return { success: true, data, summary, status: 'success' };
  },
};

export default viewArticles;

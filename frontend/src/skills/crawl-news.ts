import type { SkillHandler, SkillContext, SkillResult } from './types';
import { executePrimitive } from './primitives';

/** 🕸️ 资讯爬取 — 雪
 *  基于原型: api-call
 *  从 input 中提取 sources / keyword / maxItems 参数，
 *  通过后端 /api/dify/crawl 代理爬取 RSS / URL。
 */
const crawlNews: SkillHandler = {
  id: 'crawl-news',
  async execute(ctx: SkillContext): Promise<SkillResult> {
    console.log(`[crawl-news] agent=${ctx.agentId} @${ctx.timestamp}`);

    // 从 input 中提取参数（工作流引擎会注入 _params / _action）
    let sources: string[] = [];
    let keyword = '';
    let maxItems = 20;

    const input = ctx.input as Record<string, unknown> | string | undefined;
    if (input && typeof input === 'object') {
      const params = (input._params || input) as Record<string, unknown>;
      // sources 可能是 string[]（tags 组件）或逗号分隔字符串
      const rawSources = params.sources;
      if (Array.isArray(rawSources)) {
        sources = rawSources.map(String).filter(Boolean);
      } else if (typeof rawSources === 'string' && rawSources.trim()) {
        sources = rawSources.split(/[,，\s]+/).filter(Boolean);
      }
      keyword = String(params.keyword || '');
      maxItems = Number(params.maxItems) || 20;
    } else if (typeof input === 'string' && input.trim()) {
      // 纯字符串当作单个 URL
      sources = input.split(/[,，\s]+/).filter(Boolean);
    }

    if (sources.length === 0) {
      return {
        success: false,
        data: null,
        summary: '未提供 RSS / URL 源，请在参数中配置 sources',
        status: 'error',
      };
    }

    const result = await executePrimitive('api-call', ctx, {
      proxyEndpoint: '/api/dify/crawl',
      proxyBody: { sources, keyword, maxItems },
    });

    // 美化 summary
    if (result.success && result.data) {
      const data = result.data as { items?: unknown[]; total?: number; keyword?: string };
      const errorItems = (data.items || []).filter((i: any) => i.error);
      const successCount = (data.total || 0) - errorItems.length;
      const parts = [`成功爬取 ${successCount} 条资讯`];
      if (data.keyword) parts.push(`关键词过滤: ${data.keyword}`);
      if (errorItems.length > 0) parts.push(`${errorItems.length} 个源出错`);
      result.summary = parts.join('，');
    }

    return { success: result.success, data: result.data, summary: result.summary, status: result.status };
  },
};

export default crawlNews;

import type { SkillHandler, SkillContext, SkillResult } from './types';
import { executePrimitive } from './primitives';

/** ✍️ 新增文章 — 管理员私有
 *  基于原型: api-call
 *  接收 JSON 对象字符串，通过 api-call 原型创建文章。
 *  格式: { title, summary, content, publishDate, tags, readTime, type }
 */
const createArticle: SkillHandler = {
  id: 'create-article',
  async execute(ctx: SkillContext): Promise<SkillResult> {
    console.log(`[create-article] agent=${ctx.agentId} @${ctx.timestamp}`);

    // 从输入中提取 JSON 字符串
    let raw = '';
    const input = ctx.input as Record<string, unknown> | undefined;
    if (input && typeof input === 'object') {
      const params = (input._params || input) as Record<string, unknown>;
      raw = String(params.jsonData || params.content || params.text || input.text || '');
    }
    if (typeof ctx.input === 'string') {
      raw = ctx.input;
    }

    if (!raw.trim()) {
      return { success: false, data: null, summary: '请输入 JSON 对象字符串', status: 'error' };
    }

    let article: Record<string, unknown>;
    try {
      article = JSON.parse(raw);
    } catch {
      return { success: false, data: null, summary: 'JSON 解析失败，请检查格式', status: 'error' };
    }

    const title = String(article.title || '');
    const content = String(article.content || '');
    if (!title || !content) {
      return { success: false, data: null, summary: '标题(title)和正文(content)为必填项', status: 'error' };
    }

    const articleCtx: typeof ctx = { ...ctx, input: article };

    const result = await executePrimitive('api-call', articleCtx, {
      proxyEndpoint: '/api/articles',
      proxyBody: article,
    });

    if (!result.success) {
      return {
        success: false,
        data: null,
        summary: `新增文章失败: ${result.summary}`,
        status: 'error',
      };
    }

    return {
      success: true,
      data: result.data,
      summary: `文章「${title}」发布成功`,
      status: 'success',
    };
  },
};

export default createArticle;

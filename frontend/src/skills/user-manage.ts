import type { SkillHandler, SkillContext, SkillResult } from './types';

const API = 'https://suminhan.cn';

/** ✍️ 新增文章 — 管理员私有
 *  发布新文章（支持 Markdown 正文）
 */
const createArticle: SkillHandler = {
  id: 'create-article',
  async execute(ctx: SkillContext): Promise<SkillResult> {
    console.log(`[create-article] agent=${ctx.agentId} @${ctx.timestamp}`);

    let title = '';
    let summary = '';
    let content = '';
    let publishDate = new Date().toISOString().slice(0, 10);
    let tags: string[] = [];
    let readTime = 5;
    let type = 'Engineering';

    const input = ctx.input as Record<string, unknown> | undefined;
    if (input && typeof input === 'object') {
      const params = (input._params || input) as Record<string, unknown>;
      title = String(params.title || '');
      summary = String(params.summary || '');
      content = String(params.content || '');
      publishDate = String(params.publishDate || publishDate);
      readTime = Number(params.readTime) || 5;
      type = String(params.type || 'Engineering');

      const rawTags = params.tags;
      if (Array.isArray(rawTags)) {
        tags = rawTags.map(String).filter(Boolean);
      } else if (typeof rawTags === 'string' && rawTags.trim()) {
        tags = rawTags.split(/[,，\s]+/).filter(Boolean);
      }
    }

    if (!title || !content) {
      return {
        success: false,
        data: null,
        summary: '标题和正文为必填项',
        status: 'error',
      };
    }

    try {
      const res = await fetch(`${API}/api/articles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, summary, content, publishDate, tags, readTime, type }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      return {
        success: true,
        data,
        summary: `文章「${title}」发布成功`,
        status: 'success',
      };
    } catch (err: any) {
      return {
        success: false,
        data: null,
        summary: `新增文章失败: ${err.message}`,
        status: 'error',
      };
    }
  },
};

export default createArticle;

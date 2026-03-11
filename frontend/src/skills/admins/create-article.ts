import type { SkillHandler, SkillContext, SkillResult } from '../types';

/** 内部元字段，需要排除 */
const META_FIELDS = ['_action', '_params', 'inputFrom'];

/** 判断对象是否看起来像 article 数据（含有 title 或 content 字段） */
function isArticleLike(obj: Record<string, unknown>): boolean {
  return ('title' in obj && typeof obj.title === 'string' && obj.title.length > 0)
      || ('content' in obj && typeof obj.content === 'string');
}

/** 从混合对象中提取 article 相关字段，排除内部元字段 */
function extractArticleFields(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (!META_FIELDS.includes(key)) {
      result[key] = val;
    }
  }
  return result;
}

/**
 * 修复 JSON 字符串中 content 字段值内嵌的未转义双引号。
 */
function fixContentQuotes(jsonStr: string): string {
  const pattern = /"content"\s*:\s*"/g;
  let match;
  let result = jsonStr;
  let offset = 0;

  while ((match = pattern.exec(jsonStr)) !== null) {
    const valueStart = match.index + match[0].length;
    let endQuotePos = -1;

    const rest = jsonStr.substring(valueStart);
    const nextKeyPattern = /",\s*"[a-zA-Z]/g;
    let lastNextKey = -1;
    let m2;
    while ((m2 = nextKeyPattern.exec(rest)) !== null) {
      lastNextKey = m2.index;
    }

    if (lastNextKey >= 0) {
      endQuotePos = valueStart + lastNextKey;
    } else {
      const endObjPattern = /"\s*[}\]]/g;
      let lastEnd = -1;
      while ((m2 = endObjPattern.exec(rest)) !== null) {
        lastEnd = m2.index;
      }
      if (lastEnd >= 0) {
        endQuotePos = valueStart + lastEnd;
      }
    }

    if (endQuotePos > valueStart) {
      const htmlContent = jsonStr.substring(valueStart, endQuotePos);
      const fixed = htmlContent
        .replace(/\\"/g, '\u0000ESCAPED_QUOTE\u0000')
        .replace(/"/g, '\\"')
        .replace(/\u0000ESCAPED_QUOTE\u0000/g, '\\"');
      const before = result.substring(0, valueStart + offset);
      const after = result.substring(endQuotePos + offset);
      result = before + fixed + after;
      offset += fixed.length - htmlContent.length;
    }
  }

  return result;
}

/**
 * 从文本中提取 JSON（支持 markdown 代码块包裹、多余文本等）
 */
function extractJsonFromText(raw: string): string {
  const trimmed = raw.trim();

  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch { /* continue */ }

  const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlockMatch) {
    const inner = codeBlockMatch[1].trim();
    try {
      JSON.parse(inner);
      return inner;
    } catch { /* continue */ }
  }

  const jsonStartObj = trimmed.indexOf('{');
  const jsonStartArr = trimmed.indexOf('[');
  const jsonStart = jsonStartObj >= 0 && jsonStartArr >= 0
    ? Math.min(jsonStartObj, jsonStartArr)
    : Math.max(jsonStartObj, jsonStartArr);

  if (jsonStart >= 0) {
    const openChar = trimmed[jsonStart];
    const closeChar = openChar === '{' ? '}' : ']';
    const jsonEnd = trimmed.lastIndexOf(closeChar);
    if (jsonEnd > jsonStart) {
      const candidate = trimmed.substring(jsonStart, jsonEnd + 1);
      try {
        JSON.parse(candidate);
        return candidate;
      } catch {
        try {
          const fixed = fixContentQuotes(candidate);
          JSON.parse(fixed);
          return fixed;
        } catch { /* continue */ }
      }
    }
  }

  try {
    const fixed = fixContentQuotes(trimmed);
    JSON.parse(fixed);
    return fixed;
  } catch { /* continue */ }

  return trimmed;
}

/**
 * 从文本中用正则手动提取 title 和 content（最终 fallback）
 */
function extractArticleFromBrokenJson(raw: string): Record<string, unknown> | null {
  const titleMatch = raw.match(/"title"\s*:\s*"([^"]+)"/);
  if (!titleMatch) return null;

  const contentStart = raw.indexOf('"content"');
  if (contentStart < 0) return null;

  const valueStart = raw.indexOf('"', raw.indexOf(':', contentStart) + 1);
  if (valueStart < 0) return null;

  const nextKeys = ['"summary"', '"publishDate"', '"tags"', '"readTime"', '"type"', '"createdAt"', '"author"'];
  let contentEnd = -1;
  for (const key of nextKeys) {
    const pos = raw.indexOf(key, valueStart);
    if (pos > 0) {
      const seg = raw.substring(valueStart + 1, pos);
      const lastQuote = seg.lastIndexOf('"');
      if (lastQuote >= 0) {
        contentEnd = valueStart + 1 + lastQuote;
        break;
      }
    }
  }
  if (contentEnd < 0) {
    const lastBrace = Math.max(raw.lastIndexOf('}'), raw.lastIndexOf(']'));
    if (lastBrace > valueStart) {
      const seg = raw.substring(valueStart + 1, lastBrace);
      contentEnd = valueStart + 1 + seg.lastIndexOf('"');
    }
  }
  if (contentEnd <= valueStart + 1) return null;

  const content = raw.substring(valueStart + 1, contentEnd);
  const article: Record<string, unknown> = { title: titleMatch[1], content };

  const simpleFields = ['id', 'summary', 'publishDate', 'type', 'readTime', 'author'];
  for (const field of simpleFields) {
    const m = raw.match(new RegExp(`"${field}"\\s*:\\s*"([^"]*(?:\\\\.[^"]*)*)"`));
    if (m) article[field] = m[1];
  }

  return article;
}

/** 将 JSON 字符串解析为 article 对象数组 */
function parseJsonToItems(raw: string): Record<string, unknown>[] {
  const jsonStr = extractJsonFromText(raw);

  try {
    let parsed = JSON.parse(jsonStr);
    if (typeof parsed === 'string') parsed = JSON.parse(parsed);
    if (Array.isArray(parsed)) {
      return parsed.map((el: unknown) => typeof el === 'string' ? JSON.parse(el) : el);
    } else if (parsed && typeof parsed === 'object') {
      if ('title' in parsed || 'content' in parsed || 'id' in parsed) {
        return [parsed];
      }
      return Object.values(parsed).map((el: unknown) =>
        typeof el === 'string' ? JSON.parse(el) : el
      );
    }
    return [parsed];
  } catch {
    console.warn('[create-article] JSON.parse 失败，尝试正则提取 article 字段');
    const article = extractArticleFromBrokenJson(raw);
    if (article) {
      console.log('[create-article] 正则提取成功:', article.title);
      return [article];
    }
    throw new Error('无法解析输入数据为有效的 Article JSON');
  }
}

/** API 目标地址 */
const ARTICLE_API_URL = 'https://suminhan.cn/api/articles';

/** ✍️ 新增文章 — 管理员私有
 *  接收 JSON 对象/数组/字符串，直接 POST 到 https://suminhan.cn/api/articles 创建文章。
 *  支持输入格式：
 *    - JSON 字符串: '[{ title, content, ... }]'
 *    - 对象: { title, content, ... }（上游步骤直接传递）
 *    - 数组: [{ title, content }, ...]
 */
const createArticle: SkillHandler = {
  id: 'create-article',
  async execute(ctx: SkillContext): Promise<SkillResult> {
    console.log(`[create-article] agent=${ctx.agentId} @${ctx.timestamp}`);

    // ── 1. 从输入中提取 article 数据 ──
    let items: Record<string, unknown>[];

    try {
      if (typeof ctx.input === 'string') {
        items = parseJsonToItems(ctx.input);
      } else if (ctx.input && typeof ctx.input === 'object') {
        const input = ctx.input as Record<string, unknown>;
        const params = (input._params || {}) as Record<string, unknown>;

        if (isArticleLike(input)) {
          items = [extractArticleFields(input)];
        } else if (isArticleLike(params)) {
          items = [extractArticleFields(params)];
        } else {
          const rawStr = String(params.jsonData || params.content || params.text || input.text || '').trim();
          if (rawStr) {
            items = parseJsonToItems(rawStr);
          } else {
            items = parseJsonToItems(JSON.stringify(input));
          }
        }
      } else {
        return { success: false, data: null, summary: '请输入文章数据（JSON 对象或数组）', status: 'error' };
      }
    } catch (e) {
      console.error('[create-article] JSON 解析失败:', e, 'input:', ctx.input);
      return { success: false, data: null, summary: `JSON 解析失败: ${e instanceof Error ? e.message : '请检查格式'}`, status: 'error' };
    }

    if (items.length === 0) {
      return { success: false, data: null, summary: 'JSON 数组为空', status: 'error' };
    }

    // ── 2. 逐个 POST 到目标 API ──
    const results: unknown[] = [];
    const errors: string[] = [];

    for (const item of items) {
      const title = String(item.title || '');
      const content = String(item.content || '');
      if (!title || !content) {
        errors.push(`跳过: title 或 content 缺失`);
        continue;
      }

      try {
        const resp = await fetch(ARTICLE_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item),
        });

        const data = await resp.json().catch(() => null);

        if (resp.ok) {
          results.push(data ?? { title, status: 'created' });
        } else {
          const errMsg = (data && typeof data === 'object' && 'error' in data)
            ? String((data as Record<string, unknown>).error)
            : `HTTP ${resp.status}`;
          errors.push(`「${title}」失败: ${errMsg}`);
        }
      } catch (err: any) {
        errors.push(`「${title}」请求异常: ${err.message}`);
      }
    }

    const summary = [
      results.length > 0 ? `成功创建 ${results.length} 篇文章` : '',
      errors.length > 0 ? `${errors.length} 个失败: ${errors.join('; ')}` : '',
    ].filter(Boolean).join('，');

    return {
      success: results.length > 0,
      data: results,
      summary,
      status: errors.length === 0 ? 'success' : results.length > 0 ? 'success' : 'error',
    };
  },
};

export default createArticle;

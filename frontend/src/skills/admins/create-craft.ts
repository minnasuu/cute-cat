import type { SkillHandler, SkillContext, SkillResult } from '../types';

/** 内部元字段，需要排除 */
const META_FIELDS = ['_action', '_params', 'inputFrom'];

/** 判断对象是否看起来像 craft 数据（含有 name 或 htmlCode 字段） */
function isCraftLike(obj: Record<string, unknown>): boolean {
  return ('name' in obj && typeof obj.name === 'string' && obj.name.length > 0)
      || ('htmlCode' in obj && typeof obj.htmlCode === 'string');
}

/** 从混合对象中提取 craft 相关字段，排除内部元字段 */
function extractCraftFields(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (!META_FIELDS.includes(key)) {
      result[key] = val;
    }
  }
  return result;
}

/**
 * 修复 JSON 字符串中 htmlCode 字段值内嵌的未转义双引号。
 */
function fixHtmlCodeQuotes(jsonStr: string): string {
  const pattern = /"htmlCode"\s*:\s*"/g;
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
          const fixed = fixHtmlCodeQuotes(candidate);
          JSON.parse(fixed);
          return fixed;
        } catch { /* continue */ }
      }
    }
  }

  try {
    const fixed = fixHtmlCodeQuotes(trimmed);
    JSON.parse(fixed);
    return fixed;
  } catch { /* continue */ }

  return trimmed;
}

/**
 * 从文本中用正则手动提取 name 和 htmlCode（最终 fallback）
 */
function extractCraftFromBrokenJson(raw: string): Record<string, unknown> | null {
  const nameMatch = raw.match(/"name"\s*:\s*"([^"]+)"/);
  if (!nameMatch) return null;

  const htmlStart = raw.indexOf('"htmlCode"');
  if (htmlStart < 0) return null;

  const valueStart = raw.indexOf('"', raw.indexOf(':', htmlStart) + 1);
  if (valueStart < 0) return null;

  const nextKeys = ['"configSchema"', '"useCase"', '"category"', '"description"', '"technologies"', '"createdAt"', '"weight"', '"relations"'];
  let htmlEnd = -1;
  for (const key of nextKeys) {
    const pos = raw.indexOf(key, valueStart);
    if (pos > 0) {
      const seg = raw.substring(valueStart + 1, pos);
      const lastQuote = seg.lastIndexOf('"');
      if (lastQuote >= 0) {
        htmlEnd = valueStart + 1 + lastQuote;
        break;
      }
    }
  }
  if (htmlEnd < 0) {
    const lastBrace = Math.max(raw.lastIndexOf('}'), raw.lastIndexOf(']'));
    if (lastBrace > valueStart) {
      const seg = raw.substring(valueStart + 1, lastBrace);
      htmlEnd = valueStart + 1 + seg.lastIndexOf('"');
    }
  }
  if (htmlEnd <= valueStart + 1) return null;

  const htmlCode = raw.substring(valueStart + 1, htmlEnd);
  const craft: Record<string, unknown> = { name: nameMatch[1], htmlCode };

  const simpleFields = ['id', 'description', 'category', 'useCase'];
  for (const field of simpleFields) {
    const m = raw.match(new RegExp(`"${field}"\\s*:\\s*"([^"]*(?:\\\\.[^"]*)*)"`));
    if (m) craft[field] = m[1];
  }

  return craft;
}

/** 将 JSON 字符串解析为 craft 对象数组 */
function parseJsonToItems(raw: string): Record<string, unknown>[] {
  const jsonStr = extractJsonFromText(raw);

  try {
    let parsed = JSON.parse(jsonStr);
    if (typeof parsed === 'string') parsed = JSON.parse(parsed);
    if (Array.isArray(parsed)) {
      return parsed.map((el: unknown) => typeof el === 'string' ? JSON.parse(el) : el);
    } else if (parsed && typeof parsed === 'object') {
      if ('name' in parsed || 'htmlCode' in parsed || 'id' in parsed) {
        return [parsed];
      }
      return Object.values(parsed).map((el: unknown) =>
        typeof el === 'string' ? JSON.parse(el) : el
      );
    }
    return [parsed];
  } catch {
    console.warn('[create-craft] JSON.parse 失败，尝试正则提取 craft 字段');
    const craft = extractCraftFromBrokenJson(raw);
    if (craft) {
      console.log('[create-craft] 正则提取成功:', craft.name);
      return [craft];
    }
    throw new Error('无法解析输入数据为有效的 Craft JSON');
  }
}

/** API 目标地址 */
const CRAFT_API_URL = 'https://suminhan.cn/crafts';

/** 🛠️ 新增 Craft — 管理员私有
 *  接收 JSON 对象/数组/字符串，直接 POST 到 https://suminhan.cn/crafts 创建 Craft。
 *  支持输入格式：
 *    - JSON 字符串: '[{ name, htmlCode, ... }]'
 *    - 对象: { name, htmlCode, ... }（上游步骤直接传递）
 *    - 数组: [{ name, htmlCode }, ...]
 */
const createCraft: SkillHandler = {
  id: 'create-craft',
  async execute(ctx: SkillContext): Promise<SkillResult> {
    console.log(`[create-craft] agent=${ctx.agentId} @${ctx.timestamp}`);

    // ── 1. 从输入中提取 craft 数据 ──
    let items: Record<string, unknown>[];

    try {
      if (typeof ctx.input === 'string') {
        items = parseJsonToItems(ctx.input);
      } else if (ctx.input && typeof ctx.input === 'object') {
        const input = ctx.input as Record<string, unknown>;
        const params = (input._params || {}) as Record<string, unknown>;

        if (isCraftLike(input)) {
          items = [extractCraftFields(input)];
        } else if (isCraftLike(params)) {
          items = [extractCraftFields(params)];
        } else {
          const rawStr = String(params.jsonData || params.content || params.text || input.text || '').trim();
          if (rawStr) {
            items = parseJsonToItems(rawStr);
          } else {
            items = parseJsonToItems(JSON.stringify(input));
          }
        }
      } else {
        return { success: false, data: null, summary: '请输入 Craft 数据（JSON 对象或数组）', status: 'error' };
      }
    } catch (e) {
      console.error('[create-craft] JSON 解析失败:', e, 'input:', ctx.input);
      return { success: false, data: null, summary: `JSON 解析失败: ${e instanceof Error ? e.message : '请检查格式'}`, status: 'error' };
    }

    if (items.length === 0) {
      return { success: false, data: null, summary: 'JSON 数组为空', status: 'error' };
    }

    // ── 2. 逐个 POST 到目标 API ──
    const results: unknown[] = [];
    const errors: string[] = [];

    for (const item of items) {
      const name = String(item.name || '');
      const htmlCode = String(item.htmlCode || '');
      if (!name || !htmlCode) {
        errors.push(`跳过: name 或 htmlCode 缺失`);
        continue;
      }

      try {
        const resp = await fetch(CRAFT_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item),
        });

        const data = await resp.json().catch(() => null);

        if (resp.ok) {
          results.push(data ?? { name, status: 'created' });
        } else {
          const errMsg = (data && typeof data === 'object' && 'error' in data)
            ? String((data as Record<string, unknown>).error)
            : `HTTP ${resp.status}`;
          errors.push(`「${name}」失败: ${errMsg}`);
        }
      } catch (err: any) {
        errors.push(`「${name}」请求异常: ${err.message}`);
      }
    }

    const summary = [
      results.length > 0 ? `成功创建 ${results.length} 个 Craft` : '',
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

export default createCraft;

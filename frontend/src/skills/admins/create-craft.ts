import type { SkillHandler, SkillContext, SkillResult } from '../types';
import { executePrimitive } from '../primitives';

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
 * 例如 AI 生成的 JSON 中 htmlCode 包含 HTML 属性引号：charset="utf-8"
 * 这些引号会破坏外层 JSON 结构。
 *
 * 策略：找到 "htmlCode":"  之后，逐字符扫描到该字段值的真正结尾（匹配到非转义的 " 且后面紧跟 , 或 } 或 ]），
 *        对中间出现的裸双引号进行转义。
 */
function fixHtmlCodeQuotes(jsonStr: string): string {
  // 匹配 "htmlCode" : " 的起始位置
  const pattern = /"htmlCode"\s*:\s*"/g;
  let match;
  let result = jsonStr;
  let offset = 0;

  while ((match = pattern.exec(jsonStr)) !== null) {
    const valueStart = match.index + match[0].length; // htmlCode 值内容开始位置（" 之后）

    // 从 valueStart 往后找到该字符串值的真正结尾
    // 策略：从字符串末尾往前搜索，找到一个 " 后紧跟 , 或 } 或 ] 或空白+这些字符
    // 这里用更稳健的方式：找到 htmlCode 后面紧跟的下一个 JSON key 的模式来定位结尾
    let endQuotePos = -1;

    // 方法：从 valueStart 开始，找最后一个 `", "` 或 `"}` 或 `"]` 模式
    // 即 htmlCode 值的结束引号后面紧跟 JSON 分隔符
    const rest = jsonStr.substring(valueStart);
    // 找 htmlCode 值结束位置：查找下一个 JSON key 的分界模式 `", "nextKey"`
    const nextKeyPattern = /",\s*"[a-zA-Z]/g;
    let lastNextKey = -1;
    let m2;
    while ((m2 = nextKeyPattern.exec(rest)) !== null) {
      lastNextKey = m2.index;
    }

    // 如果找到了下一个 key 的分界点
    if (lastNextKey >= 0) {
      endQuotePos = valueStart + lastNextKey;
    } else {
      // 没有下一个 key，说明 htmlCode 是最后一个字段
      // 找 `"} 或 "] 从后往前
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
      // 提取 htmlCode 值内容（不含首尾引号）
      const htmlContent = jsonStr.substring(valueStart, endQuotePos);
      // 转义内部的未转义双引号（保留已转义的 \"）
      const fixed = htmlContent
        .replace(/\\"/g, '\u0000ESCAPED_QUOTE\u0000') // 暂存已转义的
        .replace(/"/g, '\\"')                          // 转义所有裸引号
        .replace(/\u0000ESCAPED_QUOTE\u0000/g, '\\"'); // 恢复已转义的
      // 替换原始内容
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
 * 返回提取到的 JSON 字符串，如果没找到则返回原始输入
 */
function extractJsonFromText(raw: string): string {
  const trimmed = raw.trim();

  // 1. 直接尝试解析（最快路径）
  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch {
    // 继续尝试提取
  }

  // 2. 去掉 markdown 代码块包裹: ```json ... ``` 或 ``` ... ```
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlockMatch) {
    const inner = codeBlockMatch[1].trim();
    try {
      JSON.parse(inner);
      return inner;
    } catch {
      // 继续，可能代码块内的 JSON 也有引号问题
    }
  }

  // 3. 尝试找到最外层的 JSON 对象 { ... } 或数组 [ ... ]
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
        // 4. 尝试修复 htmlCode 字段中的未转义引号
        try {
          const fixed = fixHtmlCodeQuotes(candidate);
          JSON.parse(fixed);
          return fixed;
        } catch {
          // 继续
        }
      }
    }
  }

  // 5. 对整个文本尝试修复 htmlCode 引号
  try {
    const fixed = fixHtmlCodeQuotes(trimmed);
    JSON.parse(fixed);
    return fixed;
  } catch {
    // 继续
  }

  // 6. 都不行，返回原始字符串（让调用方报错）
  return trimmed;
}

/**
 * 从文本中用正则手动提取 name 和 htmlCode（最终 fallback）
 * 当 JSON 解析完全失败时，尝试用正则提取关键字段
 */
function extractCraftFromBrokenJson(raw: string): Record<string, unknown> | null {
  // 提取 name
  const nameMatch = raw.match(/"name"\s*:\s*"([^"]+)"/);
  if (!nameMatch) return null;

  // 提取 htmlCode：从 "htmlCode": " 到最后一个可能的结束位置
  const htmlStart = raw.indexOf('"htmlCode"');
  if (htmlStart < 0) return null;

  const valueStart = raw.indexOf('"', raw.indexOf(':', htmlStart) + 1);
  if (valueStart < 0) return null;

  // htmlCode 的值从 valueStart+1 开始，找到真正的结尾
  // 策略：查找 htmlCode 后面的下一个已知 key（如 "configSchema", "useCase" 等）
  const nextKeys = ['"configSchema"', '"useCase"', '"category"', '"description"', '"technologies"', '"createdAt"', '"weight"', '"relations"'];
  let htmlEnd = -1;
  for (const key of nextKeys) {
    const pos = raw.indexOf(key, valueStart);
    if (pos > 0) {
      // 回退找到前面的 `", ` 分隔符
      const seg = raw.substring(valueStart + 1, pos);
      const lastQuote = seg.lastIndexOf('"');
      if (lastQuote >= 0) {
        htmlEnd = valueStart + 1 + lastQuote;
        break;
      }
    }
  }
  if (htmlEnd < 0) {
    // 找最后一个 `"` + `}` 或 `"]`
    const lastBrace = Math.max(raw.lastIndexOf('}'), raw.lastIndexOf(']'));
    if (lastBrace > valueStart) {
      const seg = raw.substring(valueStart + 1, lastBrace);
      htmlEnd = valueStart + 1 + seg.lastIndexOf('"');
    }
  }
  if (htmlEnd <= valueStart + 1) return null;

  const htmlCode = raw.substring(valueStart + 1, htmlEnd);

  // 提取其他字段
  const craft: Record<string, unknown> = {
    name: nameMatch[1],
    htmlCode,
  };

  // 尝试提取 id, description, category 等简单字段
  const simpleFields = ['id', 'description', 'category', 'useCase'];
  for (const field of simpleFields) {
    const m = raw.match(new RegExp(`"${field}"\\s*:\\s*"([^"]*(?:\\\\.[^"]*)*)"`));
    if (m) craft[field] = m[1];
  }

  return craft;
}

/** 将 JSON 字符串解析为 craft 对象数组 */
function parseJsonToItems(raw: string): Record<string, unknown>[] {
  // 先从原始文本中提取出 JSON 部分
  const jsonStr = extractJsonFromText(raw);

  try {
    let parsed = JSON.parse(jsonStr);
    // 处理双重序列化的字符串
    if (typeof parsed === 'string') parsed = JSON.parse(parsed);
    if (Array.isArray(parsed)) {
      return parsed.map((el: unknown) => typeof el === 'string' ? JSON.parse(el) : el);
    } else if (parsed && typeof parsed === 'object') {
      if ('name' in parsed || 'htmlCode' in parsed || 'id' in parsed) {
        return [parsed];
      }
      // 以数字索引为 key 的对象
      return Object.values(parsed).map((el: unknown) =>
        typeof el === 'string' ? JSON.parse(el) : el
      );
    }
    return [parsed];
  } catch {
    // 最终 fallback：用正则从破碎的 JSON 中提取 craft 字段
    console.warn('[create-craft] JSON.parse 失败，尝试正则提取 craft 字段');
    const craft = extractCraftFromBrokenJson(raw);
    if (craft) {
      console.log('[create-craft] 正则提取成功:', craft.name);
      return [craft];
    }
    // 真的不行了，抛出原始错误
    throw new Error('无法解析输入数据为有效的 Craft JSON');
  }
}

/** 🛠️ 新增 Craft — 管理员私有
 *  基于原型: api-call
 *  接收 JSON 对象/数组/字符串，通过 api-call 原型批量创建 Craft 组件。
 *  支持输入格式：
 *    - JSON 字符串: '[{ name, htmlCode, ... }]'
 *    - 对象: { name, htmlCode, ... }（上游步骤直接传递）
 *    - 数组: [{ name, htmlCode }, ...]
 */
const createCraft: SkillHandler = {
  id: 'create-craft',
  async execute(ctx: SkillContext): Promise<SkillResult> {
    console.log(`[create-craft] agent=${ctx.agentId} @${ctx.timestamp}`);

    // 从输入中提取 craft 数据
    // 支持三种输入格式：
    //   1. ctx.input 是 JSON 字符串（手动输入）
    //   2. ctx.input 是对象，其中某个字段是 JSON 字符串（通过 _params 传递）
    //   3. ctx.input 是对象，本身就包含 craft 字段（上游步骤直接传递的对象）
    let items: Record<string, unknown>[];

    try {
      if (typeof ctx.input === 'string') {
        // ── 情况 1: 直接是 JSON 字符串 ──
        items = parseJsonToItems(ctx.input);
      } else if (ctx.input && typeof ctx.input === 'object') {
        const input = ctx.input as Record<string, unknown>;
        const params = (input._params || {}) as Record<string, unknown>;

        // ── 优先检查：input 或 params 本身就是 craft 数据（来自上游步骤直接传递的对象） ──
        if (isCraftLike(input)) {
          const craft = extractCraftFields(input);
          items = [craft];
        } else if (isCraftLike(params)) {
          const craft = extractCraftFields(params);
          items = [craft];
        } else {
          // ── 尝试从字段中提取 JSON 字符串（AI 生成的文本等） ──
          const rawStr = String(params.jsonData || params.content || params.text || input.text || '').trim();

          if (rawStr) {
            items = parseJsonToItems(rawStr);
          } else {
            // 尝试将整个 input 序列化后解析
            const serialized = JSON.stringify(input);
            items = parseJsonToItems(serialized);
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

    const results: unknown[] = [];
    const errors: string[] = [];

    for (const item of items) {
      const name = String(item.name || '');
      const htmlCode = String(item.htmlCode || '');
      if (!name || !htmlCode) {
        errors.push(`跳过: name 或 htmlCode 缺失`);
        continue;
      }

      const itemCtx: typeof ctx = { ...ctx, input: item };

      try {
        const result = await executePrimitive('api-call', itemCtx, {
          proxyEndpoint: '/api/crafts',
          proxyBody: item,
        });

        if (result.success) {
          results.push(result.data);
        } else {
          errors.push(`「${name}」失败: ${result.summary}`);
        }
      } catch (err: any) {
        errors.push(`「${name}」失败: ${err.message}`);
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

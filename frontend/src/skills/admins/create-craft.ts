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

/** 将 JSON 字符串解析为 craft 对象数组 */
function parseJsonToItems(raw: string): Record<string, unknown>[] {
  let parsed = JSON.parse(raw);
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

        // 尝试从 _params 或 input 字段中提取 JSON 字符串
        const rawStr = String(params.jsonData || params.content || params.text || input.text || '').trim();

        if (rawStr) {
          // ── 情况 2: 对象中含有 JSON 字符串字段 ──
          items = parseJsonToItems(rawStr);
        } else if (isCraftLike(input)) {
          // ── 情况 3: input 对象本身就是 craft 数据 ──
          // 排除内部元字段 (_action, _params 等)
          const craft = extractCraftFields(input);
          items = [craft];
        } else if (isCraftLike(params)) {
          // _params 本身就是 craft 数据
          const craft = extractCraftFields(params);
          items = [craft];
        } else {
          // 尝试将整个 input 序列化后解析
          const serialized = JSON.stringify(input);
          items = parseJsonToItems(serialized);
        }
      } else {
        return { success: false, data: null, summary: '请输入 Craft 数据（JSON 对象或数组）', status: 'error' };
      }
    } catch {
      return { success: false, data: null, summary: 'JSON 解析失败，请检查格式', status: 'error' };
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

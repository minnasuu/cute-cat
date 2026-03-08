import type { SkillHandler, SkillContext, SkillResult } from './types';

const API = 'https://suminhan.cn';

/** 🛠️ 新增 Craft — 管理员私有
 *  接收 JSON 数组字符串，批量创建 Craft 组件
 *  格式: [{ name, description, category, technologies, htmlCode, configSchema }, ...]
 */
const createCraft: SkillHandler = {
  id: 'create-craft',
  async execute(ctx: SkillContext): Promise<SkillResult> {
    console.log(`[create-craft] agent=${ctx.agentId} @${ctx.timestamp}`);

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
      return { success: false, data: null, summary: '请输入 JSON 数组字符串', status: 'error' };
    }

    let items: Record<string, unknown>[];
    try {
      const parsed = JSON.parse(raw);
      items = Array.isArray(parsed) ? parsed : [parsed];
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
      try {
        const res = await fetch(`${API}/api/crafts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        results.push(await res.json());
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

import type { SkillHandler, SkillContext, SkillResult } from './types';

const API = 'https://suminhan.cn';

/** 🎨 查看 Crafts — 管理员私有
 *  查看所有 Crafts 列表或按 ID 查看单个 Craft 详情
 */
const viewCrafts: SkillHandler = {
  id: 'view-crafts',
  async execute(ctx: SkillContext): Promise<SkillResult> {
    console.log(`[view-crafts] agent=${ctx.agentId} @${ctx.timestamp}`);

    let craftId = '';

    const input = ctx.input as Record<string, unknown> | string | undefined;
    if (typeof input === 'string') {
      craftId = input.trim();
    } else if (input && typeof input === 'object') {
      const params = (input._params || input) as Record<string, unknown>;
      craftId = String(params.craftId || '').trim();
    }

    try {
      const url = craftId
        ? `${API}/api/crafts/${craftId}`
        : `${API}/api/crafts`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      const summary = craftId
        ? `Craft 详情:\n${JSON.stringify(data, null, 2)}`
        : `共 ${Array.isArray(data) ? data.length : 0} 个 Crafts:\n${JSON.stringify(data?.map((x:any) => Object.assign(x, {htmlCode:'(实现该效果的html代码)'})), null, 2)}`;

      return { success: true, data, summary, status: 'success' };
    } catch (err: any) {
      return {
        success: false,
        data: null,
        summary: `查看 Crafts 失败: ${err.message}`,
        status: 'error',
      };
    }
  },
};

export default viewCrafts;

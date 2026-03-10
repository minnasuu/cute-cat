import type { SkillHandler, SkillContext, SkillResult } from './types';
import { executePrimitive } from './primitives';

/** 🎨 查看 Crafts — 管理员私有
 *  基于原型: api-call
 *  查看所有 Crafts 列表或按 ID 查看单个 Craft 详情。
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

    const endpoint = craftId
      ? `/api/crafts/${craftId}`
      : '/api/crafts';

    const result = await executePrimitive('api-call', ctx, {
      proxyEndpoint: endpoint,
      proxyBody: {},
    });

    if (!result.success) {
      return {
        success: false,
        data: null,
        summary: `查看 Crafts 失败: ${result.summary}`,
        status: 'error',
      };
    }

    const data = result.data;
    const summary = craftId
      ? `Craft 详情:\n${JSON.stringify(data, null, 2)}`
      : `共 ${Array.isArray(data) ? data.length : 0} 个 Crafts:\n${JSON.stringify((data as any[])?.map((x: any) => Object.assign(x, { htmlCode: '(实现该效果的html代码)' })), null, 2)}`;

    return { success: true, data, summary, status: 'success' };
  },
};

export default viewCrafts;

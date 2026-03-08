import type { SkillHandler, SkillContext, SkillResult } from './types';
import { executePrimitive } from './primitives';

/** 🔍 数据查询 — 雪
 *  基于原型: db-query
 */
const queryDashboard: SkillHandler = {
  id: 'query-dashboard',
  async execute(ctx: SkillContext): Promise<SkillResult> {
    console.log(`[query-dashboard] agent=${ctx.agentId} @${ctx.timestamp}`);

    const result = await executePrimitive('db-query', ctx, {
      queryType: 'dashboard',
      table: 'analytics',
    });

    return { success: result.success, data: result.data, summary: result.summary, status: result.status };
  },
};

export default queryDashboard;

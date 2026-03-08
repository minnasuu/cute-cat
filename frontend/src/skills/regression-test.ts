import type { SkillHandler, SkillContext, SkillResult } from './types';
import { executePrimitive } from './primitives';

/** 🧪 回归测试 — 小白
 *  基于原型: browser-action
 */
const regressionTest: SkillHandler = {
  id: 'regression-test',
  async execute(ctx: SkillContext): Promise<SkillResult> {
    console.log(`[regression-test] agent=${ctx.agentId} @${ctx.timestamp}`);

    const result = await executePrimitive('browser-action', ctx, {
      actionType: 'test',
      targetUrl: '',
    });

    return { success: result.success, data: result.data, summary: result.summary, status: result.status };
  },
};

export default regressionTest;

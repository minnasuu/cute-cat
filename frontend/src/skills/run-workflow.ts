import type { SkillHandler, SkillContext, SkillResult } from './types';
import { executePrimitive } from './primitives';

/** ▶️ 执行工作流 — 花椒
 *  基于原型: workflow-engine
 */
const runWorkflow: SkillHandler = {
  id: 'run-workflow',
  async execute(ctx: SkillContext): Promise<SkillResult> {
    console.log(`[run-workflow] agent=${ctx.agentId} @${ctx.timestamp}`);

    const result = await executePrimitive('workflow-engine', ctx, {
      action: 'trigger',
    });

    return { success: result.success, data: result.data, summary: result.summary, status: result.status };
  },
};

export default runWorkflow;

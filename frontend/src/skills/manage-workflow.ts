import type { SkillHandler, SkillContext, SkillResult } from './types';
import { executePrimitive } from './primitives';

/** 🔧 工作流管理 — 花椒
 *  基于原型: workflow-engine
 */
const manageWorkflow: SkillHandler = {
  id: 'manage-workflow',
  async execute(ctx: SkillContext): Promise<SkillResult> {
    console.log(`[manage-workflow] agent=${ctx.agentId} @${ctx.timestamp}`);

    const result = await executePrimitive('workflow-engine', ctx, {
      action: 'update',
    });

    return { success: result.success, data: result.data, summary: result.summary, status: result.status };
  },
};

export default manageWorkflow;

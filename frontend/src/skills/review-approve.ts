import type { SkillHandler, SkillContext, SkillResult } from './types';
import { executePrimitive } from './primitives';

/** ✅ 审批流程 — 花椒
 *  基于原型: workflow-engine
 */
const reviewApprove: SkillHandler = {
  id: 'review-approve',
  async execute(ctx: SkillContext): Promise<SkillResult> {
    console.log(`[review-approve] agent=${ctx.agentId} @${ctx.timestamp}`);

    const result = await executePrimitive('workflow-engine', ctx, {
      action: 'approve',
    });

    return { success: result.success, data: result.data, summary: result.summary, status: result.status };
  },
};

export default reviewApprove;

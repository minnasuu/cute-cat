import type { SkillHandler, SkillContext, SkillResult } from './types';
import { executePrimitive } from './primitives';

/** 🔄 Crafts 更新 — 小虎
 *  基于原型: html-render
 */
const updateCrafts: SkillHandler = {
  id: 'update-crafts',
  async execute(ctx: SkillContext): Promise<SkillResult> {
    console.log(`[update-crafts] agent=${ctx.agentId} @${ctx.timestamp}`);

    const result = await executePrimitive('html-render', ctx, {
      templateId: 'crafts',
      outputType: 'html',
    });

    return { success: result.success, data: result.data, summary: result.summary, status: result.status };
  },
};

export default updateCrafts;

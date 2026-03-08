import type { SkillHandler, SkillContext, SkillResult } from './types';
import { executePrimitive } from './primitives';

/** 📐 排版布局 — 小虎
 *  基于原型: html-render
 */
const layoutDesign: SkillHandler = {
  id: 'layout-design',
  async execute(ctx: SkillContext): Promise<SkillResult> {
    console.log(`[layout-design] agent=${ctx.agentId} @${ctx.timestamp}`);

    const result = await executePrimitive('html-render', ctx, {
      templateId: 'layout',
      outputType: 'html',
    });

    return { success: result.success, data: result.data, summary: result.summary, status: result.status };
  },
};

export default layoutDesign;

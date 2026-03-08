import type { SkillHandler, SkillContext, SkillResult } from './types';
import { executePrimitive } from './primitives';

/** 🧩 组件生成 — 小虎
 *  基于原型: html-render
 */
const generateComponent: SkillHandler = {
  id: 'generate-component',
  async execute(ctx: SkillContext): Promise<SkillResult> {
    console.log(`[generate-component] agent=${ctx.agentId} @${ctx.timestamp}`);

    const result = await executePrimitive('html-render', ctx, {
      templateId: 'component',
      outputType: 'html',
    });

    return { success: result.success, data: result.data, summary: result.summary, status: result.status };
  },
};

export default generateComponent;

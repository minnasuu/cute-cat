import type { SkillHandler, SkillContext, SkillResult } from './types';
import { executePrimitive } from './primitives';

/** 🎨 样式生成 — 小虎
 *  基于原型: text-to-text
 */
const cssGenerate: SkillHandler = {
  id: 'css-generate',
  async execute(ctx: SkillContext): Promise<SkillResult> {
    console.log(`[css-generate] agent=${ctx.agentId} @${ctx.timestamp}`);

    const result = await executePrimitive('text-to-text', ctx, {
      systemPrompt: '你是一位前端 CSS 专家。请为以下组件描述生成匹配的 CSS/SCSS 样式代码和动画效果。',
      difySkillId: '',
      outputFormat: 'css',
    });

    return { success: result.success, data: result.data, summary: result.summary, status: result.status };
  },
};

export default cssGenerate;

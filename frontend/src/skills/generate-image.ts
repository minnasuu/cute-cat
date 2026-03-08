import type { SkillHandler, SkillContext, SkillResult } from './types';
import { executePrimitive } from './primitives';

/** 🖼️ AI 绘图 — Pixel
 *  基于原型: text-to-image
 */
const generateImage: SkillHandler = {
  id: 'generate-image',
  async execute(ctx: SkillContext): Promise<SkillResult> {
    console.log(`[generate-image] agent=${ctx.agentId} @${ctx.timestamp}`);

    const result = await executePrimitive('text-to-image', ctx, {
      style: 'default',
      size: '1024x1024',
      model: 'gemini',
    });

    return { success: result.success, data: result.data, summary: result.summary, status: result.status };
  },
};

export default generateImage;

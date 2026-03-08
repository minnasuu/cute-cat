import type { SkillHandler, SkillContext, SkillResult } from './types';
import { executePrimitive } from './primitives';

/** 📑 大纲生成 — 阿蓝
 *  基于原型: structured-output
 */
const generateOutline: SkillHandler = {
  id: 'generate-outline',
  async execute(ctx: SkillContext): Promise<SkillResult> {
    console.log(`[generate-outline] agent=${ctx.agentId} @${ctx.timestamp}`);

    const result = await executePrimitive('structured-output', ctx, {
      systemPrompt: '根据以下主题，生成一份结构化的内容大纲（JSON 数组格式），每个条目包含 title 和 children 字段。',
      difySkillId: '',
    });

    return { success: result.success, data: result.data, summary: result.summary, status: result.status };
  },
};

export default generateOutline;

import type { SkillHandler, SkillContext, SkillResult } from './types';
import { executePrimitive } from './primitives';

/** 📈 趋势分析 — 雪
 *  基于原型: structured-output
 */
const trendAnalysis: SkillHandler = {
  id: 'trend-analysis',
  async execute(ctx: SkillContext): Promise<SkillResult> {
    console.log(`[trend-analysis] agent=${ctx.agentId} @${ctx.timestamp}`);

    const result = await executePrimitive('structured-output', ctx, {
      systemPrompt: '你是一位数据分析师。请对以下时序数据进行趋势分析和异常检测，输出 JSON 格式的分析结论。',
      difySkillId: '',
      schema: '{ "trend": "string", "anomalies": [{ "date": "string", "value": "number", "reason": "string" }] }',
    });

    return { success: result.success, data: result.data, summary: result.summary, status: result.status };
  },
};

export default trendAnalysis;

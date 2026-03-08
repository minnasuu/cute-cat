import type { SkillHandler, SkillContext, SkillResult } from './types';
import { executePrimitive } from './primitives';

/** 📊 图表生成 — Pixel
 *  基于原型: chart-render
 */
const generateChart: SkillHandler = {
  id: 'generate-chart',
  async execute(ctx: SkillContext): Promise<SkillResult> {
    console.log(`[generate-chart] agent=${ctx.agentId} @${ctx.timestamp}`);

    const result = await executePrimitive('chart-render', ctx, {
      chartType: 'bar',
      library: 'chartjs',
    });

    return { success: result.success, data: result.data, summary: result.summary, status: result.status };
  },
};

export default generateChart;

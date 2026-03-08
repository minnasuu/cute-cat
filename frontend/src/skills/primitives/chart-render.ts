import type { PrimitiveHandler, PrimitiveContext, PrimitiveResult } from './types';

/**
 * 图表渲染原型 (chart-render)
 *
 * 底层能力：将 JSON 数据渲染为可视化图表。
 * 上层技能示例：图表生成。
 */
const chartRender: PrimitiveHandler = {
  id: 'chart-render',
  async execute(ctx: PrimitiveContext): Promise<PrimitiveResult> {
    console.log(`[primitive:chart-render] agent=${ctx.agentId} @${ctx.timestamp}`);

    const {
      chartType = 'bar',
      library = 'chartjs',
    } = ctx.config as Record<string, string>;

    try {
      // TODO: 接入 Chart.js / ECharts
      return {
        success: true,
        data: { chartUrl: '', chartType, library, _mock: true },
        summary: `[mock] chart-render 原型已调用 → ${chartType} (${library})`,
        status: 'success',
      };
    } catch (err) {
      return { success: false, data: { error: String(err) }, summary: `chart-render 异常: ${String(err)}`, status: 'error' };
    }
  },
};

export default chartRender;

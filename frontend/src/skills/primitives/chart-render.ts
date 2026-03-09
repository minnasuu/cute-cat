import type { PrimitiveHandler, PrimitiveContext, PrimitiveResult } from './types';

/**
 * 图表渲染原型 (chart-render)
 *
 * 底层能力：将 JSON 数据渲染为 Chart.js 可视化图表，返回 base64 图片。
 * 策略：动态创建离屏 canvas → Chart.js 渲染 → 导出 dataURL。
 * 上层技能示例：图表生成。
 */
const chartRender: PrimitiveHandler = {
  id: 'chart-render',
  async execute(ctx: PrimitiveContext): Promise<PrimitiveResult> {
    console.log(`[primitive:chart-render] agent=${ctx.agentId} @${ctx.timestamp}`);

    const config = ctx.config as Record<string, unknown>;
    const chartType = (config.chartType as string) || 'bar';
    const library = (config.library as string) || 'chartjs';
    const title = (config.title as string) || '';
    const width = (config.width as number) || 600;
    const height = (config.height as number) || 400;

    // 解析输入数据
    let chartData: Record<string, unknown> | null = null;
    if (typeof ctx.input === 'string') {
      try { chartData = JSON.parse(ctx.input); } catch { /* ignore */ }
    } else if (ctx.input && typeof ctx.input === 'object') {
      chartData = ctx.input as Record<string, unknown>;
    }

    if (!chartData) {
      return { success: false, data: null, summary: '无有效图表数据输入', status: 'warning' };
    }

    try {
      // 动态导入 Chart.js（运行时可选，未安装时 catch 兜底）
      // @ts-ignore — chart.js 为可选依赖，类型声明不一定存在
      const { Chart, registerables } = await import('chart.js');
      Chart.register(...registerables);

      // 创建离屏 canvas
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx2d = canvas.getContext('2d');

      if (!ctx2d) {
        return { success: false, data: null, summary: '无法创建 Canvas 上下文', status: 'error' };
      }

      // 构建 Chart.js 配置
      const chartConfig = buildChartConfig(chartType, chartData, title);

      const chart = new Chart(ctx2d, chartConfig as any);

      // 等待渲染完成
      await new Promise<void>(resolve => setTimeout(resolve, 100));

      // 导出为 base64 图片
      const dataUrl = canvas.toDataURL('image/png');

      chart.destroy();

      return {
        success: true,
        data: { chartUrl: dataUrl, chartType, library, title },
        summary: `${chartType} 图表已生成 (${width}x${height})`,
        status: 'success',
      };
    } catch (err) {
      // Chart.js 未安装或渲染失败时，返回结构化数据作为兜底
      console.warn(`[chart-render] Chart.js 渲染失败，返回数据兜底:`, err);
      return {
        success: true,
        data: { chartData, chartType, library, title, _fallback: true },
        summary: `图表数据已准备 (${chartType})，前端可直接渲染`,
        status: 'success',
      };
    }
  },
};

/** 根据图表类型和数据构建 Chart.js 配置 */
function buildChartConfig(type: string, data: Record<string, unknown>, title: string) {
  // 如果数据已经是完整的 Chart.js 格式
  if (data.labels && data.datasets) {
    return {
      type,
      data,
      options: {
        responsive: false,
        plugins: { title: title ? { display: true, text: title } : undefined },
      },
    };
  }

  // 从简单键值对构建图表数据
  const labels = (data.labels as string[]) || Object.keys(data);
  const values = (data.values as number[]) || Object.values(data).filter((v): v is number => typeof v === 'number');

  const colors = [
    '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF',
    '#FF9F40', '#7BC8A4', '#E7E9ED', '#F7464A', '#46BFBD',
  ];

  return {
    type,
    data: {
      labels,
      datasets: [{
        label: title || '数据',
        data: values,
        backgroundColor: type === 'line' ? 'rgba(54, 162, 235, 0.2)' : colors.slice(0, labels.length),
        borderColor: type === 'line' ? '#36A2EB' : colors.slice(0, labels.length),
        borderWidth: type === 'line' ? 2 : 1,
      }],
    },
    options: {
      responsive: false,
      plugins: { title: title ? { display: true, text: title } : undefined },
    },
  };
}

export default chartRender;

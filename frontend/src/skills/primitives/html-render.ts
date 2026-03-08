import type { PrimitiveHandler, PrimitiveContext, PrimitiveResult } from './types';

/**
 * HTML 模板渲染原型 (html-render)
 *
 * 底层能力：将数据注入 HTML 模板，输出渲染后的页面片段。
 * 上层技能示例：排版布局、组件生成、CSS 样式生成等。
 */
const htmlRender: PrimitiveHandler = {
  id: 'html-render',
  async execute(ctx: PrimitiveContext): Promise<PrimitiveResult> {
    console.log(`[primitive:html-render] agent=${ctx.agentId} @${ctx.timestamp}`);

    const {
      templateId = '',
      outputType = 'html',
    } = ctx.config as Record<string, string>;

    try {
      // TODO: 接入模板引擎 / Gemini 代码生成
      return {
        success: true,
        data: { html: '', templateId, outputType, _mock: true },
        summary: `[mock] html-render 原型已调用 → template: ${templateId || 'default'}`,
        status: 'success',
      };
    } catch (err) {
      return { success: false, data: { error: String(err) }, summary: `html-render 异常: ${String(err)}`, status: 'error' };
    }
  },
};

export default htmlRender;

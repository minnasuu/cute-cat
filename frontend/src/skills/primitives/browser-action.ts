import type { PrimitiveHandler, PrimitiveContext, PrimitiveResult } from './types';

/**
 * 浏览器自动化原型 (browser-action)
 *
 * 底层能力：通过 Puppeteer / Playwright 执行浏览器操作。
 * 上层技能示例：回归测试、网站诊断等。
 */
const browserAction: PrimitiveHandler = {
  id: 'browser-action',
  async execute(ctx: PrimitiveContext): Promise<PrimitiveResult> {
    console.log(`[primitive:browser-action] agent=${ctx.agentId} @${ctx.timestamp}`);

    const {
      actionType = 'screenshot',
      targetUrl = '',
    } = ctx.config as Record<string, string>;

    try {
      // TODO: 接入 Puppeteer
      return {
        success: true,
        data: { actionType, targetUrl, _mock: true },
        summary: `[mock] browser-action 原型已调用 → ${actionType} @ ${targetUrl || 'N/A'}`,
        status: 'success',
      };
    } catch (err) {
      return { success: false, data: { error: String(err) }, summary: `browser-action 异常: ${String(err)}`, status: 'error' };
    }
  },
};

export default browserAction;

import type { PrimitiveHandler, PrimitiveContext, PrimitiveResult } from './types';
import { getBackendUrl } from '../../utils/backendClient';

/**
 * 浏览器自动化原型 (browser-action)
 *
 * 底层能力：通过后端 Puppeteer/Playwright 代理执行浏览器操作。
 * 支持操作类型：截图(screenshot)、HTML 提取(extract)、链接检测(check-links)、性能分析(perf)。
 * 上层技能示例：回归测试、网站诊断等。
 */
const browserAction: PrimitiveHandler = {
  id: 'browser-action',
  async execute(ctx: PrimitiveContext): Promise<PrimitiveResult> {
    console.log(`[primitive:browser-action] agent=${ctx.agentId} @${ctx.timestamp}`);

    const config = ctx.config as Record<string, unknown>;
    const actionType = (config.actionType as string) || 'screenshot';
    const proxyEndpoint = (config.proxyEndpoint as string) || '';

    let targetUrl = (config.targetUrl as string) || '';
    let testCases = (config.testCases as string) || '';

    // 从输入中提取 URL 和测试用例
    if (typeof ctx.input === 'string') {
      if (ctx.input.startsWith('http')) targetUrl = targetUrl || ctx.input;
      else testCases = testCases || ctx.input;
    } else if (ctx.input && typeof ctx.input === 'object') {
      const obj = ctx.input as Record<string, unknown>;
      targetUrl = targetUrl || (obj.url as string) || (obj.targetUrl as string) || '';
      testCases = testCases || (obj.testCases as string) || (obj.text as string) || '';
    }

    if (!targetUrl) {
      return { success: false, data: null, summary: '未提供目标 URL', status: 'warning' };
    }

    try {
      const backendUrl = getBackendUrl();

      // 如果配了自定义代理端点
      if (proxyEndpoint) {
        const resp = await fetch(`${backendUrl}${proxyEndpoint}`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: targetUrl, actionType, testCases }),
        });
        const data = await resp.json();
        if (!resp.ok) {
          return { success: false, data, summary: data.error || `HTTP ${resp.status}`, status: 'error' };
        }
        return { success: true, data, summary: `${actionType} 完成 @ ${targetUrl}`, status: 'success' };
      }

      // 默认通过爬取接口获取页面信息（利用已有的 crawl 接口）
      const resp = await fetch(`${backendUrl}/api/dify/crawl`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sources: [targetUrl], maxItems: 1 }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        return { success: false, data, summary: data.error || `HTTP ${resp.status}`, status: 'error' };
      }

      return {
        success: true,
        data: { ...data, actionType, targetUrl, testCases },
        summary: `${actionType} 完成 @ ${targetUrl}`,
        status: 'success',
      };
    } catch (err) {
      return { success: false, data: { error: String(err) }, summary: `browser-action 异常: ${String(err)}`, status: 'error' };
    }
  },
};

export default browserAction;

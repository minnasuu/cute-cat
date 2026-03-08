import type { PrimitiveHandler, PrimitiveContext, PrimitiveResult } from './types';

/**
 * 外部 API 调用原型 (api-call)
 *
 * 底层能力：根据配置调用外部 REST API / RSS Feed / Webhook。
 * 上层技能示例：资讯爬取（RSS）、数据查询代理等。
 */
const apiCall: PrimitiveHandler = {
  id: 'api-call',
  async execute(ctx: PrimitiveContext): Promise<PrimitiveResult> {
    console.log(`[primitive:api-call] agent=${ctx.agentId} @${ctx.timestamp}`);

    const {
      url = '',
      method = 'GET',
      headers = '{}',
      bodyTemplate = '',
    } = ctx.config as Record<string, string>;

    if (!url) {
      return { success: false, data: null, summary: '未配置 API URL', status: 'error' };
    }

    try {
      // TODO: 通过后端代理调用外部 API（避免 CORS）
      return {
        success: true,
        data: { url, method, _mock: true },
        summary: `[mock] api-call 原型已调用 → ${method} ${url}`,
        status: 'success',
      };
    } catch (err) {
      return { success: false, data: { error: String(err) }, summary: `api-call 异常: ${String(err)}`, status: 'error' };
    }
  },
};

export default apiCall;

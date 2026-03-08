import type { PrimitiveHandler, PrimitiveContext, PrimitiveResult } from './types';

const getBackendUrl = (): string => {
  if (import.meta.env.VITE_BACKEND_URL) return import.meta.env.VITE_BACKEND_URL;
  if (import.meta.env.PROD) return '';
  return 'http://localhost:8002';
};

/**
 * 外部 API 调用原型 (api-call)
 *
 * 底层能力：通过后端代理调用外部 REST API / RSS Feed / Webhook（避免 CORS）。
 * 上层技能示例：资讯爬取（RSS）、数据查询代理等。
 */
const apiCall: PrimitiveHandler = {
  id: 'api-call',
  async execute(ctx: PrimitiveContext): Promise<PrimitiveResult> {
    console.log(`[primitive:api-call] agent=${ctx.agentId} @${ctx.timestamp}`);

    const config = ctx.config as Record<string, unknown>;
    const proxyEndpoint = (config.proxyEndpoint as string) || '';
    const proxyBody = (config.proxyBody as Record<string, unknown>) || {};

    // 新模式：通过后端代理接口调用
    if (proxyEndpoint) {
      try {
        const backendUrl = getBackendUrl();
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        const token = localStorage.getItem('accessToken');
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const resp = await fetch(`${backendUrl}${proxyEndpoint}`, {
          method: 'POST',
          headers,
          body: JSON.stringify(proxyBody),
        });

        const data = await resp.json();
        if (!resp.ok) {
          return { success: false, data, summary: data.error || `HTTP ${resp.status}`, status: 'error' };
        }
        return {
          success: true,
          data,
          summary: `成功获取 ${data.total ?? 0} 条数据`,
          status: 'success',
        };
      } catch (err) {
        return { success: false, data: { error: String(err) }, summary: `api-call 异常: ${String(err)}`, status: 'error' };
      }
    }

    // 旧模式兜底：需要直接 URL
    const url = (config.url as string) || '';
    if (!url) {
      return { success: false, data: null, summary: '未配置 API URL 或代理端点', status: 'error' };
    }

    try {
      const backendUrl = getBackendUrl();
      const resp = await fetch(`${backendUrl}/api/dify/crawl`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sources: [url], maxItems: 20 }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        return { success: false, data, summary: data.error || `HTTP ${resp.status}`, status: 'error' };
      }
      return { success: true, data, summary: `成功获取 ${data.total ?? 0} 条数据`, status: 'success' };
    } catch (err) {
      return { success: false, data: { error: String(err) }, summary: `api-call 异常: ${String(err)}`, status: 'error' };
    }
  },
};

export default apiCall;

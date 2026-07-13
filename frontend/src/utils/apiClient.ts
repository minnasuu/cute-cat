import { showToast } from '../components/Toast';

const BASE_URL = '';

/** 这些路径返回 401 时不应尝试 refresh（凭据错误等） */
const AUTH_PATHS_NO_REFRESH_ON_401 = new Set([
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/send-code',
  '/api/auth/reset-password',
  '/api/auth/refresh-token',
]);

function shouldSkipRefreshOn401(url: string): boolean {
  const path = url.split('?')[0];
  return AUTH_PATHS_NO_REFRESH_ON_401.has(path);
}

// 传递给 request 内部控制行为的标志位(不会透传给 fetch)
interface InternalFlags {
  /** 透传原始 Response,由调用方自行处理解析/流式读取/错误语义(仍享受 401 自动刷新) */
  raw?: boolean;
  /** 静默模式:不弹出错误 Toast(错误仍会抛出;raw 模式下原样返回 Response) */
  silent?: boolean;
}

/** 从 options 里剥离内部控制标志,返回真正该传给 fetch 的部分 */
class ApiClient {
  // body 参数保持 any:这是一个序列化边界(JSON.stringify),接受任意可 JSON 化的
  // 载荷;收紧为 unknown 会迫使全队数百个调用方强转,回归风险远大于收益。
  // 响应泛型 <T = any> 同理——由调用方在 .get<Type>() 处显式收窄。

  /** 构建请求头(FormData 透传,否则强制 application/json) */
  private buildHeaders(body: unknown, baseHeaders?: HeadersInit): Record<string, string> {
    const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
    return isFormData
      ? { ...(baseHeaders as Record<string, string> || {}) }
      : { 'Content-Type': 'application/json', ...(baseHeaders as Record<string, string> || {}) };
  }

  /** 把一个非 ok 响应体错误信息读成字符串(JSON 优先,否则文本) */
  private async readErrorBody(res: Response): Promise<string> {
    const fallback = `HTTP ${res.status}`;
    try {
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        const err = await res.json();
        return err.error || err.message || fallback;
      }
      const text = await res.text();
      return text.slice(0, 200) || fallback;
    } catch {
      return fallback;
    }
  }

  /** 友好的业务错误提示(502/503/504 统一文案) */
  private friendlyStatusMessage(status: number): string | null {
    if (status === 502) return '服务暂时不可用（502），请稍后再试';
    if (status === 503) return '服务维护中（503），请稍后再试';
    if (status === 504) return '服务响应超时（504），请稍后再试';
    return null;
  }

  /** 核心请求方法 */
  private async request<T = any>(
    url: string,
    options: RequestInit & InternalFlags = {},
  ): Promise<T> {
    const { raw, silent, ...fetchOptions } = options;
    const headers = this.buildHeaders(fetchOptions.body, fetchOptions.headers);

    let response: Response;
    try {
      response = await fetch(`${BASE_URL}${url}`, {
        ...fetchOptions,
        headers,
        credentials: 'include',
      });
    } catch {
      if (!silent) showToast('网络连接失败，请检查网络后重试');
      throw new Error('网络连接失败');
    }

    // 401 + 非 auth 路径 → 尝试刷新 token,并重放
    if (response.status === 401 && !shouldSkipRefreshOn401(url)) {
      const replay = await this.tryRefresh(url, fetchOptions, headers, Boolean(silent));
      // raw 模式:返回重放后的裸 Response;普通模式:解析 json
      return (raw ? replay : replay.json()) as T;
    }

    // raw 模式:无论状态码如何,都把 Response 交给调用方
    if (raw) {
      return response as unknown as T;
    }

    // 401 + auth 路径(不应 refresh) → 走错误处理
    if (!response.ok) {
      const msg = this.friendlyStatusMessage(response.status) || (await this.readErrorBody(response));
      if (!silent) showToast(msg);
      throw new Error(msg);
    }

    return response.json() as Promise<T>;
  }

  /** 刷新 token 并重放一次请求(返回裸 Response,由调用方决定解析方式) */
  private async tryRefresh(
    url: string,
    fetchOptions: RequestInit,
    headers: Record<string, string>,
    silent: boolean,
  ): Promise<Response> {
    try {
      const refreshRes = await fetch(`${BASE_URL}/api/auth/refresh-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });
      if (refreshRes.ok) {
        return fetch(`${BASE_URL}${url}`, {
          ...fetchOptions,
          headers,
          credentials: 'include',
        });
      }
    } catch {
      /* refresh 网络异常 → 下面视为过期 */
    }
    // refresh 失败 → 登出 + 踢回登录
    try {
      await fetch(`${BASE_URL}/api/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
    } catch {
      /* ignore */
    }
    const pathOnly = url.split('?')[0];
    if (!silent && pathOnly !== '/api/auth/me') {
      showToast('登录已过期，请重新登录');
      window.location.href = '/login';
    }
    throw new Error('登录已过期');
  }

  // ---------- 公开方法 ----------

  get<T = any>(url: string, flags?: InternalFlags) {
    return this.request<T>(url, { ...(flags || {}) });
  }

  post<T = any>(url: string, body?: any, flags?: InternalFlags) {
    const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
    const finalBody = isFormData ? body : (body !== undefined && body !== null ? JSON.stringify(body) : undefined);
    return this.request<T>(url, { method: 'POST', body: finalBody, ...(flags || {}) });
  }

  put<T = any>(url: string, body?: any, flags?: InternalFlags) {
    const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
    const finalBody = isFormData ? body : (body !== undefined && body !== null ? JSON.stringify(body) : undefined);
    return this.request<T>(url, { method: 'PUT', body: finalBody, ...(flags || {}) });
  }

  patch<T = any>(url: string, body?: any, flags?: InternalFlags) {
    const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
    const finalBody = isFormData ? body : (body !== undefined && body !== null ? JSON.stringify(body) : undefined);
    return this.request<T>(url, { method: 'PATCH', body: finalBody, ...(flags || {}) });
  }

  delete<T = any>(url: string, flags?: InternalFlags) {
    return this.request<T>(url, { method: 'DELETE', ...(flags || {}) });
  }

  /** 原始请求:返回裸 Response,由调用方自行解析/流式读取;仍享受 401 自动刷新;默认静默 */
  raw(url: string, options: RequestInit & InternalFlags = {}): Promise<Response> {
    return this.request<Response>(url, { raw: true, silent: true, ...options });
  }
}

export const apiClient = new ApiClient();
export type { InternalFlags };

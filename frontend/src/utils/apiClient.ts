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

class ApiClient {
  private async request<T = any>(url: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };

    let response: Response;
    try {
      response = await fetch(`${BASE_URL}${url}`, {
        ...options,
        headers,
        credentials: 'include',
      });
    } catch {
      showToast('网络连接失败，请检查网络后重试');
      throw new Error('网络连接失败');
    }

    if (response.status === 401 && !shouldSkipRefreshOn401(url)) {
      try {
        const refreshRes = await fetch(`${BASE_URL}/api/auth/refresh-token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({}),
        });
        if (refreshRes.ok) {
          const retryRes = await fetch(`${BASE_URL}${url}`, {
            ...options,
            headers,
            credentials: 'include',
          });
          if (!retryRes.ok) {
            const err = await retryRes.json().catch(() => ({ error: '请求失败' }));
            const msg = err.error || '请求失败';
            showToast(msg);
            throw new Error(msg);
          }
          return retryRes.json();
        }
      } catch {
        // Refresh failed
      }
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
      if (pathOnly !== '/api/auth/me') {
        showToast('登录已过期，请重新登录');
        window.location.href = '/login';
      }
      throw new Error('登录已过期');
    }

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: '请求失败' }));
      const msg = err.error || '请求失败';
      showToast(msg);
      throw new Error(msg);
    }

    return response.json();
  }

  get<T = any>(url: string) {
    return this.request<T>(url);
  }

  post<T = any>(url: string, body?: any) {
    return this.request<T>(url, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
  }

  put<T = any>(url: string, body?: any) {
    return this.request<T>(url, { method: 'PUT', body: body ? JSON.stringify(body) : undefined });
  }

  delete<T = any>(url: string) {
    return this.request<T>(url, { method: 'DELETE' });
  }
}

export const apiClient = new ApiClient();

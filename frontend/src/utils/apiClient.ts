import { showToast } from '../components/Toast';

const BASE_URL = '';

class ApiClient {
  private getToken(): string | null {
    return localStorage.getItem('accessToken');
  }

  private async request<T = any>(url: string, options: RequestInit = {}): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    let response: Response;
    try {
      response = await fetch(`${BASE_URL}${url}`, { ...options, headers });
    } catch {
      showToast('网络连接失败，请检查网络后重试');
      throw new Error('网络连接失败');
    }

    // Only credential / anonymous auth routes skip refresh — not /me or /profile, or a
    // stale access token on startup can never be renewed even when refreshToken is valid.
    const path = url.split('?')[0];
    const skipRefreshOn401 =
      path === '/api/auth/login' ||
      path === '/api/auth/register' ||
      path === '/api/auth/send-code' ||
      path === '/api/auth/reset-password' ||
      path === '/api/auth/refresh-token';

    if (response.status === 401 && !skipRefreshOn401) {
      // Try refresh token
      const refreshToken = localStorage.getItem('refreshToken');
      if (refreshToken) {
        try {
          const refreshRes = await fetch(`${BASE_URL}/api/auth/refresh-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
          });
          if (refreshRes.ok) {
            const data = await refreshRes.json();
            localStorage.setItem('accessToken', data.accessToken);
            localStorage.setItem('refreshToken', data.refreshToken);
            // Retry original request
            headers['Authorization'] = `Bearer ${data.accessToken}`;
            const retryRes = await fetch(`${BASE_URL}${url}`, { ...options, headers });
            if (!retryRes.ok) {
              let msg = '请求失败';
              try {
                const ct = retryRes.headers.get('content-type') || '';
                if (ct.includes('application/json')) {
                  const err = await retryRes.json();
                  msg = err.error || msg;
                }
              } catch { /* ignore parse error */ }
              showToast(msg);
              throw new Error(msg);
            }
            return retryRes.json();
          }
        } catch {
          // Refresh failed
        }
      }
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      showToast('登录已过期，请重新登录');
      window.location.href = '/login';
      throw new Error('登录已过期');
    }

    if (!response.ok) {
      // 针对常见 HTTP 状态码给出友好提示
      let msg = '请求失败';
      if (response.status === 502) {
        msg = '服务暂时不可用（502），请稍后再试';
      } else if (response.status === 503) {
        msg = '服务维护中（503），请稍后再试';
      } else if (response.status === 504) {
        msg = '服务响应超时（504），请稍后再试';
      } else {
        // 尝试解析 JSON 错误信息，非 JSON 响应（如 nginx HTML 错误页）不会崩溃
        try {
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const err = await response.json();
            msg = err.error || msg;
          }
        } catch {
          // JSON 解析失败，保持默认 msg
        }
      }
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

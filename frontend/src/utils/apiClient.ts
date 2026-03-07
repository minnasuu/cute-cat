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

    if (response.status === 401) {
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
      }
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      showToast('登录已过期，请重新登录');
      window.location.href = '/login';
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

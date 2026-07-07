// Laisse Ancie API helper — thin wrapper over cute-cat's apiClient.
// All Laisse Ancie backend endpoints live under `/api/laisse-ancie/*`.
// This module prefixes URLs automatically and re-exports apiClient
// for consumers that pass a fully-prefixed URL themselves.

import { apiClient as _apiClient } from '../../../utils/apiClient';

export const apiClient = _apiClient;

function prefix(p: string) {
  return `/api/laisse-ancie${p}`;
}

export async function laiGet<T = any>(url: string) {
  return _apiClient.get<T>(prefix(url));
}
export async function laiPost<T = any>(url: string, body?: any) {
  return _apiClient.post<T>(prefix(url), body);
}
export async function laiPut<T = any>(url: string, body?: any) {
  return _apiClient.put<T>(prefix(url), body);
}
export async function laiDelete<T = any>(url: string) {
  return _apiClient.delete<T>(prefix(url));
}

// Low-level request with full control. Uses fetch directly (cute-cat's `request`
// method is private) but keeps the same cookie semantics.
export async function laiRaw<T = any>(input: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api/laisse-ancie${input}`, { credentials: 'include', ...init });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

// MULTIPART upload (inspiration images) — uses raw fetch so we can send FormData.
export async function laiUpload<T = any>(url: string, formData: FormData): Promise<T> {
  return laiRaw<T>(url, { method: 'POST', body: formData });
}

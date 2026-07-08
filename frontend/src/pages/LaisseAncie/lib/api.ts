// Laisse Ancie / 通用团队 API helper。
//
// 旧版硬编码 `/api/laisse-ancie/*`(Laisse Ancie 子应用专用);
// 新版通用化:通过 `teamApi(teamId)` 返回绑定到指定团队端点前缀的客户端,
// 路径形如 `/api/teams/${teamId}/*`,未来任何团队都可复用这些「技能/资产/灵感/材料/...」模块。
//
// 兼容期:仍导出 `lai*` 系列(旧路径),供未迁移到的冷路径兜底;新代码一律用 `teamApi(teamId)`。

import { apiClient as _apiClient } from '../../../utils/apiClient';

export const apiClient = _apiClient;

// ---------- 旧路径(Laisse Ancie 子应用专用,兼容期保留) ----------

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
export async function laiRaw<T = any>(input: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api/laisse-ancie${input}`, { credentials: 'include', ...init });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}
export async function laiUpload<T = any>(url: string, formData: FormData): Promise<T> {
  return laiRaw<T>(url, { method: 'POST', body: formData });
}

// ---------- 新路径(通用团队作用域) ----------

/**
 * 绑定到具体 teamId 的 API 客户端。
 *
 * 覆盖模块:
 *   /brand, /assets, /inspirations, /materials, /skills,
 *   /products, /collections, /chat (SSE 流式主流程)
 */
export function teamApi(teamId: string) {
  const pre = (p: string) => `/api/teams/${teamId}${p}`;
  return {
    // brand
    getBrand: () => _apiClient.get(pre('/brand')),
    patchBrand: (body: any) => _apiClient.patch(pre('/brand'), body),

    // assets(通用资产)
    listAssets: (kind?: string) =>
      _apiClient.get(pre(kind && kind !== 'all' ? `/assets?kind=${encodeURIComponent(kind)}` : '/assets')),
    createAsset: (body: any) => _apiClient.post(pre('/assets'), body),
    updateAsset: (id: string, body: any) => _apiClient.patch(pre(`/assets/${id}`), body),
    deleteAsset: (id: string) => _apiClient.delete(pre(`/assets/${id}`)),

    // inspirations
    listInspirations: (params: { q?: string; category?: string; take?: number; cursor?: string } = {}) => {
      const qs = new URLSearchParams();
      if (params.q) qs.set('q', params.q);
      if (params.category) qs.set('category', params.category);
      if (params.take) qs.set('take', String(params.take));
      if (params.cursor) qs.set('cursor', params.cursor);
      const qstr = qs.toString();
      return _apiClient.get(pre(`/inspirations${qstr ? `?${qstr}` : ''}`));
    },
    uploadInspiration: (formData: FormData) =>
      fetch(pre('/inspirations'), { method: 'POST', body: formData, credentials: 'include' }).then((r) => {
        if (!r.ok) throw new Error(`API ${r.status}`);
        return r.json();
      }),
    touchInspiration: (id: string) => _apiClient.post(pre(`/inspirations/${id}/touch`), {}),
    deleteInspiration: (id: string) => _apiClient.delete(pre(`/inspirations/${id}`)),

    // materials
    listMaterials: (category?: string) =>
      _apiClient.get(pre(category && category !== 'all' ? `/materials?category=${encodeURIComponent(category)}` : '/materials')),
    createMaterial: (body: any) => _apiClient.post(pre('/materials'), body),
    updateMaterial: (id: string, body: any) => _apiClient.patch(pre(`/materials/${id}`), body),
    deleteMaterial: (id: string) => _apiClient.delete(pre(`/materials/${id}`)),

    // skills
    listSkills: (category?: string) =>
      _apiClient.get(pre(category && category !== 'all' ? `/skills?category=${encodeURIComponent(category)}` : '/skills')),
    createSkill: (body: any) => _apiClient.post(pre('/skills'), body),
    updateSkill: (id: string, body: any) => _apiClient.patch(pre(`/skills/${id}`), body),
    deleteSkill: (id: string) => _apiClient.delete(pre(`/skills/${id}`)),

    // products(设计作品)
    listProducts: (params: { mode?: string; status?: string } = {}) => {
      const qs = new URLSearchParams();
      if (params.mode && params.mode !== 'all') qs.set('mode', params.mode);
      if (params.status) qs.set('status', params.status);
      const qstr = qs.toString();
      return _apiClient.get(pre(`/products${qstr ? `?${qstr}` : ''}`));
    },
    createProduct: (body: any) => _apiClient.post(pre('/products'), body),
    updateProduct: (id: string, body: any) => _apiClient.patch(pre(`/products/${id}`), body),
    advanceProduct: (id: string, body: any) => _apiClient.post(pre(`/products/${id}/advance`), body),
    deleteProduct: (id: string) => _apiClient.delete(pre(`/products/${id}`)),

    // collections
    listCollections: () => _apiClient.get(pre('/collections')),
    createCollection: (body: any) => _apiClient.post(pre('/collections'), body),
    updateCollection: (id: string, body: any) => _apiClient.patch(pre(`/collections/${id}`), body),
    deleteCollection: (id: string) => _apiClient.delete(pre(`/collections/${id}`)),

    // chat(SSE 流式主流程)
    chatUrl: pre('/chat'),
  };
}

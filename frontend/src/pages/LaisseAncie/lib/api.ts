// Laisse Ancie / 通用团队 API helper。
//
// 通过 `teamApi(teamId)` 返回绑定到指定团队端点前缀的客户端,
// 路径形如 `/api/teams/${teamId}/*`,未来任何团队都可复用这些「技能/资产/灵感/材料/...」模块。

import { apiClient as _apiClient } from '../../../utils/apiClient';

export const apiClient = _apiClient;

// ---------- 材料组合批次(Batch) ----------

/** 材料组合 m×n 批次视图(后端 batchPublicView 形状) */
export interface MaterialComboBatch {
  batchId: string;
  teamId: string;
  status: 'running' | 'done' | 'error';
  error?: string;
  name: string;
  fabrics: { url: string; name: string; texture?: string; silhouette?: string; hex?: string[] }[];
  styles: { url: string; name: string; texture?: string; silhouette?: string; hex?: string[] }[];
  items: { fi: number; si: number; status: 'pending' | 'done' | 'error'; url?: string; error?: string; prompt?: string }[];
  total: number;
  completed: number;
  failed: number;
  createdAt: number;
  updatedAt: number;
}

/** 款式裂变批次视图 */
export interface StyleMutateBatch {
  batchId: string;
  teamId: string;
  status: 'running' | 'done' | 'error';
  error?: string;
  name: string;
  mother: { url: string; name: string };
  fabric?: { url: string; name: string } | null;
  mutations: { axisId: string; optionId: string; label: string; promptHint: string }[];
  items: {
    mi: number;
    label: string;
    axisId: string;
    optionId: string;
    status: 'pending' | 'done' | 'error';
    url?: string;
    error?: string;
    prompt?: string;
  }[];
  total: number;
  completed: number;
  failed: number;
  createdAt: number;
  updatedAt: number;
}

// ---------- 通用团队作用域 ----------

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
    patchBrand: (body: Record<string, unknown>) => _apiClient.patch(pre('/brand'), body),
    // 品牌标识图上传(multipart, field "file") —— 写入 profile.logo,返回 { id, url }
    uploadBrandLogo: (formData: FormData) =>
      fetch(pre('/brand/logo'), { method: "POST", body: formData, credentials: "include" }).then((r) => {
        if (!r.ok) throw new Error(`API ${r.status}`);
        return r.json();
      }),

    // assets(通用资产)
    listAssets: (kind?: string) =>
      _apiClient.get(pre(kind && kind !== 'all' ? `/assets?kind=${encodeURIComponent(kind)}` : '/assets')),
    createAsset: (body: object) => _apiClient.post(pre('/assets'), body),
    updateAsset: (id: string, body: object) => _apiClient.patch(pre(`/assets/${id}`), body),
    deleteAsset: (id: string) => _apiClient.delete(pre(`/assets/${id}`)),

    // inspirations
    listInspirations: (params: { q?: string; category?: string; visualStyle?: string; take?: number; cursor?: string } = {}) => {
      const qs = new URLSearchParams();
      if (params.q) qs.set('q', params.q);
      if (params.category) qs.set('category', params.category);
      if (params.visualStyle) qs.set('visualStyle', params.visualStyle);
      if (params.take) qs.set('take', String(params.take));
      if (params.cursor) qs.set('cursor', params.cursor);
      const qstr = qs.toString();
      return _apiClient.get(pre(`/inspirations${qstr ? `?${qstr}` : ''}`));
    },
    uploadInspiration: (formData: FormData) =>
      _apiClient.post(pre('/inspirations'), formData),
    touchInspiration: (id: string) => _apiClient.post(pre(`/inspirations/${id}/touch`), {}),
    analyzeInspiration: (id: string) => _apiClient.post(pre(`/inspirations/${id}/analyze`), {}),
    deleteInspiration: (id: string) => _apiClient.delete(pre(`/inspirations/${id}`)),

    // materials
    listMaterials: (category?: string, silent?: boolean) =>
      _apiClient.get(pre(category && category !== 'all' ? `/materials?category=${encodeURIComponent(category)}` : '/materials'), { silent }),
    createMaterial: (body: Record<string, unknown>) => _apiClient.post(pre('/materials'), body),
    updateMaterial: (id: string, body: Record<string, unknown>) => _apiClient.patch(pre(`/materials/${id}`), body),
    deleteMaterial: (id: string) => _apiClient.delete(pre(`/materials/${id}`)),
    // 材料参考图上传(multipart, field "file") —— 返回 { id, url }
    uploadMaterialImage: (id: string, formData: FormData) =>
      _apiClient.post(pre(`/materials/${id}/image`), formData),
    // 面料色卡图上传(multipart, file + idx 可选) —— colorImages[idx].url, 返回 { id, idx, url }
    uploadMaterialColorImage: (id: string, formData: FormData) =>
      fetch(pre(`/materials/${id}/color-image`), { method: "POST", body: formData, credentials: "include" }).then((r) => {
        if (!r.ok) throw new Error(`API ${r.status}`);
        return r.json();
      }),
    // 删除某色卡(idx) —— 返回 { ok, colorImages }
    removeMaterialColorImage: (id: string, idx: number) =>
      fetch(pre(`/materials/${id}/color-image`), {
        method: "DELETE", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ idx }),
      }).then((r) => { if (!r.ok) throw new Error(`API ${r.status}`); return r.json(); }),
    // 款式 CRUD + 参考图
    listStyles: (category?: string, silent?: boolean) =>
      _apiClient.get(pre(category && category !== "all" ? `/styles?category=${encodeURIComponent(category)}` : "/styles"), { silent }),
    createStyle: (body: Record<string, unknown>) => _apiClient.post(pre("/styles"), body),
    updateStyle: (id: string, body: Record<string, unknown>) => _apiClient.patch(pre(`/styles/${id}`), body),
    deleteStyle: (id: string) => _apiClient.delete(pre(`/styles/${id}`)),
    uploadStyleImage: (id: string, formData: FormData) =>
      fetch(pre(`/styles/${id}/image`), { method: "POST", body: formData, credentials: "include" }).then((r) => {
        if (!r.ok) throw new Error(`API ${r.status}`);
        return r.json();
      }),
    // 管理员共享开关(跨团队共享,仅 admin 可调)
    setMaterialShared: (id: string, shared: boolean) =>
      _apiClient.patch(pre(`/materials/${id}/share`), { shared }),
    setStyleShared: (id: string, shared: boolean) =>
      _apiClient.patch(pre(`/styles/${id}/share`), { shared }),
    // 插画 CRUD + 图片上传(可印/刺绣到衣服上)
    // 静默:插画表未就绪(迁移未应用)时后端返回 503,前端不弹 toast,避免操作报错弹窗
    listIllustrations: (silent?: boolean) => _apiClient.get(pre('/illustrations'), { silent }),
    createIllustration: (body: Record<string, unknown>) => _apiClient.post(pre('/illustrations'), body, { silent: true }),
    updateIllustration: (id: string, body: Record<string, unknown>) => _apiClient.patch(pre(`/illustrations/${id}`), body, { silent: true }),
    deleteIllustration: (id: string) => _apiClient.delete(pre(`/illustrations/${id}`), { silent: true }),
    uploadIllustrationImage: (id: string, formData: FormData) =>
      fetch(pre(`/illustrations/${id}/image`), { method: 'POST', body: formData, credentials: 'include' }).then((r) => {
        if (!r.ok) throw new Error(`API ${r.status}`);
        return r.json();
      }),
    // 模特 CRUD + 多图上传(1-5 张)+ 管理员共享进系统模特库
    listModels: (silent?: boolean) => _apiClient.get(pre('/models'), { silent }),
    createModel: (body: Record<string, unknown>) => _apiClient.post(pre('/models'), body, { silent: true }),
    updateModel: (id: string, body: Record<string, unknown>) => _apiClient.patch(pre(`/models/${id}`), body, { silent: true }),
    deleteModel: (id: string) => _apiClient.delete(pre(`/models/${id}`), { silent: true }),
    // 上传单张模特图(追加到 images,上限 5) —— 返回 { id, url, images }
    uploadModelImage: (id: string, formData: FormData) =>
      fetch(pre(`/models/${id}/image`), { method: 'POST', body: formData, credentials: 'include' }).then((r) => {
        if (!r.ok) throw new Error(`API ${r.status}`);
        return r.json();
      }),
    // 删除模特某张图(body.url) —— 返回 { ok, images }
    removeModelImage: (id: string, url: string) =>
      fetch(pre(`/models/${id}/image`), {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ url }),
      }).then((r) => { if (!r.ok) throw new Error(`API ${r.status}`); return r.json(); }),
    // 管理员共享开关(共享进系统模特库,仅 admin 可调)
    setModelShared: (id: string, shared: boolean) =>
      _apiClient.patch(pre(`/models/${id}/share`), { shared }),

    // skills
    listSkills: (category?: string) =>
      _apiClient.get(pre(category && category !== 'all' ? `/skills?category=${encodeURIComponent(category)}` : '/skills')),
    createSkill: (body: object) => _apiClient.post(pre('/skills'), body),
    updateSkill: (id: string, body: object) => _apiClient.patch(pre(`/skills/${id}`), body),
    deleteSkill: (id: string) => _apiClient.delete(pre(`/skills/${id}`)),

    // products(设计作品)
    listProducts: (params: { mode?: string; status?: string } = {}) => {
      const qs = new URLSearchParams();
      if (params.mode && params.mode !== 'all') qs.set('mode', params.mode);
      if (params.status) qs.set('status', params.status);
      const qstr = qs.toString();
      return _apiClient.get(pre(`/products${qstr ? `?${qstr}` : ''}`));
    },
    // 产品主图上传(multipart, field "file"),返回更新后的产品
    uploadProductImage: (id: string, formData: FormData) =>
      fetch(pre(`/products/${id}/image`), { method: 'POST', body: formData, credentials: 'include' }).then((r) => {
        if (!r.ok) throw new Error(`API ${r.status}`);
        return r.json();
      }),
    // 自由切换到任意合法状态,返回更新后的产品
    setProductStatus: (id: string, body: any) => _apiClient.post(pre(`/products/${id}/status`), body),
    createProduct: (body: object) => _apiClient.post(pre('/products'), body),
    updateProduct: (id: string, body: object) => _apiClient.patch(pre(`/products/${id}`), body),
    advanceProduct: (id: string, body: object) => _apiClient.post(pre(`/products/${id}/advance`), body),
    deleteProduct: (id: string) => _apiClient.delete(pre(`/products/${id}`)),

    // collections
    listCollections: () => _apiClient.get(pre('/collections')),
    createCollection: (body: object) => _apiClient.post(pre('/collections'), body),
    updateCollection: (id: string, body: object) => _apiClient.patch(pre(`/collections/${id}`), body),
    deleteCollection: (id: string) => _apiClient.delete(pre(`/collections/${id}`)),

    // 材料组合批次(m×n 矩阵白底效果图)
    // POST /design/material-combo → 202 batch,轮询 GET /design/material-combo/batch/:id,单格重试 POST ../regenerate
    materialComboUrl: pre('/design/material-combo'),
    materialComboBatchUrl: (batchId: string) => pre(`/design/material-combo/batch/${encodeURIComponent(batchId)}`),
    materialComboRegenerateUrl: (batchId: string) => pre(`/design/material-combo/batch/${encodeURIComponent(batchId)}/regenerate`),

    // 款式裂变批次(母款 × 裂变轴选项 → N 张子款白底图)
    styleMutateUrl: pre('/design/style-mutate'),
    styleMutateBatchUrl: (batchId: string) => pre(`/design/style-mutate/batch/${encodeURIComponent(batchId)}`),
    styleMutateRegenerateUrl: (batchId: string) => pre(`/design/style-mutate/batch/${encodeURIComponent(batchId)}/regenerate`),

    // chat(SSE 流式主流程)
    chatUrl: pre('/chat'),

    // 设计工作流:线稿 / 材料推荐 / 最终成图
    lineartUrl: pre('/design/lineart'),
    generateFinalUrl: pre('/design/generate-final'),
    recommendMaterials: (body: Record<string, unknown>) => _apiClient.post(pre('/design/recommend-materials'), body),
  };
}

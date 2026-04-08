import {
  resolveVibeSnapImageUrl,
  type VibeSnapDesignSummary,
} from "../VibeStyleLib/vibeStyleLibApi";

const API_BASE = "/api/assets";

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const token = localStorage.getItem("accessToken");
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export type AssetsScope = "official" | "mine" | "all";

// ======================== Styles ========================

export interface VibeAssetsStyleItem {
  id: string;
  userId?: string | null;
  isOfficial: boolean;
  aiEnabled: boolean;
  imageUrl: string;
  tags: string[];
  colors: string[];
  summary: string;
  designSummary: VibeSnapDesignSummary;
  designPrompt: string;
  ownerName: string;
  createdAt: string | number;
}

export async function listVibeAssetsStyles(params?: {
  scope?: AssetsScope;
  aiEnabled?: boolean;
}): Promise<VibeAssetsStyleItem[]> {
  const scope = params?.scope ?? "all";
  const qs = new URLSearchParams();
  qs.set("scope", scope);
  if (params?.aiEnabled) qs.set("aiEnabled", "true");

  const response = await fetch(`${API_BASE}/styles?${qs.toString()}`, {
    method: "GET",
    headers: { ...getAuthHeaders() },
  });
  let result: ApiResponse<{ items: VibeAssetsStyleItem[] }>;
  try {
    result = await response.json();
  } catch {
    throw new Error("服务返回了无效数据");
  }
  if (!response.ok || !result.success || !result.data?.items) {
    throw new Error(result.error || `加载风格资产失败（${response.status}）`);
  }
  return result.data.items.map((it) => ({
    ...it,
    imageUrl: resolveVibeSnapImageUrl(it.imageUrl),
  }));
}

export async function createVibeAssetsStyleItem(body: {
  imageUrl: string;
  tags: string[];
  colors: string[];
  summary: string;
  designSummary: VibeSnapDesignSummary;
  designPrompt: string;
  ownerName: string;
  aiEnabled?: boolean;
}): Promise<VibeAssetsStyleItem> {
  const response = await fetch(`${API_BASE}/styles`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(body),
  });

  let result: ApiResponse<VibeAssetsStyleItem>;
  try {
    result = await response.json();
  } catch {
    throw new Error(`服务返回了无效数据（${response.status}）`);
  }
  if (!response.ok || !result.success || !result.data) {
    throw new Error(result.error || `保存失败（${response.status}）`);
  }
  return { ...result.data, imageUrl: resolveVibeSnapImageUrl(result.data.imageUrl) };
}

export async function updateVibeAssetsStyleItem(
  id: string,
  body: Partial<Pick<VibeAssetsStyleItem, "tags" | "colors" | "summary" | "designSummary" | "designPrompt" | "ownerName" | "aiEnabled">>,
): Promise<VibeAssetsStyleItem> {
  const response = await fetch(`${API_BASE}/styles/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(body),
  });
  let result: ApiResponse<VibeAssetsStyleItem>;
  try {
    result = await response.json();
  } catch {
    throw new Error(`服务返回了无效数据（${response.status}）`);
  }
  if (!response.ok || !result.success || !result.data) {
    throw new Error(result.error || `更新失败（${response.status}）`);
  }
  return { ...result.data, imageUrl: resolveVibeSnapImageUrl(result.data.imageUrl) };
}

export async function deleteVibeAssetsStyleItem(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/styles/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { ...getAuthHeaders() },
  });
  if (response.status === 404) return;
  let result: ApiResponse<{ id?: string }>;
  try {
    result = await response.json();
  } catch {
    throw new Error("服务返回了无效数据");
  }
  if (!response.ok || !result.success) {
    throw new Error(result.error || `删除失败（${response.status}）`);
  }
}

// ======================== Fonts ========================

export interface VibeFontAssetItem {
  id: string;
  userId?: string | null;
  isOfficial: boolean;
  aiEnabled: boolean;
  fileUrl: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  family: string;
  tags: string[];
  createdAt: string;
}

export async function uploadVibeFontFile(file: File): Promise<{
  url: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(`${API_BASE}/fonts/upload`, {
    method: "POST",
    headers: { ...getAuthHeaders() },
    body: formData,
  });
  if (response.status === 413) {
    throw new Error("字体文件过大，请换更小的文件");
  }
  let result: ApiResponse<{
    url: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
  }>;
  try {
    result = await response.json();
  } catch {
    throw new Error(`服务返回了无效数据（${response.status}）`);
  }
  if (!response.ok || !result.success || !result.data?.url) {
    throw new Error(result.error || `上传失败（${response.status}）`);
  }
  return result.data;
}

export async function listVibeAssetsFonts(params?: {
  scope?: AssetsScope;
  aiEnabled?: boolean;
}): Promise<VibeFontAssetItem[]> {
  const scope = params?.scope ?? "all";
  const qs = new URLSearchParams();
  qs.set("scope", scope);
  if (params?.aiEnabled) qs.set("aiEnabled", "true");
  const response = await fetch(`${API_BASE}/fonts?${qs.toString()}`, {
    method: "GET",
    headers: { ...getAuthHeaders() },
  });
  let result: ApiResponse<{ items: VibeFontAssetItem[] }>;
  try {
    result = await response.json();
  } catch {
    throw new Error("服务返回了无效数据");
  }
  if (!response.ok || !result.success || !result.data?.items) {
    throw new Error(result.error || `加载字体资产失败（${response.status}）`);
  }
  return result.data.items;
}

export async function createVibeFontAsset(body: {
  fileUrl: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  family: string;
  tags: string[];
  aiEnabled?: boolean;
}): Promise<VibeFontAssetItem> {
  const response = await fetch(`${API_BASE}/fonts`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(body),
  });
  let result: ApiResponse<VibeFontAssetItem>;
  try {
    result = await response.json();
  } catch {
    throw new Error(`服务返回了无效数据（${response.status}）`);
  }
  if (!response.ok || !result.success || !result.data) {
    throw new Error(result.error || `保存失败（${response.status}）`);
  }
  return result.data;
}

export async function updateVibeFontAsset(
  id: string,
  body: Partial<Pick<VibeFontAssetItem, "family" | "tags" | "aiEnabled">>,
): Promise<VibeFontAssetItem> {
  const response = await fetch(`${API_BASE}/fonts/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(body),
  });
  let result: ApiResponse<VibeFontAssetItem>;
  try {
    result = await response.json();
  } catch {
    throw new Error(`服务返回了无效数据（${response.status}）`);
  }
  if (!response.ok || !result.success || !result.data) {
    throw new Error(result.error || `更新失败（${response.status}）`);
  }
  return result.data;
}

export async function deleteVibeFontAsset(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/fonts/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { ...getAuthHeaders() },
  });
  if (response.status === 404) return;
  let result: ApiResponse<{ id?: string }>;
  try {
    result = await response.json();
  } catch {
    throw new Error("服务返回了无效数据");
  }
  if (!response.ok || !result.success) {
    throw new Error(result.error || `删除失败（${response.status}）`);
  }
}


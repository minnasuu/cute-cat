const API_BASE = "/api/dify";

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const token = localStorage.getItem("accessToken");
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

export interface VibeSnapDesignSummary {
  styleDescription: string;
  styleTags: string[];
  colors: { name: string; hex: string; usage: string }[];
  typography: { family: string; note?: string }[];
  visualAttributes: {
    borderRadius: string;
    shadow: string;
    border: string;
    spacing: string;
  };
}

export interface VibeSnapExtractResult {
  designSummary: VibeSnapDesignSummary;
  designPrompt: string;
  libraryBlurb: string;
}

export { type VibeSnapExtractResult as VibeStyleLibExtractResult };

/** 灵感库卡片（与后端 GET/POST 对齐） */
export interface VibeStyleLibLibraryItem {
  id: string;
  userId?: string | null;
  imageUrl: string;
  tags: string[];
  colors: string[];
  summary: string;
  designSummary: VibeSnapDesignSummary;
  designPrompt: string;
  createdAt: number | string;
  ownerName: string;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * 将界面截图送 Gemini 视觉模型，返回设计总结 + 设计提示词。
 * imageBase64 为纯 base64，不含 data: 前缀。
 */
export async function vibeSnapExtract(body: {
  imageBase64: string;
  mimeType?: string;
}): Promise<VibeSnapExtractResult> {
  const response = await fetch(`${API_BASE}/vibe-snap-extract`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(body),
  });

  if (response.status === 413) {
    throw new Error("图片数据过大，请使用更小的截图或降低分辨率");
  }

  let result: ApiResponse<VibeSnapExtractResult>;
  try {
    result = await response.json();
  } catch {
    throw new Error(`服务返回了无效数据（${response.status}）`);
  }

  if (!response.ok || !result.success || !result.data) {
    throw new Error(result.error || `分析失败（${response.status}）`);
  }

  return result.data;
}

export async function listVibeStyleLibLibrary(): Promise<VibeStyleLibLibraryItem[]> {
  const response = await fetch(`${API_BASE}/vibe-snap-library`, {
    method: "GET",
    headers: { ...getAuthHeaders() },
  });
  let result: ApiResponse<{ items: VibeStyleLibLibraryItem[] }>;
  try {
    result = await response.json();
  } catch {
    throw new Error("服务返回了无效数据");
  }
  if (!response.ok || !result.success || !result.data?.items) {
    throw new Error(result.error || `加载灵感库失败（${response.status}）`);
  }
  return result.data.items;
}

/**
 * 上传图片文件到服务端，返回可访问的图片 URL。
 * 使用 multipart/form-data 直接上传文件，避免 base64 膨胀导致 413。
 */
export async function uploadVibeStyleLibImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE}/vibe-snap-upload`, {
    method: "POST",
    headers: { ...getAuthHeaders() },
    body: formData,
  });

  if (response.status === 413) {
    throw new Error("图片文件过大，请使用更小的截图或降低分辨率");
  }

  let result: ApiResponse<{ url: string; filename: string }>;
  try {
    result = await response.json();
  } catch {
    throw new Error(`服务返回了无效数据（${response.status}）`);
  }
  if (!response.ok || !result.success || !result.data?.url) {
    throw new Error(result.error || `上传失败（${response.status}）`);
  }

  // 服务端返回的是相对路径如 /uploads/vibe-snap/xxx.jpg，可直接使用
  return result.data.url;
}

export async function saveVibeStyleLibLibraryItem(
  draft: VibeStyleLibLibraryItem | Omit<VibeStyleLibLibraryItem, "id" | "createdAt">,
): Promise<VibeStyleLibLibraryItem> {
  const { imageUrl, tags, colors, summary, designSummary, designPrompt, ownerName } =
    draft;
  const response = await fetch(`${API_BASE}/vibe-snap-library`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({
      imageUrl,
      tags,
      colors,
      summary,
      designSummary,
      designPrompt,
      ownerName,
    }),
  });

  if (response.status === 413) {
    throw new Error("图片数据过大，请使用更小的截图或降低分辨率");
  }

  let result: ApiResponse<VibeStyleLibLibraryItem>;
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

/** 删除灵感卡片；服务端 404 时静默成功（仅本地草稿等） */
export async function deleteVibeStyleLibLibraryItem(id: string): Promise<void> {
  const response = await fetch(
    `${API_BASE}/vibe-snap-library/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
      headers: { ...getAuthHeaders() },
    },
  );

  if (response.status === 404) {
    return;
  }

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

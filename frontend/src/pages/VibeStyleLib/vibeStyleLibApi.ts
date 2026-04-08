const API_BASE = "/api/dify";

/** 生产或 preview 未代理 /uploads 时，用环境变量指向后端源 */
function backendOrigin(): string {
  const raw = import.meta.env.VITE_BACKEND_URL?.trim() ?? "";
  return raw.replace(/\/$/, "");
}

/**
 * 灵感库 / 提取器里用于 <img src> 的最终地址。
 * - data: / blob: / 绝对 http(s) 原样返回
 * - 以 /uploads/ 开头的相对路径：若配置了 VITE_BACKEND_URL 则拼到该源（跨域部署）
 */
export function resolveVibeSnapImageUrl(url: string | null | undefined): string {
  const u = url?.trim() ?? "";
  if (!u) return "";
  if (
    u.startsWith("data:") ||
    u.startsWith("blob:") ||
    /^https?:\/\//i.test(u)
  ) {
    return u;
  }
  const origin = backendOrigin();
  if (origin && u.startsWith("/uploads/")) {
    return `${origin}${u}`;
  }
  return u;
}

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
 * 将界面截图送视觉模型，返回设计总结 + 设计提示词。
 *
 * 优先使用 imageUrl（后端从磁盘读文件，避免前端传大体积 base64）。
 * 也兼容旧的 imageBase64 方式（纯 base64，不含 data: 前缀）。
 *
 * 后端使用 SSE (Server-Sent Events) 心跳机制防止 nginx 504 超时：
 * - 响应头为 text/event-stream
 * - 处理期间每 8s 发送 `:heartbeat` 注释行保持连接
 * - 最终结果通过 `data: {...}` 帧发送
 */
export async function vibeSnapExtract(body: {
  imageUrl?: string;
  imageBase64?: string;
  mimeType?: string;
}): Promise<VibeSnapExtractResult> {
  const controller = new AbortController();
  // 前端总超时 150s（后端 AI 120s + 网络余量）
  const timeoutId = setTimeout(() => controller.abort(), 150_000);

  let response: Response;
  try {
    response = await fetch(`${API_BASE}/vibe-snap-extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("分析超时，请使用更小的图片或稍后重试");
    }
    throw new Error("网络请求失败，请检查网络连接后重试");
  }

  clearTimeout(timeoutId);

  // 处理网关级错误（504 / 502 / 413 等，通常返回 HTML 而非 JSON）
  if (response.status === 413) {
    throw new Error("图片数据过大，请使用更小的截图或降低分辨率");
  }
  if (response.status === 504 || response.status === 502) {
    throw new Error(
      `服务网关超时（${response.status}），AI 分析耗时过长，请使用更小的图片或稍后重试`,
    );
  }

  const contentType = response.headers.get("content-type") || "";

  // --- SSE 流式响应处理（后端返回 text/event-stream）---
  if (contentType.includes("text/event-stream")) {
    const text = await response.text();
    // 从 SSE 文本中提取最后一个 data: 帧（跳过心跳注释行）
    const dataLines = text
      .split("\n")
      .filter((line) => line.startsWith("data: "));
    const lastDataLine = dataLines[dataLines.length - 1];
    if (!lastDataLine) {
      throw new Error("服务返回了空数据，请稍后重试");
    }
    const jsonStr = lastDataLine.slice("data: ".length).trim();
    let result: ApiResponse<VibeSnapExtractResult>;
    try {
      result = JSON.parse(jsonStr);
    } catch {
      throw new Error("服务返回了无效数据");
    }
    if (!result.success || !result.data) {
      throw new Error(result.error || "分析失败");
    }
    return result.data;
  }

  // --- 兼容旧格式：普通 JSON 响应 ---
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

/** 删除临时上传文件（解析失败、未保存离开提取器等）；静默忽略非 vibe-snap 路径 */
export async function deleteVibeStyleLibUploadedImage(url: string): Promise<void> {
  const u = url?.trim() ?? "";
  if (!u.startsWith("/uploads/vibe-snap/")) return;

  const response = await fetch(
    `${API_BASE}/vibe-snap-upload?url=${encodeURIComponent(u)}`,
    {
      method: "DELETE",
      headers: { ...getAuthHeaders() },
    },
  );

  if (response.status === 400 || response.status === 404) {
    return;
  }

  let result: ApiResponse<{ deleted?: boolean }>;
  try {
    result = await response.json();
  } catch {
    throw new Error(`删除临时文件失败（${response.status}）`);
  }
  if (!response.ok || !result.success) {
    throw new Error(result.error || `删除临时文件失败（${response.status}）`);
  }
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

/** 更新已保存的灵感卡片（需登录且为卡片所有者） */
export async function updateVibeStyleLibLibraryItem(
  id: string,
  body: {
    imageUrl: string;
    tags: string[];
    colors: string[];
    summary: string;
    designSummary: VibeSnapDesignSummary;
    designPrompt: string;
    ownerName: string;
  },
): Promise<VibeStyleLibLibraryItem> {
  const response = await fetch(
    `${API_BASE}/vibe-snap-library/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify(body),
    },
  );

  let result: ApiResponse<VibeStyleLibLibraryItem>;
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

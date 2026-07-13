import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import clsx from "clsx";
import {
  deleteVibeStyleLibLibraryItem,
  deleteVibeStyleLibUploadedImage,
  listVibeStyleLibLibrary,
  saveVibeStyleLibLibraryItem,
  updateVibeStyleLibLibraryItem,
  uploadVibeStyleLibImage,
  vibeSnapExtract,
  resolveVibeSnapImageUrl,
  type VibeStyleLibExtractResult,
} from "./vibeStyleLibApi";
import type { VibeStyleLibLibraryItem } from "./vibeStyleLibApi";
import { useAuth } from "../../contexts/AuthContext";
import Navbar from "../../components/Navbar";
import { ResultPanel } from "./ResultPanel";
import { DetailEditForm } from "./DetailEditForm";
import { IconCopy, IconUpload, Spinner, ModalChrome, ui } from "./ui";

const STORAGE_KEY = "vibesnap-library-v1";
const MAX_FILE_BYTES = 10 * 1024 * 1024;
/** 压缩后目标最大边长 */
const COMPRESS_MAX_EDGE = 1920;
/** 压缩后 JPEG 质量 */
const COMPRESS_QUALITY = 0.85;

type MainTab = "library" | "extractor";
export type ResultTab = "summary" | "prompt";

function loadStoredLibrary(): VibeStyleLibLibraryItem[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed as VibeStyleLibLibraryItem[];
  } catch {
    return null;
  }
}

function persistLibrary(items: VibeStyleLibLibraryItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* quota */
  }
}

function newId() {
  return `vs-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function extractorSessionKey(
  imageUrl: string,
  data: Pick<VibeStyleLibExtractResult, "designPrompt" | "designSummary">,
): string {
  return `${imageUrl.slice(0, 160)}|${data.designPrompt.slice(0, 120)}|${data.designSummary.styleDescription.slice(0, 80)}`;
}

function libraryItemFromExtract(
  imageUrl: string,
  data: VibeStyleLibExtractResult,
  user: { id: string; nickname: string } | null,
): VibeStyleLibLibraryItem {
  return {
    id: newId(),
    userId: user?.id || null,
    imageUrl,
    tags: data.designSummary.styleTags.slice(0, 5),
    colors: data.designSummary.colors.map((c) => c.hex).slice(0, 6),
    summary:
      data.libraryBlurb || data.designSummary.styleDescription.slice(0, 160),
    designSummary: data.designSummary,
    designPrompt: data.designPrompt,
    createdAt: Date.now(),
    ownerName: user?.nickname || "",
  };
}

/**
 * 通过 Canvas 将图片缩放 + 转 JPEG 来压缩体积。
 * 返回压缩后的 File 对象。
 */
async function compressImage(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;

  // 如果尺寸已经很小且文件也不大，无需压缩
  if (
    Math.max(width, height) <= COMPRESS_MAX_EDGE &&
    file.size <= MAX_FILE_BYTES
  ) {
    bitmap.close();
    return file;
  }

  // 计算缩放比
  const scale = Math.min(1, COMPRESS_MAX_EDGE / Math.max(width, height));
  const dw = Math.round(width * scale);
  const dh = Math.round(height * scale);

  const canvas = new OffscreenCanvas(dw, dh);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, dw, dh);
  bitmap.close();

  const blob = await canvas.convertToBlob({
    type: "image/jpeg",
    quality: COMPRESS_QUALITY,
  });
  return new File([blob], file.name.replace(/\.\w+$/, ".jpg"), {
    type: "image/jpeg",
  });
}

async function fileToBase64Parts(
  file: File,
): Promise<{ imageBase64: string; mimeType: string }> {
  // 先压缩大图
  const processed = await compressImage(file);
  const buf = await processed.arrayBuffer();
  if (buf.byteLength > MAX_FILE_BYTES) {
    throw new Error(
      `图片压缩后仍超过 ${MAX_FILE_BYTES / 1024 / 1024}MB，请使用更小的图片`,
    );
  }
  const mimeType = processed.type || "image/jpeg";
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return { imageBase64: btoa(binary), mimeType };
}

function dataUrlFromFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export const RESULT_TAB_DEF: { key: ResultTab; label: string }[] = [
  { key: "summary", label: "设计总结" },
  { key: "prompt", label: "设计提示词" },
];

export const VISUAL_ATTR_KEYS = [
  ["圆角", "borderRadius"],
  ["阴影", "shadow"],
  ["边框", "border"],
  ["间距", "spacing"],
] as const;

export const VibeStyleLib = () => {
  const { user } = useAuth();
  const [mainTab, setMainTab] = useState<MainTab>("library");
  const [library, setLibrary] = useState<VibeStyleLibLibraryItem[]>([]);
  const [detailItem, setDetailItem] = useState<VibeStyleLibLibraryItem | null>(
    null,
  );
  const [extractorImage, setExtractorImage] = useState<string | null>(null);
  const [extractorResult, setExtractorResult] =
    useState<VibeStyleLibExtractResult | null>(null);
  const [resultTab, setResultTab] = useState<ResultTab>("summary");
  const [detailTab, setDetailTab] = useState<ResultTab>("summary");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSavedExtractorKey, setLastSavedExtractorKey] = useState<
    string | null
  >(null);
  const [savingToLibrary, setSavingToLibrary] = useState(false);
  const [deletingDetail, setDeletingDetail] = useState(false);
  const [detailEditing, setDetailEditing] = useState(false);
  const [detailEditDraft, setDetailEditDraft] = useState<{
    summary: string;
    styleDescription: string;
    designPrompt: string;
  } | null>(null);
  const [detailSaving, setDetailSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  /** 提取器内：已成功上传且解析完成、但尚未写入灵感库的服务端 URL；离开/失败时需删盘文件 */
  const pendingExtractUploadUrlRef = useRef<string | null>(null);

  const extractorSaveKey = useMemo(() => {
    if (!extractorImage || !extractorResult) return "";
    return extractorSessionKey(extractorImage, extractorResult);
  }, [extractorImage, extractorResult]);

  const extractorAlreadySaved =
    Boolean(extractorSaveKey) && extractorSaveKey === lastSavedExtractorKey;

  useEffect(() => {
    persistLibrary(library);
  }, [library]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const items = await listVibeStyleLibLibrary();
        if (!cancelled) setLibrary(items);
      } catch {
        if (!cancelled) {
          const local = loadStoredLibrary();
          if (local?.length) setLibrary(local);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (detailItem) setDetailTab("summary");
  }, [detailItem?.id]);

  useEffect(() => {
    setDetailEditing(false);
    setDetailEditDraft(null);
  }, [detailItem?.id]);

  const canEditDetail = Boolean(
    detailItem &&
      (detailItem.id.startsWith("vs-") ||
        (user?.id &&
          (detailItem.userId === user.id || detailItem.userId == null))),
  );

  const startDetailEdit = useCallback(() => {
    if (!detailItem) return;
    setDetailEditDraft({
      summary: detailItem.summary,
      styleDescription: detailItem.designSummary.styleDescription,
      designPrompt: detailItem.designPrompt,
    });
    setDetailEditing(true);
  }, [detailItem]);

  const cancelDetailEdit = useCallback(() => {
    setDetailEditing(false);
    setDetailEditDraft(null);
  }, []);

  const saveDetailEdits = useCallback(async () => {
    if (!detailItem || !detailEditDraft) return;
    const designSummary = {
      ...detailItem.designSummary,
      styleDescription: detailEditDraft.styleDescription,
    };
    const mergedLocal: VibeStyleLibLibraryItem = {
      ...detailItem,
      summary: detailEditDraft.summary,
      designPrompt: detailEditDraft.designPrompt.trim(),
      designSummary,
    };
    setDetailSaving(true);
    setError(null);
    try {
      if (detailItem.id.startsWith("vs-")) {
        setLibrary((prev) =>
          prev.map((x) => (x.id === detailItem.id ? mergedLocal : x)),
        );
        setDetailItem(mergedLocal);
        setDetailEditing(false);
        setDetailEditDraft(null);
        return;
      }
      if (!user?.id) {
        setError("请先登录后再保存修改");
        return;
      }
      const saved = await updateVibeStyleLibLibraryItem(detailItem.id, {
        imageUrl: detailItem.imageUrl,
        tags: detailItem.tags,
        colors: detailItem.colors,
        summary: detailEditDraft.summary,
        designSummary,
        designPrompt: detailEditDraft.designPrompt.trim(),
        ownerName: detailItem.ownerName,
      });
      const displayUrl =
        detailItem.imageUrl.startsWith("data:") ||
        detailItem.imageUrl.startsWith("blob:")
          ? detailItem.imageUrl
          : saved.imageUrl;
      const merged: VibeStyleLibLibraryItem = { ...saved, imageUrl: displayUrl };
      setLibrary((prev) =>
        prev.map((x) => (x.id === detailItem.id ? merged : x)),
      );
      setDetailItem(merged);
      setDetailEditing(false);
      setDetailEditDraft(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setDetailSaving(false);
    }
  }, [detailItem, detailEditDraft, user?.id]);

  /** 离开「提取器」标签时：未保存到灵感库的临时上传从服务端删除 */
  useEffect(() => {
    if (mainTab === "extractor") return;
    const url = pendingExtractUploadUrlRef.current;
    pendingExtractUploadUrlRef.current = null;
    if (url) {
      void deleteVibeStyleLibUploadedImage(url).catch(() => {
        /* 尽力清理，忽略网络错误 */
      });
    }
  }, [mainTab]);

  /** 页面卸载时清理未提交的临时文件 */
  useEffect(() => {
    return () => {
      const url = pendingExtractUploadUrlRef.current;
      pendingExtractUploadUrlRef.current = null;
      if (url) {
        void deleteVibeStyleLibUploadedImage(url).catch(() => {});
      }
    };
  }, []);

  /** 调用 AI 分析。优先使用 imageUrl（后端从磁盘读文件），省去前端传大 base64 */
  const runExtract = useCallback(
    async (file: File, imageUrl?: string) => {
      setLoading(true);
      setError(null);
      try {
        if (imageUrl) {
          // 优先走 URL 模式：后端从磁盘读文件转 base64，请求体只有几十字节
          return await vibeSnapExtract({ imageUrl });
        }
        // fallback：没有 imageUrl 时仍用 base64（例如提取器尚未上传时）
        const { imageBase64, mimeType } = await fileToBase64Parts(file);
        return await vibeSnapExtract({ imageBase64, mimeType });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "分析失败";
        setError(msg);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const addToLibrary = useCallback(
    async (file: File) => {
      const dataUrl = await dataUrlFromFile(file);
      let serverUrl: string | null = null;
      try {
        serverUrl = await uploadVibeStyleLibImage(file);
        const data = await runExtract(file, serverUrl);
        const draft = libraryItemFromExtract(serverUrl, data, user);
        try {
          const saved = await saveVibeStyleLibLibraryItem(draft);
          // 本地展示用原始 dataUrl 保证即时显示
          setLibrary((prev) => [{ ...saved, imageUrl: dataUrl }, ...prev]);
          setDetailItem({ ...saved, imageUrl: dataUrl });
          return saved;
        } catch (e) {
          await deleteVibeStyleLibUploadedImage(serverUrl);
          const msg = e instanceof Error ? e.message : "云端保存失败";
          setError(msg);
          // 降级：本地用 dataUrl 展示（服务端临时文件已删，避免堆积）
          const fallback = { ...draft, imageUrl: dataUrl };
          setLibrary((prev) => [fallback, ...prev]);
          setDetailItem(fallback);
          return fallback;
        }
      } catch (e) {
        if (serverUrl) {
          await deleteVibeStyleLibUploadedImage(serverUrl).catch(() => {});
        }
        throw e;
      }
    },
    [runExtract, user],
  );

  const analyzeInExtractor = useCallback(
    async (file: File) => {
      const prevPending = pendingExtractUploadUrlRef.current;
      pendingExtractUploadUrlRef.current = null;
      if (prevPending) {
        await deleteVibeStyleLibUploadedImage(prevPending).catch(() => {});
      }

      const dataUrl = await dataUrlFromFile(file);
      setExtractorImage(dataUrl);
      setExtractorResult(null);
      setLastSavedExtractorKey(null);
      setError(null);

      let uploadedUrl: string | null = null;
      try {
        uploadedUrl = await uploadVibeStyleLibImage(file);
        const data = await runExtract(file, uploadedUrl);
        pendingExtractUploadUrlRef.current = uploadedUrl;
        setExtractorResult(data);
        setResultTab("summary");
      } catch {
        if (uploadedUrl) {
          await deleteVibeStyleLibUploadedImage(uploadedUrl).catch(() => {});
        }
        pendingExtractUploadUrlRef.current = null;
        setExtractorImage(null);
        setExtractorResult(null);
      }
    },
    [runExtract],
  );

  const saveExtractorToLibrary = useCallback(async () => {
    if (!extractorImage || !extractorResult) return;
    setSavingToLibrary(true);
    setError(null);
    let imageUrlForAttempt: string | null = null;
    try {
      const pendingUrl = pendingExtractUploadUrlRef.current;
      if (pendingUrl?.startsWith("/uploads/vibe-snap/")) {
        imageUrlForAttempt = pendingUrl;
      } else {
        const resp = await fetch(extractorImage);
        const blob = await resp.blob();
        const ext = blob.type === "image/png" ? ".png" : ".jpg";
        const file = new File([blob], `extractor${ext}`, { type: blob.type });
        imageUrlForAttempt = await uploadVibeStyleLibImage(file);
      }

      const draft = libraryItemFromExtract(imageUrlForAttempt, extractorResult, user);
      const saved = await saveVibeStyleLibLibraryItem(draft);
      pendingExtractUploadUrlRef.current = null;
      setLibrary((prev) => [saved, ...prev]);
      setLastSavedExtractorKey(
        extractorSessionKey(saved.imageUrl, {
          designPrompt: saved.designPrompt,
          designSummary: saved.designSummary,
        }),
      );
    } catch (e) {
      if (imageUrlForAttempt?.startsWith("/uploads/vibe-snap/")) {
        await deleteVibeStyleLibUploadedImage(imageUrlForAttempt).catch(() => {});
      }
      pendingExtractUploadUrlRef.current = null;
      setError(e instanceof Error ? e.message : "保存到服务器失败");
    } finally {
      setSavingToLibrary(false);
    }
  }, [extractorImage, extractorResult, user]);

  const handleFileChosen = useCallback(
    async (file: File | null) => {
      if (!file || !file.type.startsWith("image/")) {
        setError("请选择 PNG / JPG / WEBP 图片");
        return;
      }
      setError(null);
      try {
        if (mainTab === "extractor") await analyzeInExtractor(file);
        else await addToLibrary(file);
      } catch {
        /* runExtract 已 setError */
      }
    },
    [mainTab, addToLibrary, analyzeInExtractor],
  );

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const active = document.activeElement;
      if (
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement
      )
        return;
      const items = e.clipboardData?.items;
      if (!items?.length) return;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.kind === "file" && it.type.startsWith("image/")) {
          const f = it.getAsFile();
          if (f) {
            e.preventDefault();
            void handleFileChosen(f);
          }
          break;
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [handleFileChosen]);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      void handleFileChosen(e.dataTransfer.files?.[0] ?? null);
    },
    [handleFileChosen],
  );

  const deleteLibraryItemById = useCallback(async (id: string) => {
    setDeletingDetail(true);
    setError(null);
    try {
      await deleteVibeStyleLibLibraryItem(id);
      setLibrary((prev) => prev.filter((x) => x.id !== id));
      setDetailItem((cur) => (cur?.id === id ? null : cur));
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败");
    } finally {
      setDeletingDetail(false);
    }
  }, []);

  const confirmDeleteDetailItem = useCallback(() => {
    if (!detailItem || deletingDetail) return;
    if (!window.confirm("确定删除该灵感卡片？删除后不可恢复。")) return;
    void deleteLibraryItemById(detailItem.id);
  }, [detailItem, deletingDetail, deleteLibraryItemById]);

  const openInExtractor = useCallback((item: VibeStyleLibLibraryItem) => {
    pendingExtractUploadUrlRef.current = null;
    setExtractorImage(item.imageUrl);
    setExtractorResult({
      designSummary: item.designSummary,
      designPrompt: item.designPrompt,
      libraryBlurb: item.summary,
    });
    setLastSavedExtractorKey(
      extractorSessionKey(item.imageUrl, {
        designPrompt: item.designPrompt,
        designSummary: item.designSummary,
      }),
    );
    setMainTab("extractor");
    setResultTab("summary");
    setDetailItem(null);
  }, []);

  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept="image/png,image/jpeg,image/webp,image/gif"
      className="hidden"
      onChange={(e) => {
        void handleFileChosen(e.target.files?.[0] ?? null);
        e.target.value = "";
      }}
    />
  );

  return (
    <div className={ui.page}>
      <Navbar variant="sticky" />
      <div className="w-full mx-auto py-4 flex justify-center">
        <nav className="flex items-center gap-px sm:gap-0 sm:rounded-xl sm:overflow-hidden overflow-hidden rounded-xl bg-gray-50 p-1">
          <button
            type="button"
            onClick={() => setMainTab("library")}
            className={clsx(
              ui.navBtn,
              mainTab === "library" ? ui.navActive : ui.navIdle,
            )}
          >
            灵感库
            <span
              className={clsx(
                "ml-1 flex h-5 min-w-[1.25rem] items-center justify-center border px-1.5 text-xs font-bold rounded-md",
                mainTab === "library"
                  ? "border-primary/35 bg-white/15 text-primary-600"
                  : "border-primary-300 bg-primary-100 text-primary-800",
              )}
            >
              {library.length > 99 ? "99+" : library.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setMainTab("extractor")}
            className={clsx(
              ui.navBtn,
              mainTab === "extractor" ? ui.navActive : ui.navIdle,
            )}
          >
            提取器
          </button>
        </nav>
      </div>

      {error && (
        <div className="mx-auto w-full max-w-[1600px] px-6 pt-3 sm:px-10">
          <div className="flex flex-wrap items-center justify-between gap-3 border border-border-strong bg-surface-secondary px-4 py-2 text-sm text-text-primary rounded-lg">
            <span className="min-w-0 flex-1">{error}</span>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {mainTab === "extractor" ? (
                <button
                  type="button"
                  className="text-primary-600 hover:text-primary-700 font-medium underline underline-offset-2"
                  onClick={() => {
                    setError(null);
                    fileInputRef.current?.click();
                  }}
                >
                  重新上传
                </button>
              ) : null}
              <button
                type="button"
                className="text-primary-600 hover:text-primary-700 font-medium underline underline-offset-2"
                onClick={() => setError(null)}
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {mainTab === "library" && (
        <main className="mx-auto h-px w-full max-w-[1600px] flex-1 overflow-y-auto px-6 pb-8 pb-20 sm:px-10">

          {library.length === 0 ? (
            <div
              className={clsx(
                "w-full flex flex-col items-center gap-4 cursor-default border border-dashed border-primary-200 rounded-2xl py-16 bg-primary-50/35",
              )}
            >
              <p className="text-sm font-medium text-text-primary">
                暂无已保存的提取结果
              </p>
              <p className="max-w-sm text-center text-xs text-text-secondary">
                在「提取器」中上传截图并分析后，点击「保存到灵感库」；或在本页直接粘贴图片，将自动加入此处。
              </p>
              <button
                type="button"
                className={clsx(ui.btnPrimary, "mt-2")}
                onClick={() => setMainTab("extractor")}
              >
                前往提取器
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-8 sm:grid-cols-4 lg:grid-cols-5">
              {library.map((card) => (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => setDetailItem(card)}
                  className={clsx(
                    ui.card,
                    "flex flex-col overflow-hidden text-left rounded-xl transition-all hover:border-primary-300",
                  )}
                >
                  <div className="aspect-[4/5] w-full overflow-hidden bg-surface-secondary">
                    <img
                      src={resolveVibeSnapImageUrl(card.imageUrl)}
                      alt=""
                      className="h-full w-full object-cover object-top"
                      loading="lazy"
                    />
                  </div>
                  <div className="flex flex-1 flex-col gap-3 p-4">
                    <div className="flex flex-wrap gap-1.5">
                      {card.tags.map((t) => (
                        <span key={t} className={ui.tag}>
                          {t}
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-1.5">
                      {card.colors.map((hex) => (
                        <span
                          key={hex}
                          className="h-5 w-5 shrink-0 border border-border-strong rounded-sm"
                          style={{ backgroundColor: hex }}
                        />
                      ))}
                    </div>
                    <p className="line-clamp-4 text-sm text-text-secondary leading-relaxed">
                      {card.summary}
                    </p>
                    {card.ownerName && (
                      <p className="mt-auto pt-1 text-xs text-text-tertiary">
                        by {card.ownerName}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="fixed bottom-8 right-6 z-40 sm:right-10">
            <button
              type="button"
              onClick={() => {
                setMainTab("extractor");
                setDetailItem(null);
              }}
              className={clsx(ui.fab, "h-12 w-12")}
              aria-label="打开提取器"
              title="提取器"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
                />
              </svg>
            </button>
          </div>
        </main>
      )}

      {mainTab === "extractor" && (
        <main className="mx-auto h-px w-full max-w-[1600px] flex-1 overflow-y-auto px-6 py-8 sm:px-10">
          <div className="flex gap-6 h-full">
            <div className="w-100 flex flex-col gap-4 h-full">
              <section className="border border-border rounded-xl p-4">
                <div
                  role="presentation"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={onDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={clsx(ui.inputZone, "min-h-[200px] p-8 rounded-xl")}
                >
                  <IconUpload className="text-primary-500" />
                  <p className="text-center text-sm font-medium text-text-primary">
                    点击、拖拽或粘贴图片
                  </p>
                  <p className="text-xs text-text-tertiary">
                    支持 PNG、JPG、WEBP 格式
                  </p>
                </div>
              </section>

              <section className="flex-1 h-px flex flex-col border border-border rounded-xl p-4">
                <h2 className={clsx(ui.sectionTitle, "mb-2 normal-case")}>
                  原图
                </h2>
                <div
                  className={clsx(
                    "relative flex-1 h-px overflow-auto rounded-lg bg-surface-secondary/40",
                  )}
                >
                  {extractorImage ? (
                    <img
                      src={resolveVibeSnapImageUrl(extractorImage)}
                      alt="预览"
                      className="w-full h-full object-contain object-center"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center px-6 text-center text-sm text-text-tertiary">
                      上传图片后展示原图；也可在页面任意处直接粘贴截图。
                    </div>
                  )}
                  {loading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-surface/10 backdrop-blur-xs">
                      <Spinner label="分析中…" />
                    </div>
                  )}
                </div>
              </section>
            </div>

            <div className="flex min-h-0 flex-1 shrink-0 flex-col">
              {extractorResult ? (
                <>
                  <div className="mb-3 flex shrink-0 flex-wrap items-center justify-end gap-2">
                    {extractorAlreadySaved ? (
                      <span className="text-xs text-text-tertiary">
                        已保存到灵感库
                      </span>
                    ) : (
                      <button
                        type="button"
                        className={ui.btnPrimary}
                        disabled={savingToLibrary || loading}
                        onClick={() => void saveExtractorToLibrary()}
                      >
                        {savingToLibrary ? "保存中…" : "保存到灵感库"}
                      </button>
                    )}
                  </div>
                  <div className="flex min-h-0 flex-1 flex-col">
                    <ResultPanel
                      data={extractorResult}
                      tab={resultTab}
                      setTab={setResultTab}
                    />
                  </div>
                </>
              ) : (
                <div
                  className={clsx(
                    "h-full border border-border rounded-xl flex items-center justify-center text-sm text-text-tertiary bg-surface-secondary/30",
                  )}
                >
                  上传图片后展示分析结果
                </div>
              )}
            </div>
          </div>
        </main>
      )}

      {fileInput}

      {detailItem && (
        <ModalChrome wide onClose={() => setDetailItem(null)}>
          <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
            <div className="flex items-center gap-3">
              <h2 className="font-black text-text-primary">卡片详情</h2>
              {detailItem?.ownerName && (
                <span className="text-xs text-text-tertiary">
                  by {detailItem?.ownerName}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canEditDetail && !detailEditing ? (
                <button
                  type="button"
                  className={ui.btnPrimary}
                  onClick={startDetailEdit}
                >
                  编辑
                </button>
              ) : null}
              {detailEditing ? (
                <>
                  <button
                    type="button"
                    className={ui.btnPrimary}
                    disabled={detailSaving}
                    onClick={() => void saveDetailEdits()}
                  >
                    {detailSaving ? "保存中…" : "保存"}
                  </button>
                  <button
                    type="button"
                    className={clsx(ui.btnGhost, "border border-border")}
                    disabled={detailSaving}
                    onClick={cancelDetailEdit}
                  >
                    取消
                  </button>
                </>
              ) : null}
              <button
                type="button"
                className={ui.btnGhost}
                disabled={detailEditing}
                onClick={
                  detailItem && !detailEditing
                    ? () => openInExtractor(detailItem)
                    : undefined
                }
              >
                在提取器中打开
              </button>
              {detailItem?.userId === user?.id && (
                <button
                  type="button"
                  className="border border-border-strong px-3 py-1 text-sm rounded-lg text-text-secondary hover:border-danger-300 hover:bg-danger-50 hover:text-danger-700 disabled:opacity-45 disabled:pointer-events-none"
                  disabled={deletingDetail || detailEditing}
                  onClick={confirmDeleteDetailItem}
                >
                  {deletingDetail ? "删除中…" : "删除"}
                </button>
              )}
              <button
                type="button"
                className="px-2 text-text-tertiary hover:text-text-primary"
                onClick={() =>
                  !deletingDetail && !detailSaving && setDetailItem(null)
                }
                aria-label="关闭"
              >
                ×
              </button>
            </div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            <div className="max-h-[40vh] overflow-auto border-b border-border bg-surface-secondary lg:max-h-none lg:w-[42%] lg:border-b-0 lg:border-r lg:border-border">
              <img
                src={resolveVibeSnapImageUrl(detailItem?.imageUrl)}
                alt=""
                className="min-h-[200px] w-full object-contain object-top"
              />
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-5">
              {detailEditing && detailEditDraft ? (
                <DetailEditForm
                  draft={detailEditDraft}
                  setDraft={setDetailEditDraft}
                  disabled={detailSaving}
                />
              ) : (
                <ResultPanel
                  data={{
                    designSummary: detailItem?.designSummary,
                    designPrompt: detailItem?.designPrompt,
                    libraryBlurb: detailItem?.summary,
                  }}
                  tab={detailTab}
                  setTab={setDetailTab}
                />
              )}
            </div>
          </div>
        </ModalChrome>
      )}
    </div>
  );
};

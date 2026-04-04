import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import clsx from "clsx";
import {
  deleteVibeStyleLibLibraryItem,
  listVibeStyleLibLibrary,
  saveVibeStyleLibLibraryItem,
  uploadVibeStyleLibImage,
  vibeSnapExtract,
  type VibeStyleLibExtractResult,
} from "./vibeStyleLibApi";
import type { VibeStyleLibLibraryItem } from "./vibeStyleLibApi";
import { useAuth } from "../../contexts/AuthContext";
import Navbar from "../../components/Navbar";

const STORAGE_KEY = "vibesnap-library-v1";
const MAX_FILE_BYTES = 10 * 1024 * 1024;
/** 压缩后目标最大边长 */
const COMPRESS_MAX_EDGE = 1920;
/** 压缩后 JPEG 质量 */
const COMPRESS_QUALITY = 0.85;

type MainTab = "library" | "extractor";
type ResultTab = "summary" | "prompt";

/** 极简黑白灰 */
const ui = {
  page: "h-screen flex flex-col bg-white text-neutral-900",
  header: "shrink-0 border-b border-neutral-200 bg-white",
  navBtn:
    "inline-flex items-center gap-2 rounded-none px-3 py-2 text-sm font-medium border border-transparent transition-colors",
  navActive: "bg-neutral-900 text-white border-neutral-900",
  navIdle: "text-neutral-600 hover:bg-neutral-100 border-neutral-200",
  card: "border border-neutral-200 bg-white",
  cardPad: "p-5",
  sectionTitle:
    "text-xs font-semibold uppercase tracking-wider text-neutral-500",
  body: "text-sm text-neutral-600 leading-relaxed",
  mono: "text-xs font-mono text-neutral-800",
  tag: "text-xs px-2 py-0.5 border border-neutral-200 text-neutral-700",
  btnGhost:
    "text-sm text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 px-2 py-1",
  btnPrimary:
    "text-xs font-medium px-3 py-1.5 bg-neutral-900 text-white hover:bg-neutral-800 disabled:opacity-45 disabled:pointer-events-none",
  fab: "flex items-center justify-center border border-neutral-900 bg-white text-neutral-900 hover:bg-neutral-900 hover:text-white transition-colors",
  modalBackdrop:
    "fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50",
  modalPanel:
    "bg-white border border-neutral-200 max-w-[70vw] w-full p-6 relative",
  inputZone:
    "border border-dashed border-neutral-300 bg-neutral-50 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-neutral-400 hover:bg-neutral-100 transition-colors",
} as const;

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

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
}

function IconCopy({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
      />
    </svg>
  );
}

function IconUpload({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      width="32"
      height="32"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
      />
    </svg>
  );
}

function Spinner({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-200 border-t-neutral-900"
        aria-hidden
      />
      <span className="text-xs text-neutral-500">{label}</span>
    </div>
  );
}

function ModalChrome({
  children,
  onClose,
  wide,
  ariaLabelledBy,
}: {
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  ariaLabelledBy?: string;
}) {
  return (
    <div className={ui.modalBackdrop} role="presentation" onClick={onClose}>
      <div
        className={clsx(
          ui.modalPanel,
          wide && "max-h-[90vh] max-w-[70vw] flex flex-col overflow-hidden p-0",
        )}
        role="dialog"
        aria-modal
        aria-labelledby={ariaLabelledBy}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

const RESULT_TAB_DEF: { key: ResultTab; label: string }[] = [
  { key: "summary", label: "设计总结" },
  { key: "prompt", label: "设计提示词" },
];

const VISUAL_ATTR_KEYS = [
  ["圆角", "borderRadius"],
  ["阴影", "shadow"],
  ["边框", "border"],
  ["间距", "spacing"],
] as const;

function ResultPanel({
  data,
  tab,
  setTab,
}: {
  data: VibeStyleLibExtractResult;
  tab: ResultTab;
  setTab: (t: ResultTab) => void;
}) {
  const summaryJson = JSON.stringify(data.designSummary, null, 2);
  const va = data.designSummary.visualAttributes;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-4 flex shrink-0 border border-neutral-200">
        {RESULT_TAB_DEF.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={clsx(
              "flex-1 py-2.5 text-sm font-medium transition-colors",
              tab === key
                ? "bg-neutral-900 text-white"
                : "text-neutral-500 hover:bg-neutral-50",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "summary" ? (
        <div className="scrollbar-hide flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
          <section className={clsx(ui.card, ui.cardPad)}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <h3 className={ui.sectionTitle}>设计风格</h3>
              <button
                type="button"
                className={clsx(ui.btnPrimary)}
                onClick={() => void copyText(summaryJson)}
              >
                复制 JSON
              </button>
            </div>
            <p className={clsx(ui.body, "mb-3")}>
              {data.designSummary.styleDescription}
            </p>
            <div className="flex flex-wrap gap-2">
              {data.designSummary.styleTags.map((t) => (
                <span key={t} className={ui.tag}>
                  {t}
                </span>
              ))}
            </div>
          </section>

          <section className={clsx(ui.card, ui.cardPad)}>
            <h3 className={clsx(ui.sectionTitle, "mb-4")}>核心色板</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {data.designSummary.colors.map((c) => (
                <div
                  key={c.hex + c.name}
                  className="flex gap-3 border border-neutral-100 p-3"
                >
                  <div
                    className="h-14 w-14 shrink-0 border border-neutral-200"
                    style={{ backgroundColor: c.hex }}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-neutral-900">
                      {c.name}
                    </p>
                    <p className={ui.mono}>{c.hex}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-neutral-500">
                      {c.usage}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className={clsx(ui.card, ui.cardPad)}>
            <h3 className={clsx(ui.sectionTitle, "mb-3")}>字体排版</h3>
            <ul className="space-y-2">
              {data.designSummary.typography.map((f) => (
                <li
                  key={f.family}
                  className="flex items-center justify-between gap-2 border border-neutral-100 px-3 py-2 text-sm text-neutral-700"
                >
                  <span className="font-medium">{f.family}</span>
                  <button
                    type="button"
                    aria-label={`复制 ${f.family}`}
                    onClick={() => void copyText(f.family)}
                    className="p-1 text-neutral-400 hover:text-neutral-900"
                  >
                    <IconCopy />
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className={clsx(ui.card, ui.cardPad)}>
            <h3 className={clsx(ui.sectionTitle, "mb-4")}>视觉属性</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {VISUAL_ATTR_KEYS.map(([label, k]) => (
                <div key={k} className="border border-neutral-100 p-4">
                  <p className="mb-2 text-xs font-semibold text-neutral-400">
                    {label}
                  </p>
                  <p className="whitespace-pre-wrap text-sm text-neutral-700 leading-relaxed">
                    {va[k]}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden border border-neutral-900 bg-neutral-950">
          <div className="flex shrink-0 items-center justify-between border-b border-neutral-700 px-4 py-3">
            <span className="text-sm font-medium text-neutral-200">
              设计提示词
            </span>
            <button
              type="button"
              onClick={() => void copyText(data.designPrompt)}
              className={clsx(ui.btnPrimary, "border border-white/20")}
            >
              <span className="inline-flex items-center gap-1.5">
                <IconCopy className="h-3.5 w-3.5" />
                复制提示词
              </span>
            </button>
          </div>
          <pre className="scrollbar-hide flex-1 overflow-auto p-4 font-sans text-sm leading-relaxed text-neutral-300 whitespace-pre-wrap">
            {data.designPrompt}
          </pre>
        </div>
      )}
    </div>
  );
}

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
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const runExtract = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      const { imageBase64, mimeType } = await fileToBase64Parts(file);
      return await vibeSnapExtract({ imageBase64, mimeType });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "分析失败";
      setError(msg);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const addToLibrary = useCallback(
    async (file: File) => {
      const dataUrl = await dataUrlFromFile(file);
      // 并行：上传图片文件 + AI 分析
      const [imageUrl, data] = await Promise.all([
        uploadVibeStyleLibImage(file),
        runExtract(file),
      ]);
      const draft = libraryItemFromExtract(imageUrl, data, user);
      try {
        const saved = await saveVibeStyleLibLibraryItem(draft);
        // 本地展示用原始 dataUrl 保证即时显示
        setLibrary((prev) => [{ ...saved, imageUrl: dataUrl }, ...prev]);
        setDetailItem({ ...saved, imageUrl: dataUrl });
        return saved;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "云端保存失败";
        setError(msg);
        // 降级：本地用 dataUrl 展示
        const fallback = { ...draft, imageUrl: dataUrl };
        setLibrary((prev) => [fallback, ...prev]);
        setDetailItem(fallback);
        return fallback;
      }
    },
    [runExtract],
  );

  const analyzeInExtractor = useCallback(
    async (file: File) => {
      const dataUrl = await dataUrlFromFile(file);
      setExtractorImage(dataUrl);
      setLastSavedExtractorKey(null);
      const data = await runExtract(file);
      setExtractorResult(data);
      setResultTab("summary");
    },
    [runExtract],
  );

  const saveExtractorToLibrary = useCallback(async () => {
    if (!extractorImage || !extractorResult) return;
    setSavingToLibrary(true);
    setError(null);
    try {
      // extractorImage 是 data URL，需要转成 File 上传
      const resp = await fetch(extractorImage);
      const blob = await resp.blob();
      const ext = blob.type === "image/png" ? ".png" : ".jpg";
      const file = new File([blob], `extractor${ext}`, { type: blob.type });

      const imageUrl = await uploadVibeStyleLibImage(file);
      const draft = libraryItemFromExtract(imageUrl, extractorResult, user);
      const saved = await saveVibeStyleLibLibraryItem(draft);
      setLibrary((prev) => [saved, ...prev]);
      setLastSavedExtractorKey(
        extractorSessionKey(saved.imageUrl, {
          designPrompt: saved.designPrompt,
          designSummary: saved.designSummary,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存到服务器失败");
    } finally {
      setSavingToLibrary(false);
    }
  }, [extractorImage, extractorResult]);

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
      <div className="shrink-0 border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-6 py-3 sm:px-10">
          <span className="text-lg font-semibold tracking-tight">
            Vibe Seed Lib
          </span>
          <nav className="flex items-center gap-px sm:gap-0 sm:border sm:border-neutral-200">
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
                  "ml-1 flex h-5 min-w-[1.25rem] items-center justify-center border px-1.5 text-xs font-medium",
                  mainTab === "library"
                    ? "border-white/30 bg-transparent text-white"
                    : "border-neutral-900 bg-neutral-900 text-white",
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
          <div />
        </div>
      </div>

      {error && (
        <div className="mx-auto w-full max-w-[1600px] px-6 pt-3 sm:px-10">
          <div className="flex justify-between gap-4 border border-neutral-300 bg-neutral-50 px-4 py-2 text-sm text-neutral-800">
            <span>{error}</span>
            <button
              type="button"
              className="shrink-0 underline underline-offset-2"
              onClick={() => setError(null)}
            >
              关闭
            </button>
          </div>
        </div>
      )}

      {mainTab === "library" && (
        <main className="mx-auto h-px w-full max-w-[1600px] flex-1 overflow-y-auto px-6 py-8 pb-20 sm:px-10">
          <div className="mb-10">
            <h1 className="text-2xl font-semibold tracking-tight">
              通用灵感库
            </h1>
            <p className="mt-1 text-sm text-neutral-500">
              通用的设计提取结果和提示词模版。新截图请在「提取器」上传；在灵感库也可直接粘贴图片。
            </p>
          </div>

          {library.length === 0 ? (
            <div
              className={clsx(
                "w-full flex flex-col items-center gap-4 ursor-default border-neutral-200 py-16",
              )}
            >
              <p className="text-sm font-medium text-neutral-800">
                暂无已保存的提取结果
              </p>
              <p className="max-w-sm text-center text-xs text-neutral-500">
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
                    "flex flex-col overflow-hidden text-left transition-opacity hover:opacity-90",
                  )}
                >
                  <div className="aspect-[4/5] w-full overflow-hidden bg-neutral-100">
                    <img
                      src={card.imageUrl}
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
                          className="h-5 w-5 shrink-0 border border-neutral-200"
                          style={{ backgroundColor: hex }}
                        />
                      ))}
                    </div>
                    <p className="line-clamp-4 text-sm text-neutral-600 leading-relaxed">
                      {card.summary}
                    </p>
                    {card.ownerName && (
                      <p className="mt-auto pt-1 text-xs text-neutral-400">
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
              <section className="border border-neutral-200 p-4">
                <h2 className={clsx(ui.sectionTitle, "mb-2 normal-case")}>
                  输入设计
                </h2>
                <div
                  role="presentation"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={onDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={clsx(ui.inputZone, "min-h-[200px] p-8")}
                >
                  <IconUpload className="text-neutral-400" />
                  <p className="text-center text-sm font-medium text-neutral-800">
                    点击、拖拽或粘贴图片
                  </p>
                  <p className="text-xs text-neutral-400">
                    支持 PNG、JPG、WEBP 格式
                  </p>
                </div>
              </section>

              <section className="flex-1 h-px flex flex-col border border-neutral-200 p-4">
                <h2 className={clsx(ui.sectionTitle, "mb-2 normal-case")}>
                  原图
                </h2>
                <div className={clsx("relative flex-1 h-px overflow-auto")}>
                  {extractorImage ? (
                    <img
                      src={extractorImage}
                      alt="预览"
                      className="w-full h-full object-contain object-center"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center px-6 text-center text-sm text-neutral-400">
                      上传图片后展示原图；也可在页面任意处直接粘贴截图。
                    </div>
                  )}
                  {loading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/80">
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
                      <span className="text-xs text-neutral-500">
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
                    "h-full border border-neutral-200 flex items-center justify-center text-sm text-neutral-400",
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
          <div className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-5 py-3">
            <div className="flex items-center gap-3">
              <h2 className="font-semibold">卡片详情</h2>
              {detailItem?.ownerName && (
                <span className="text-xs text-neutral-400">
                  by {detailItem?.ownerName}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={ui.btnGhost}
                onClick={
                  detailItem ? () => openInExtractor(detailItem) : undefined
                }
              >
                在提取器中打开
              </button>
              {detailItem?.userId === user?.id && (
                <button
                  type="button"
                  className="border border-neutral-300 px-3 py-1 text-sm text-neutral-700 hover:border-neutral-900 hover:bg-neutral-50 disabled:opacity-45 disabled:pointer-events-none"
                  disabled={deletingDetail}
                  onClick={confirmDeleteDetailItem}
                >
                  {deletingDetail ? "删除中…" : "删除"}
                </button>
              )}
              <button
                type="button"
                className="px-2 text-neutral-400 hover:text-neutral-900"
                onClick={() => !deletingDetail && setDetailItem(null)}
                aria-label="关闭"
              >
                ×
              </button>
            </div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            <div className="max-h-[40vh] overflow-auto border-b border-neutral-200 bg-neutral-50 lg:max-h-none lg:w-[42%] lg:border-b-0 lg:border-r">
              <img
                src={detailItem?.imageUrl}
                alt=""
                className="min-h-[200px] w-full object-contain object-top"
              />
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-5">
              <ResultPanel
                data={{
                  designSummary: detailItem?.designSummary,
                  designPrompt: detailItem?.designPrompt,
                  libraryBlurb: detailItem?.summary,
                }}
                tab={detailTab}
                setTab={setDetailTab}
              />
            </div>
          </div>
        </ModalChrome>
      )}
    </div>
  );
};

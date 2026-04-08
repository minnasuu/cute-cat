import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import Navbar from "../../components/Navbar";
import { useAuth } from "../../contexts/AuthContext";
import {
  createVibeAssetsStyleItem,
  createVibeFontAsset,
  deleteVibeAssetsStyleItem,
  deleteVibeFontAsset,
  listVibeAssetsFonts,
  listVibeAssetsStyles,
  type AssetsScope,
  type VibeAssetsStyleItem,
  type VibeFontAssetItem,
  updateVibeAssetsStyleItem,
  updateVibeFontAsset,
  uploadVibeFontFile,
} from "./vibeAssetsApi";
import {
  deleteVibeStyleLibUploadedImage,
  uploadVibeStyleLibImage,
  vibeSnapExtract,
} from "../VibeStyleLib/vibeStyleLibApi";

type MainTab = "styles" | "fonts";
type ScopeTab = AssetsScope;
type ResultTab = "summary" | "prompt";

const ui = {
  page: "h-screen flex flex-col bg-surface text-text-primary selection:bg-primary-100 selection:text-primary-900",
  header: "shrink-0 border-b border-border bg-surface",
  tabs: "flex items-center gap-2",
  tabBtn:
    "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium border border-transparent transition-colors",
  tabActive: "text-primary-600 bg-primary-100 border-primary-600",
  tabIdle:
    "text-text-secondary hover:bg-primary-50/80 hover:text-primary-800 border-border",
  card: "rounded-lg border border-border bg-surface",
  cardPad: "p-5",
  sectionTitle:
    "text-xs font-semibold uppercase tracking-wider text-primary-700",
  body: "text-sm text-text-secondary leading-relaxed",
  input:
    "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-primary-400",
  btnPrimary:
    "text-xs font-medium px-3 py-1.5 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-45 disabled:pointer-events-none",
  btnGhost:
    "text-xs font-medium px-3 py-1.5 rounded-lg border border-border text-text-secondary hover:bg-primary-50/70 hover:text-primary-800 disabled:opacity-45 disabled:pointer-events-none",
  pill:
    "text-xs px-2 py-0.5 rounded-md border border-primary-200 bg-primary-50/90 text-primary-800",
  toggleWrap:
    "inline-flex items-center gap-2 text-xs font-medium text-text-secondary",
  toggle:
    "h-5 w-9 rounded-full border border-border relative transition-colors",
  toggleOn: "bg-primary-600",
  toggleOff: "bg-surface-secondary",
  toggleKnob:
    "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform",
  modalBackdrop:
    "fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50",
  modalPanel:
    "bg-surface border border-border max-w-[70vw] w-full p-6 relative rounded-xl",
} as const;

function Toggle({
  value,
  onChange,
  disabled,
  label,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <span className={ui.toggleWrap}>
      {label}
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(!value)}
        className={clsx(ui.toggle, value ? ui.toggleOn : ui.toggleOff, disabled && "opacity-50")}
        aria-pressed={value}
      >
        <span
          className={clsx(
            ui.toggleKnob,
            value ? "translate-x-4" : "translate-x-0.5",
          )}
        />
      </button>
    </span>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={ui.modalBackdrop} role="presentation" onClick={onClose}>
      <div
        className={ui.modalPanel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 mb-4">
          <h3 className="text-base font-semibold text-text-primary">{title}</h3>
          <button type="button" onClick={onClose} className={ui.btnGhost}>
            关闭
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export const VibeAssets = () => {
  const { user, isAdmin } = useAuth();

  const [mainTab, setMainTab] = useState<MainTab>("styles");
  const [scope, setScope] = useState<ScopeTab>("all");

  // ---------- Styles state ----------
  const [styles, setStyles] = useState<VibeAssetsStyleItem[]>([]);
  const [stylesLoading, setStylesLoading] = useState(false);
  const [stylesError, setStylesError] = useState<string | null>(null);

  const [extractorImagePreview, setExtractorImagePreview] = useState<string | null>(null);
  const [extractorServerUrl, setExtractorServerUrl] = useState<string | null>(null);
  const [extractorResult, setExtractorResult] = useState<any | null>(null);
  const [extractorResultTab, setExtractorResultTab] = useState<ResultTab>("summary");
  const pendingUploadedStyleImageRef = useRef<string | null>(null);

  const [styleDetail, setStyleDetail] = useState<VibeAssetsStyleItem | null>(null);

  const loadStyles = useCallback(async () => {
    setStylesLoading(true);
    setStylesError(null);
    try {
      const items = await listVibeAssetsStyles({ scope });
      setStyles(items);
    } catch (e) {
      setStylesError(e instanceof Error ? e.message : String(e));
    } finally {
      setStylesLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    if (mainTab !== "styles") return;
    void loadStyles();
  }, [mainTab, loadStyles]);

  // ---------- Fonts state ----------
  const [fonts, setFonts] = useState<VibeFontAssetItem[]>([]);
  const [fontsLoading, setFontsLoading] = useState(false);
  const [fontsError, setFontsError] = useState<string | null>(null);
  const [fontFamily, setFontFamily] = useState("");
  const [fontAiEnabled, setFontAiEnabled] = useState(true);
  const [fontFileUploading, setFontFileUploading] = useState(false);
  const fontFileInputRef = useRef<HTMLInputElement>(null);

  const loadFonts = useCallback(async () => {
    setFontsLoading(true);
    setFontsError(null);
    try {
      const items = await listVibeAssetsFonts({ scope });
      setFonts(items);
    } catch (e) {
      setFontsError(e instanceof Error ? e.message : String(e));
    } finally {
      setFontsLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    if (mainTab !== "fonts") return;
    void loadFonts();
  }, [mainTab, loadFonts]);

  const canManageItem = useCallback(
    (itemUserId?: string | null, isOfficial?: boolean) => {
      if (isAdmin) return true;
      if (isOfficial) return false;
      return !!user?.id && !!itemUserId && itemUserId === user.id;
    },
    [isAdmin, user?.id],
  );

  const onPickStyleImage = useCallback(async (file: File) => {
    setStylesError(null);
    setExtractorResult(null);
    setExtractorServerUrl(null);
    setExtractorImagePreview(URL.createObjectURL(file));

    // upload first (avoid base64 413)
    const url = await uploadVibeStyleLibImage(file);
    pendingUploadedStyleImageRef.current = url;
    setExtractorServerUrl(url);
  }, []);

  const runStyleExtract = useCallback(async () => {
    if (!extractorServerUrl) return;
    setStylesError(null);
    try {
      const r = await vibeSnapExtract({ imageUrl: extractorServerUrl });
      setExtractorResult(r);
      setExtractorResultTab("summary");
    } catch (e) {
      setStylesError(e instanceof Error ? e.message : String(e));
    }
  }, [extractorServerUrl]);

  const saveExtractedStyle = useCallback(async () => {
    if (!extractorServerUrl || !extractorResult) return;
    setStylesError(null);
    try {
      const draft = {
        imageUrl: extractorServerUrl,
        tags: Array.isArray(extractorResult.designSummary?.styleTags)
          ? extractorResult.designSummary.styleTags.slice(0, 8)
          : [],
        colors: Array.isArray(extractorResult.designSummary?.colors)
          ? extractorResult.designSummary.colors
              .map((c: any) => c?.hex)
              .filter(Boolean)
              .slice(0, 10)
          : [],
        summary:
          (extractorResult.libraryBlurb as string) ||
          (extractorResult.designSummary?.styleDescription as string) ||
          "",
        designSummary: extractorResult.designSummary,
        designPrompt: String(extractorResult.designPrompt || ""),
        ownerName: user?.nickname || "",
      };
      const created = await createVibeAssetsStyleItem(draft);
      setStyles((prev) => [created, ...prev]);
      pendingUploadedStyleImageRef.current = null;
      setExtractorResult(null);
      setExtractorServerUrl(null);
      if (extractorImagePreview) URL.revokeObjectURL(extractorImagePreview);
      setExtractorImagePreview(null);
    } catch (e) {
      setStylesError(e instanceof Error ? e.message : String(e));
    }
  }, [extractorServerUrl, extractorResult, extractorImagePreview, user?.nickname]);

  useEffect(() => {
    return () => {
      const pending = pendingUploadedStyleImageRef.current;
      if (pending) {
        void deleteVibeStyleLibUploadedImage(pending).catch(() => {});
      }
      if (extractorImagePreview) URL.revokeObjectURL(extractorImagePreview);
    };
  }, [extractorImagePreview]);

  const styleScopeTabs: { id: ScopeTab; label: string }[] = useMemo(
    () => [
      { id: "all", label: "全部" },
      { id: "official", label: "官方" },
      { id: "mine", label: "我的上传" },
    ],
    [],
  );

  const onUploadFont = useCallback(async (file: File) => {
    setFontsError(null);
    setFontFileUploading(true);
    try {
      const uploaded = await uploadVibeFontFile(file);
      const created = await createVibeFontAsset({
        fileUrl: uploaded.url,
        filename: uploaded.filename,
        mimeType: uploaded.mimeType,
        sizeBytes: uploaded.sizeBytes,
        family: fontFamily.trim() || file.name.replace(/\.(ttf|otf|woff|woff2)$/i, ""),
        tags: [],
        aiEnabled: fontAiEnabled,
      });
      setFonts((prev) => [created, ...prev]);
      setFontFamily("");
      setFontAiEnabled(true);
      if (fontFileInputRef.current) fontFileInputRef.current.value = "";
    } catch (e) {
      setFontsError(e instanceof Error ? e.message : String(e));
    } finally {
      setFontFileUploading(false);
    }
  }, [fontAiEnabled, fontFamily]);

  return (
    <div className={ui.page}>
      <header className={ui.header}>
        <Navbar />
      </header>

      <main className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-6xl px-6 py-6">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h1 className="text-xl font-semibold text-text-primary">VibeAssets</h1>
              <p className={ui.body}>官方资源与用户上传资源的统一资产库（风格 / 字体）。</p>
            </div>
            <div className={ui.tabs}>
              <button
                type="button"
                onClick={() => setMainTab("styles")}
                className={clsx(ui.tabBtn, mainTab === "styles" ? ui.tabActive : ui.tabIdle)}
              >
                设计风格
              </button>
              <button
                type="button"
                onClick={() => setMainTab("fonts")}
                className={clsx(ui.tabBtn, mainTab === "fonts" ? ui.tabActive : ui.tabIdle)}
              >
                字体
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 mb-6">
            {styleScopeTabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setScope(t.id)}
                className={clsx(ui.tabBtn, scope === t.id ? ui.tabActive : ui.tabIdle)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {mainTab === "styles" ? (
            <div className="grid grid-cols-1 gap-6">
              <section className={clsx(ui.card, ui.cardPad)}>
                <div className="flex items-center justify-between gap-4 mb-3">
                  <h2 className="text-sm font-semibold text-text-primary">新增风格（截图提取）</h2>
                  <button
                    type="button"
                    className={ui.btnGhost}
                    onClick={() => {
                      setExtractorResult(null);
                      setExtractorServerUrl(null);
                      if (extractorImagePreview) URL.revokeObjectURL(extractorImagePreview);
                      setExtractorImagePreview(null);
                    }}
                  >
                    清空
                  </button>
                </div>

                <div className="flex flex-col gap-3">
                  <input
                    type="file"
                    accept="image/*"
                    className="text-sm"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void onPickStyleImage(f);
                    }}
                  />
                  {extractorImagePreview ? (
                    <img
                      src={extractorImagePreview}
                      alt="preview"
                      className="max-h-80 w-auto rounded-lg border border-border"
                    />
                  ) : null}

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className={ui.btnPrimary}
                      disabled={!extractorServerUrl}
                      onClick={() => void runStyleExtract()}
                    >
                      提取风格
                    </button>
                    <button
                      type="button"
                      className={ui.btnPrimary}
                      disabled={!extractorResult || !extractorServerUrl}
                      onClick={() => void saveExtractedStyle()}
                    >
                      保存到资产库
                    </button>
                  </div>
                  {stylesError ? <div className="text-sm text-red-600">{stylesError}</div> : null}
                </div>

                {extractorResult ? (
                  <div className="mt-4">
                    <div className="flex items-center gap-2 mb-2">
                      <button
                        type="button"
                        onClick={() => setExtractorResultTab("summary")}
                        className={clsx(ui.tabBtn, extractorResultTab === "summary" ? ui.tabActive : ui.tabIdle)}
                      >
                        总结
                      </button>
                      <button
                        type="button"
                        onClick={() => setExtractorResultTab("prompt")}
                        className={clsx(ui.tabBtn, extractorResultTab === "prompt" ? ui.tabActive : ui.tabIdle)}
                      >
                        Prompt
                      </button>
                    </div>
                    <div className="rounded-lg border border-border bg-surface-secondary p-4 text-sm whitespace-pre-wrap">
                      {extractorResultTab === "summary"
                        ? String(extractorResult.designSummary?.styleDescription || "")
                        : String(extractorResult.designPrompt || "")}
                    </div>
                  </div>
                ) : null}
              </section>

              <section className={clsx(ui.card, ui.cardPad)}>
                <div className="flex items-center justify-between gap-4 mb-3">
                  <h2 className="text-sm font-semibold text-text-primary">风格资产</h2>
                  <button type="button" className={ui.btnGhost} onClick={() => void loadStyles()}>
                    刷新
                  </button>
                </div>
                {stylesLoading ? (
                  <div className={ui.body}>加载中…</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {styles.map((it) => (
                      <button
                        key={it.id}
                        type="button"
                        className="text-left rounded-lg border border-border bg-surface hover:bg-primary-50/40 transition-colors overflow-hidden"
                        onClick={() => setStyleDetail(it)}
                      >
                        <img
                          src={it.imageUrl}
                          alt={it.summary}
                          className="h-40 w-full object-cover border-b border-border"
                        />
                        <div className="p-4 flex flex-col gap-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium text-text-primary line-clamp-1">
                              {it.summary || "（无摘要）"}
                            </span>
                            <span className={ui.pill}>{it.isOfficial ? "官方" : "用户"}</span>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={ui.pill}>{it.aiEnabled ? "AI:开" : "AI:关"}</span>
                            {(it.tags || []).slice(0, 4).map((t) => (
                              <span key={t} className={ui.pill}>
                                {t}
                              </span>
                            ))}
                          </div>
                        </div>
                      </button>
                    ))}
                    {styles.length === 0 ? (
                      <div className={ui.body}>暂无风格资产</div>
                    ) : null}
                  </div>
                )}
              </section>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6">
              <section className={clsx(ui.card, ui.cardPad)}>
                <h2 className="text-sm font-semibold text-text-primary mb-3">上传字体</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1">
                    <span className={ui.sectionTitle}>字体家族名（可选）</span>
                    <input
                      className={ui.input}
                      value={fontFamily}
                      onChange={(e) => setFontFamily(e.target.value)}
                      placeholder="例如：Inter / PingFang SC"
                    />
                  </label>
                  <div className="flex items-end justify-between gap-3">
                    <Toggle
                      label="AI 可用"
                      value={fontAiEnabled}
                      onChange={setFontAiEnabled}
                      disabled={fontFileUploading}
                    />
                    <input
                      ref={fontFileInputRef}
                      type="file"
                      accept=".ttf,.otf,.woff,.woff2"
                      className="text-sm"
                      disabled={fontFileUploading}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void onUploadFont(f);
                      }}
                    />
                  </div>
                </div>
                {fontsError ? <div className="mt-3 text-sm text-red-600">{fontsError}</div> : null}
              </section>

              <section className={clsx(ui.card, ui.cardPad)}>
                <div className="flex items-center justify-between gap-4 mb-3">
                  <h2 className="text-sm font-semibold text-text-primary">字体资产</h2>
                  <button type="button" className={ui.btnGhost} onClick={() => void loadFonts()}>
                    刷新
                  </button>
                </div>
                {fontsLoading ? (
                  <div className={ui.body}>加载中…</div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {fonts.map((f) => (
                      <div
                        key={f.id}
                        className="rounded-lg border border-border bg-surface p-4 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-text-primary">
                              {f.family || f.filename}
                            </span>
                            <span className={ui.pill}>{f.isOfficial ? "官方" : "用户"}</span>
                            <span className={ui.pill}>{f.aiEnabled ? "AI:开" : "AI:关"}</span>
                          </div>
                          <a
                            className="text-xs text-primary-700 hover:underline break-all"
                            href={f.fileUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {f.fileUrl}
                          </a>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <Toggle
                            label="AI"
                            value={f.aiEnabled}
                            disabled={!canManageItem(f.userId, f.isOfficial)}
                            onChange={(v) => {
                              const prev = f.aiEnabled;
                              setFonts((p) => p.map((x) => (x.id === f.id ? { ...x, aiEnabled: v } : x)));
                              void updateVibeFontAsset(f.id, { aiEnabled: v }).catch(() => {
                                setFonts((p) => p.map((x) => (x.id === f.id ? { ...x, aiEnabled: prev } : x)));
                              });
                            }}
                          />
                          <button
                            type="button"
                            className={ui.btnGhost}
                            disabled={!canManageItem(f.userId, f.isOfficial)}
                            onClick={() => {
                              const prev = fonts;
                              setFonts((p) => p.filter((x) => x.id !== f.id));
                              void deleteVibeFontAsset(f.id).catch(() => setFonts(prev));
                            }}
                          >
                            删除
                          </button>
                        </div>
                      </div>
                    ))}
                    {fonts.length === 0 ? <div className={ui.body}>暂无字体资产</div> : null}
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      </main>

      {styleDetail ? (
        <Modal title="风格详情" onClose={() => setStyleDetail(null)}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <img
              src={styleDetail.imageUrl}
              alt="style"
              className="w-full rounded-lg border border-border object-cover"
            />
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <span className={ui.pill}>{styleDetail.isOfficial ? "官方" : "用户"}</span>
                <Toggle
                  label="AI 可用"
                  value={styleDetail.aiEnabled}
                  disabled={!canManageItem(styleDetail.userId, styleDetail.isOfficial)}
                  onChange={(v) => {
                    const prev = styleDetail.aiEnabled;
                    setStyleDetail({ ...styleDetail, aiEnabled: v });
                    setStyles((p) => p.map((x) => (x.id === styleDetail.id ? { ...x, aiEnabled: v } : x)));
                    void updateVibeAssetsStyleItem(styleDetail.id, { aiEnabled: v }).catch(() => {
                      setStyleDetail({ ...styleDetail, aiEnabled: prev });
                      setStyles((p) => p.map((x) => (x.id === styleDetail.id ? { ...x, aiEnabled: prev } : x)));
                    });
                  }}
                />
              </div>

              <div>
                <div className={ui.sectionTitle}>摘要</div>
                <div className="text-sm text-text-primary whitespace-pre-wrap">
                  {styleDetail.summary}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {(styleDetail.tags || []).map((t) => (
                  <span key={t} className={ui.pill}>
                    {t}
                  </span>
                ))}
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  className={ui.btnGhost}
                  disabled={!canManageItem(styleDetail.userId, styleDetail.isOfficial)}
                  onClick={() => {
                    const id = styleDetail.id;
                    const prev = styles;
                    setStyles((p) => p.filter((x) => x.id !== id));
                    setStyleDetail(null);
                    void deleteVibeAssetsStyleItem(id).catch(() => setStyles(prev));
                  }}
                >
                  删除
                </button>
              </div>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
};


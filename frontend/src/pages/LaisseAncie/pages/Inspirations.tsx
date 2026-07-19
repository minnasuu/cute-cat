import { useCallback, useEffect, useRef, useState } from "react";
import { compressForUpload } from "../lib/images";
import { buildSimilarPrompt } from "../lib/similar-prompt";
import { useCurrentTeam } from "../../../contexts/CurrentTeamContext";
import { useComposerPrompt } from "../contexts/composer-prompt";
import { teamApi, apiClient } from "../lib/api";
import { showToast } from "../../../components/Toast";

const TAKE = 24;

interface InspirationItem {
  id: string;
  url: string;
  thumbUrl?: string;
  mime?: string;
  bytes?: number;
  category?: string | null;
  visualStyle?: string | null;
  designApproach?: string | null;
  inspiration?: string[];
  analysisStatus?: "pending" | "success" | "failed" | null;
  analysisError?: string | null;
  useCount: number;
  createdAt: string;
}

type Filter = { category?: string; visualStyle?: string; sort: "recent" | "uses" };

export default function InspinationsPage() {
  const { teamId } = useCurrentTeam();
  const [items, setItems] = useState<InspirationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>({ sort: "recent" });
  const [catalog, setCatalog] = useState<{ categories: string[]; visualStyles: string[] }>({ categories: [], visualStyles: [] });
  const [uploads, setUploads] = useState<{ id: string; file: string; status: "compressing" | "uploading" | "error" }[]>([]);
  const [editing, setEditing] = useState<InspirationItem | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [batchDeleting, setBatchDeleting] = useState(false);

  const cursorRef = useRef<string | null>(null);
  useEffect(() => { cursorRef.current = cursor; }, [cursor]);

  // 粘贴图片:保有一份最新 handleFiles,避免闭包过期(循环依赖)
  const handleFilesRef = useRef(handleFiles);
  useEffect(() => { handleFilesRef.current = handleFiles; }, [handleFiles]);

  const fetchList = useCallback(async (append: boolean, appendCursor: string | null) => {
    if (!teamId) return;
    setLoading(true);
    try {
      const data = await teamApi(teamId).listInspirations({
        q, category: filter.category, visualStyle: filter.visualStyle, take: TAKE, cursor: appendCursor ?? undefined,
      });
      setItems((prev) => append ? [...prev, ...data.items] : data.items);
      setCursor(data.nextCursor);
      setTotal(data.total);
    } finally { setLoading(false); }
  }, [teamId, q, filter.category, filter.visualStyle]);

  useEffect(() => { void fetchList(false, null); }, [q, filter.category, filter.visualStyle, filter.sort, fetchList]);

  useEffect(() => {
    if (!teamId) return;
    teamApi(teamId).listInspirations({ take: 96 })
      .then((all: { items: InspirationItem[] }) => {
        const cats = new Set<string>();
        const vstyles = new Set<string>();
        for (const it of all.items) {
          if (it.category) cats.add(it.category);
          if (it.visualStyle) vstyles.add(it.visualStyle);
        }
        setCatalog({ categories: Array.from(cats), visualStyles: Array.from(vstyles) });
      }).catch(() => { });
  }, [total, teamId]);

  const loadMore = () => { if (!loading && cursorRef.current) void fetchList(true, cursorRef.current); };

  // 上传图片大小上限:1 MB(与后端 multer 一致,前端先拦一次省流量)
  const MAX_UPLOAD_BYTES = 1 * 1024 * 1024;

  /* ── file ingestion ──────────────────────────────────────────── */
  async function handleFiles(list: FileList | File[]) {
    for (const raw of Array.from(list)) {
      // 前端预检:超 1MB 直接报错,不发请求
      if (raw.size > MAX_UPLOAD_BYTES) {
        showToast(`「${raw.name || '图片'}」超过 1MB,请压缩后再上传`, 'warning');
        continue;
      }
      const id = crypto.randomUUID();
      setUploads((u) => [...u, { id, file: raw.name, status: "compressing" }]);
      try {
        const compressed = await compressForUpload(raw);
        setUploads((u) => u.map((e) => e.id === id ? { ...e, status: "uploading" } : e));
        const fd = new FormData();
        fd.append("file", compressed);
        if (!teamId) return;
        const res = await teamApi(teamId).uploadInspiration(fd);
        if (!res) throw new Error("upload failed");
        setUploads((u) => u.filter((e) => e.id !== id));
        void fetchList(false, null);
      } catch (err) {
        console.error("[upload] failed", err);
        setUploads((u) => u.map((e) => e.id === id ? { ...e, status: "error" } : e));
      }
    }
  }

  const onDrop = (e: React.DragEvent) => { e.preventDefault(); if (e.dataTransfer.files?.length) void handleFiles(e.dataTransfer.files); };

  // 粘贴图片自动识别:监听页面级 paste,把剪贴板里的图片直接送入上传+AI 分析流程
  // 注意:工作台用 display:none 常驻挂载访问过的 tab,组件不会卸载,
  // 所以必须判断当前激活 tab 是 inspirations 才处理,避免误触其他 tab(插画/款式...)下的粘贴。
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      // 仅灵感 tab 激活时处理粘贴(其他 tab 下不拦截,即便是常驻挂载)
      const tab = new URLSearchParams(window.location.search).get("tab");
      if (tab !== "inspirations") return;
      // 编辑 modal / 搜索框等输入态下不拦截,避免干扰正常文本粘贴
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || (active instanceof HTMLElement && active.isContentEditable)) return;
      const items = e.clipboardData?.items;
      if (!items?.length) return;
      const images: File[] = [];
      for (const it of Array.from(items)) {
        if (it.kind === "file" && it.type.startsWith("image/")) {
          const f = it.getAsFile();
          if (f) images.push(f);
        }
      }
      if (!images.length) return;
      e.preventDefault();
      void handleFilesRef.current(images);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  // 重试 AI 分析
  async function handleRetry(id: string) {
    if (!teamId) return;
    // 乐观更新:立刻把状态拨回 pending,UI 同步响应
    setItems((prev) => prev.map((it) => it.id === id ? { ...it, analysisStatus: 'pending', analysisError: undefined } : it));
    try {
      const res = await teamApi(teamId).analyzeInspiration(id) as {
        status?: string;
        analysisStatus?: string;
        analysisError?: string | null;
        category?: string | null;
      };
      if (res?.status === 'failed') {
        // 后端分析失败 → 把分析错误回写到该 item 上
        setItems((prev) => prev.map((it) => it.id === id ? {
          ...it,
          analysisStatus: 'failed' as const,
          analysisError: res.analysisError || 'unknown',
        } : it));
        if (res.analysisError === 'insufficient_coins') {
          showToast('喵币不足,请充值后再分析', 'warning');
        }
      }
      // status === 'success' 无需处理,后续 polling 轮会拿到新状态
    } catch (err) {
      // 请求本身失败(网络/5xx) → 改回 failed
      console.error("[retry] failed", err);
      setItems((prev) => prev.map((it) => it.id === id ? { ...it, analysisStatus: 'failed', analysisError: 'network' } : it));
    }
  }

  // 上传/重试后轮询:只要还有 pending 的图,就每 3s 拉一次列表,直到全部出结果(或超时 3 分钟)
  const pendingIds = items.filter((it) => it.analysisStatus === 'pending').map((it) => it.id);
  useEffect(() => {
    if (pendingIds.length === 0 || !teamId) return;
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 60; // ~3 分钟上限
    const tick = async () => {
      if (cancelled || attempts >= maxAttempts) return;
      attempts += 1;
      let data;
      try {
        data = await teamApi(teamId).listInspirations({ q, category: filter.category, visualStyle: filter.visualStyle, take: TAKE });
        setItems(data.items ?? []);
        setTotal(data.total);
      } catch { /* 轮询失败静默 */ }
      // 还有 pending 就继续
      const stillPending = (data?.items ?? []).some((it: InspirationItem) => it.analysisStatus === 'pending');
      if (stillPending && !cancelled && attempts < maxAttempts) {
        setTimeout(tick, 3000);
      }
    };
    const t = setTimeout(tick, 3000);
    return () => { cancelled = true; clearTimeout(t); };
  }, [teamId, q, filter.category, pendingIds.join(',')]);

  async function handleDelete(id: string) {
    if (!teamId) return;
    try {
      await teamApi(teamId).deleteInspiration(id);
      setItems((prev) => prev.filter((it) => it.id !== id));
      setTotal((t) => Math.max(0, t - 1));
      setSelectedIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (e) {
      console.error("delete failed", e);
      alert("删除失败");
    }
  }

  function toggleSelectMode() {
    setSelectMode((m) => {
      if (m) setSelectedIds(new Set());
      return !m;
    });
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    setSelectedIds(new Set(items.map((it) => it.id)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function handleBatchDelete() {
    if (!teamId || selectedIds.size === 0) return;
    const count = selectedIds.size;
    if (!confirm(`确认删除选中的 ${count} 张灵感图？不可恢复。`)) return;
    setBatchDeleting(true);
    const ids = Array.from(selectedIds);
    const failed: string[] = [];
    try {
      // 并行删除,单条失败不阻断其余
      await Promise.all(
        ids.map(async (id) => {
          try {
            await teamApi(teamId).deleteInspiration(id);
          } catch {
            failed.push(id);
          }
        }),
      );
      const okIds = new Set(ids.filter((id) => !failed.includes(id)));
      setItems((prev) => prev.filter((it) => !okIds.has(it.id)));
      setTotal((t) => Math.max(0, t - okIds.size));
      setSelectedIds(new Set(failed));
      if (failed.length === 0) {
        showToast(`已删除 ${okIds.size} 张灵感`, "success");
        setSelectMode(false);
      } else {
        showToast(`删除完成:成功 ${okIds.size} · 失败 ${failed.length}`, "warning");
      }
    } finally {
      setBatchDeleting(false);
    }
  }

  async function handleSaveEdit(data: Partial<InspirationItem>) {
    if (!teamId || !editing) return;
    const updated = await apiClient.patch(`/api/teams/${teamId}/inspirations/${editing.id}`, data);
    setItems((prev) => prev.map((it) => it.id === editing.id ? { ...it, ...updated } : it));
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">
      <header className="flex items-start justify-between mb-6 gap-3">
        <div>
          <h1 className="text-[32px] font-semibold text-text-primary tracking-tight">灵感</h1>
          <p className="text-sm text-text-tertiary mt-1">
            {total > 0 ? `工作室共有 ${total} 张灵感图` : "拖入或粘贴一张图片，开启你的工作室"}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {items.length > 0 && (
            <button
              type="button"
              onClick={toggleSelectMode}
              className={`rounded-xl border px-4 py-2 text-sm font-medium transition-colors ${
                selectMode
                  ? "border-primary-500 bg-primary-50 text-primary-700"
                  : "border-gray-200 bg-white text-gray-700 hover:border-gray-400"
              }`}
            >
              {selectMode ? "取消选择" : "批量管理"}
            </button>
          )}
          <UploadButton onFiles={handleFiles} />
        </div>
      </header>

      {/* 编辑 modal */}
      {editing && <EditModal asset={editing} onClose={() => setEditing(null)} onSave={handleSaveEdit} />}

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <input value={q} onChange={(e) => setQ(e.currentTarget.value)} placeholder="按类别、廓形搜索…"
          className="w-60 bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" />
        <div className="inline-flex rounded-xl border border-gray-200 overflow-hidden text-xs">
          {(["recent", "uses"] as const).map((k) => (
            <button key={k} onClick={() => setFilter((f) => ({ ...f, sort: k }))}
              className={`px-3 py-2 transition-colors ${filter.sort === k ? "bg-primary-500 text-white" : "bg-white hover:bg-gray-100 text-gray-700"}`}>
              {k === "recent" ? "最近" : "最多使用"}
            </button>
          ))}
        </div>
        {/* <Pills options={catalog.categories} value={filter.category} onPick={(v) => setFilter((f) => ({ ...f, category: f.category === v ? undefined : v }))} />
        <Pills options={catalog.visualStyles} value={filter.visualStyle} onPick={(v) => setFilter((f) => ({ ...f, visualStyle: f.visualStyle === v ? undefined : v }))} /> */}
      </div>

      {selectMode && items.length > 0 && (
        <div className="sticky top-16 z-20 mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white/95 backdrop-blur px-4 py-2.5 shadow-sm">
          <span className="text-sm text-gray-700">
            已选 <span className="font-semibold text-primary-600">{selectedIds.size}</span> 张
          </span>
          <button
            type="button"
            onClick={selectAllVisible}
            className="text-sm text-gray-600 hover:text-primary-600"
          >
            全选当前页
          </button>
          <button
            type="button"
            onClick={clearSelection}
            disabled={selectedIds.size === 0}
            className="text-sm text-gray-600 hover:text-primary-600 disabled:opacity-40"
          >
            清空
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={handleBatchDelete}
            disabled={selectedIds.size === 0 || batchDeleting}
            className="rounded-xl bg-red-500 hover:bg-red-600 disabled:opacity-40 text-white px-4 py-1.5 text-sm font-medium transition-colors"
          >
            {batchDeleting ? "删除中…" : `删除所选${selectedIds.size ? ` (${selectedIds.size})` : ""}`}
          </button>
        </div>
      )}

      {uploads.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {uploads.map((u) => (
            <span key={u.id} className={`text-[11px] font-mono px-3 py-1 rounded-full border ${u.status === "error" ? "bg-red-50 border-red-200 text-red-700" : "bg-gray-50 border-gray-200 text-gray-700"}`}>
              {u.file.slice(0, 28)} · {u.status}
            </span>
          ))}
        </div>
      )}

      {items.length === 0 && !loading ? (
        <EmptyDrop onDrop={onDrop} onFiles={handleFiles} />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {items.map((it) => (
              <AssetCard
                key={it.id}
                asset={it}
                selectMode={selectMode}
                selected={selectedIds.has(it.id)}
                onToggleSelect={() => toggleSelect(it.id)}
                onDelete={handleDelete}
                onEdit={(a) => setEditing(a)}
                onRetry={handleRetry}
              />
            ))}
          </div>
          {cursor && (
            <div className="flex justify-center mt-8">
              <button onClick={loadMore} disabled={loading} className="px-4 py-2 rounded-xl border border-gray-200 text-sm hover:border-gray-800 disabled:opacity-50">
                {loading ? "加载中…" : "加载更多"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AssetCard({
  asset,
  selectMode,
  selected,
  onToggleSelect,
  onDelete,
  onEdit,
  onRetry,
}: {
  asset: InspirationItem;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onDelete: (id: string) => void;
  onEdit: (asset: InspirationItem) => void;
  onRetry: (id: string) => void;
}) {
  const { navigateTab } = useCurrentTeam();
  const { setDraftPrompt, requestReset } = useComposerPrompt();
  const hasAnalysis = asset.category || asset.visualStyle || asset.designApproach || (asset.inspiration?.length ?? 0) > 0;

  const handleMakeSimilar = (e: React.MouseEvent) => {
    e.stopPropagation();
    const prompt = buildSimilarPrompt(asset);
    if (!prompt) return;
    // 先清空工作台(等同于 +新会话),再填入整理后的文案
    requestReset();
    setDraftPrompt(prompt);
    navigateTab("single");
  };
  // 分类标签:优先 category; pending 显示 analysing; failed 显示失败+重试
  const categoryLabel = asset.analysisStatus === 'failed'
    ? (asset.analysisError === 'insufficient_coins' ? '喵币不足' : `分析失败(${asset.analysisError || 'unknown'})`)
    : asset.category || (asset.analysisStatus === 'pending' ? '分析中…' : '未分类');
  // hover 卡片上显示风格标签(如有)
  const shortStyle = asset.visualStyle
    ? (asset.visualStyle.length > 28 ? asset.visualStyle.slice(0, 28) + "…" : asset.visualStyle)
    : null;

  function handleCardClick() {
    if (selectMode) onToggleSelect();
    else onEdit(asset);
  }

  return (
    <figure
      onClick={handleCardClick}
      className={`rounded-2xl border bg-white shadow-sm hover:shadow-md transition-shadow overflow-hidden cursor-pointer group relative ${
        selected ? "border-primary-500 ring-2 ring-primary-200" : "border-gray-200"
      }`}
    >
      <div className="relative aspect-[1/1] bg-gray-100 overflow-hidden">
        <img src={asset.thumbUrl || asset.url} alt={asset.visualStyle ?? asset.category ?? "inspiration"} loading="lazy"
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.05]" />
        {/* 批量选择勾选框 */}
        {selectMode && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
            aria-label={selected ? "取消选中" : "选中"}
            className={`absolute top-2 left-2 z-20 w-6 h-6 rounded-md border-2 flex items-center justify-center shadow-sm transition-colors ${
              selected
                ? "bg-primary-500 border-primary-500 text-white"
                : "bg-white/90 border-gray-300 text-transparent hover:border-primary-400"
            }`}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
        {/* pending 时左上角转圈提示(选择模式时避让勾选框) */}
        {asset.analysisStatus === 'pending' && (
          <div
            className={`absolute z-10 w-5 h-5 rounded-full border-2 border-white/70 border-t-primary-500 animate-spin ${selectMode ? "top-2 left-10" : "top-2 left-2"}`}
            title="分析中…"
          />
        )}
        {/* 操作按钮(hover 显示;批量模式隐藏避免误触) */}
        {!selectMode && (
          <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
            {asset.analysisStatus === 'failed' && (
              <button onClick={(e) => { e.stopPropagation(); onRetry(asset.id); }}
                className="w-7 h-7 rounded-full bg-amber-500/90 hover:bg-amber-500 text-white text-xs flex items-center justify-center shadow-sm" title="重试分析">⟳</button>
            )}
            <button onClick={(e) => { e.stopPropagation(); if (confirm("删除这张灵感图？")) onDelete(asset.id); }}
              className="w-7 h-7 rounded-full bg-white/90 hover:bg-red-50 text-red-500 text-xs flex items-center justify-center shadow-sm" title="删除">✕</button>
          </div>
        )}
        {/* 制作相似(hover 显示,主操作按钮;批量模式隐藏) */}
        {!selectMode && (
          <button
            onClick={handleMakeSimilar}
            className="absolute inset-x-3 bottom-3 z-20 opacity-0 group-hover:opacity-100 transition-opacity px-3 py-1.5 rounded-full bg-primary-500 hover:bg-primary-600 text-white text-[12px] font-medium shadow-lg flex items-center justify-center gap-1.5"
            title="把这张灵感的品类·风格·思路整理后填入单品设计工作台"
          >
            灵感扩散
          </button>
        )}
        {/* 卡片底部(category + uses) */}
        <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/80 via-black/30 to-transparent text-white">
          <div className="flex items-center justify-between gap-2">
            <span className={`text-[11px] uppercase tracking-wider truncate ${asset.analysisStatus === 'failed' ? 'text-amber-300' : 'opacity-90'}`}>{categoryLabel}</span>
            {asset.useCount > 0 && <span className="text-[11px] bg-white/15 backdrop-blur px-1.5 py-0.5 rounded-full shrink-0">{asset.useCount}×</span>}
          </div>
          {shortStyle && <div className="text-[10px] opacity-80 mt-1 truncate" title={asset.visualStyle!}>{shortStyle}</div>}
          <figcaption className="text-[10px] opacity-60 mt-1 font-mono">{new Date(asset.createdAt).toLocaleDateString()}</figcaption>
        </div>
        {/* Hover 展开:4 维分析详情(批量模式不挡勾选) */}
        {hasAnalysis && !selectMode && (
          <div className="absolute inset-0 bg-black/75 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-3 text-white flex flex-col gap-2 overflow-y-auto" style={{ pointerEvents: "none" }}>
            {asset.visualStyle && (
              <div className="text-[11px] leading-relaxed"><span className="text-[10px] uppercase tracking-wider opacity-50">风格 · </span>{asset.visualStyle}</div>
            )}
            {asset.designApproach && (
              <p className="text-[11px] leading-relaxed opacity-90"><span className="text-[10px] uppercase tracking-wider opacity-50">思路 · </span>{asset.designApproach}</p>
            )}
            {asset.inspiration && asset.inspiration.length > 0 && (
              <ul className="text-[10px] leading-relaxed space-y-1 mt-1 pt-1 border-t border-white/10">
                {asset.inspiration.map((h) => <li key={h} className="opacity-85">· {h}</li>)}
              </ul>
            )}
          </div>
        )}
      </div>
    </figure>
  );
}

/** 灵感图编辑 modal —— 4 维度: category / visualStyle / designApproach / inspiration + 图片替换 */
function EditModal({ asset, onClose, onSave }: { asset: InspirationItem; onClose: () => void; onSave: (data: Partial<InspirationItem>) => Promise<void>; }) {
  const [form, setForm] = useState({
    category: asset.category || "",
    visualStyle: asset.visualStyle || "",
    designApproach: asset.designApproach || "",
    inspiration: (asset.inspiration || []).join("\n"),
  });
  const [saving, setSaving] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null); // 替换后的预览
  const fileRef = useRef<HTMLInputElement>(null);
  const { teamId } = useCurrentTeam();

  async function save() {
    setSaving(true);
    try {
      await onSave({
        category: form.category.trim() || null,
        visualStyle: form.visualStyle.trim() || null,
        designApproach: form.designApproach.trim() || null,
        inspiration: form.inspiration.split("\n").map((s) => s.trim()).filter(Boolean),
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  // 替换图片:选文件后上传,后端替换并重新分析,modal 内预览新图
  function triggerReplace() { fileRef.current?.click(); }

  async function handleReplaceFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // 重置,允许重复选同一文件
    if (!file || !teamId) return;
    setReplacing(true);
    try {
      // 客户端压缩后上传
      const compressed = await compressForUpload(file);
      const fd = new FormData();
      fd.append("file", compressed);
      const res = await apiClient.patch(`/api/teams/${teamId}/inspirations/${asset.id}/image`, fd);
      // 替换成功 → 立即在 modal 里预览新图,并触发父组件状态更新(只换图,保留分析信息)
      setPreviewUrl(res.url);
      await onSave({ id: asset.id, url: res.url, thumbUrl: res.url } as any);
    } catch (err: any) {
      console.error("[replace image] failed", err);
      alert(`替换失败: ${err?.message || err}`);
    } finally {
      setReplacing(false);
    }
  }

  const displayUrl = previewUrl || asset.thumbUrl || asset.url;

  return (
    <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-gray-200 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <header className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-white/95 backdrop-blur border-b border-gray-100 rounded-t-3xl">
          <h2 className="text-lg font-medium text-gray-900">编辑灵感分析</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-800">×</button>
        </header>
        <div className="p-6">
          <div className="grid grid-cols-[160px_1fr] gap-5 mb-5">
            {/* 图片区 + 替换按钮 */}
            <div className="relative group">
              <img src={displayUrl} alt="" className="w-full rounded-xl border border-gray-200 object-cover" style={{ aspectRatio: "3/4" }} />
              <button
                onClick={triggerReplace}
                disabled={replacing}
                className="absolute inset-x-2 bottom-2 py-1.5 rounded-lg bg-black/60 hover:bg-black/70 text-white text-[11px] font-medium text-center backdrop-blur opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
              >
                {replacing ? "上传中…" : "替换图片"}
              </button>
              {replacing && (
                <div className="absolute inset-0 bg-white/60 rounded-xl flex items-center justify-center">
                  <div className="w-6 h-6 rounded-full border-2 border-primary-500 border-t-transparent animate-spin" />
                </div>
              )}
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleReplaceFile} />
            </div>
            <div className="space-y-3">
              <FieldInput label="类别" value={form.category} onChange={(v) => setForm({ ...form, category: v })} placeholder="T恤 / 插画 / 手机壳 / …" />
              <FieldTextarea label="视觉风格" value={form.visualStyle} onChange={(v) => setForm({ ...form, visualStyle: v })} sublabel="一句话描述,如 手绘日系插画风" rows={2} />
            </div>
          </div>
          <div className="space-y-3">
            <FieldTextarea label="设计思路" value={form.designApproach} onChange={(v) => setForm({ ...form, designApproach: v })} sublabel="核心创意、构图、配色、材质的思路" rows={3} />
            <FieldTextarea label="设计启发" value={form.inspiration} onChange={(v) => setForm({ ...form, inspiration: v })} sublabel="每行一条可落地的启发" rows={5} />
          </div>
        </div>
        <footer className="sticky bottom-0 flex justify-between items-center px-6 py-4 bg-white/95 backdrop-blur border-t border-gray-100 rounded-b-3xl">
          <div className="text-[11px] text-gray-400">
            {asset.analysisStatus === 'pending' ? (
              <span className="text-primary-500">AI 分析中…</span>
            ) : asset.analysisStatus === 'failed' ? (
              <span className="text-amber-500">分析失败 ({asset.analysisError || "unknown"}) · 请保存后点击卡片上的 ⟳ 重试</span>
            ) : (
              <span>AI 已自动分析,你可以按需调整</span>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-xl border border-gray-200 text-sm hover:border-gray-800">取消</button>
            <button onClick={save} disabled={saving || replacing} className="px-5 py-2 rounded-xl bg-primary-500 text-white text-sm hover:bg-primary-600 disabled:opacity-40">{saving ? "保存中…" : "保存"}</button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function FieldInput({ label, value, onChange, placeholder, sublabel }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; sublabel?: string; }) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between"><div className="text-[10px] uppercase tracking-wider text-gray-500">{label}</div>{sublabel && <div className="text-[10px] text-gray-400">{sublabel}</div>}</div>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full mt-0.5 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary-500" />
    </label>
  );
}

function FieldTextarea({ label, value, onChange, sublabel, rows = 2 }: { label: string; value: string; onChange: (v: string) => void; sublabel?: string; rows?: number; }) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between"><div className="text-[10px] uppercase tracking-wider text-gray-500">{label}</div>{sublabel && <div className="text-[10px] text-gray-400">{sublabel}</div>}</div>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows}
        className="w-full mt-0.5 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary-500 resize-none" />
    </label>
  );
}

function Pills({ options, value, onPick }: { options: string[]; value?: string; onPick: (v: string) => void }) {
  if (options.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={o} onClick={() => onPick(o)}
          className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${value === o ? "bg-primary-500 border-primary-600 text-white" : "border-gray-200 text-gray-600 hover:border-primary-500"}`}>
          {o}
        </button>
      ))}
    </div>
  );
}

function UploadButton({ onFiles }: { onFiles: (f: FileList | File[]) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button onClick={() => ref.current?.click()} className="rounded-xl bg-primary-500 hover:bg-primary-600 text-white px-4 py-2 text-sm font-medium">+ 上传 <span className="text-[11px] opacity-80">8 喵币/张</span></button>
      <input ref={ref} type="file" accept="image/*" multiple className="hidden"
        onChange={(e) => { if (e.target.files?.length) onFiles(e.target.files); e.target.value = ""; }} />
    </>
  );
}

function EmptyDrop({ onDrop, onFiles }: { onDrop: (e: React.DragEvent) => void; onFiles: (files: FileList) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div onDragOver={(e) => e.preventDefault()} onDrop={onDrop}
      className="border-2 border-dashed border-gray-300 rounded-2xl py-20 text-center hover:border-primary-400 transition-colors">
      <div className="text-gray-500 text-sm">拖入或粘贴灵感图，或</div>
      <button onClick={() => ref.current?.click()} className="mt-3 inline-flex rounded-xl bg-primary-500 hover:bg-primary-600 text-white px-5 py-2 text-sm font-medium">选择文件</button>
      <div className="text-gray-500 text-sm mt-2">剪贴板粘贴 <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">⌘V</span></div>
      <input ref={ref} type="file" accept="image/*" multiple className="hidden"
        onChange={(e) => { if (e.target.files) onFiles(e.target.files); e.target.value = ""; }} />
      <p className="text-[11px] text-gray-500 mt-4 max-w-md mx-auto leading-relaxed">
        浏览器端自动压缩后,送 AI 做 4 维度结构化分析(类别 · 视觉风格 · 设计思路 · 设计启发)。单次上传不超过 1MB。
      </p>
    </div>
  );
}

// @ts-nocheck
import { useCallback, useEffect, useRef, useState } from "react";
import { compressForUpload } from "../lib/images";
import { useCurrentTeam } from "../../../contexts/CurrentTeamContext";
import { teamApi } from "../lib/api";

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

  const cursorRef = useRef<string | null>(null);
  useEffect(() => { cursorRef.current = cursor; }, [cursor]);

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

  /* ── file ingestion ──────────────────────────────────────────── */
  async function handleFiles(list: FileList | File[]) {
    for (const raw of Array.from(list)) {
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
      const stillPending = (data?.items ?? []).some((it) => it.analysisStatus === 'pending');
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
    } catch (e) {
      console.error("delete failed", e);
      alert("删除失败");
    }
  }

  async function handleSaveEdit(data: Partial<InspirationItem>) {
    if (!teamId || !editing) return;
    const updated = await apiClient.patch(`/api/teams/${teamId}/inspirations/${editing.id}`, data);
    setItems((prev) => prev.map((it) => it.id === editing.id ? { ...it, ...updated } : it));
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">
      <header className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-[40px] font-semibold text-gray-800 tracking-tight">Inspirations</h1>
          <p className="text-sm text-gray-500 mt-1">
            {total > 0 ? `${total} inspiration${total === 1 ? "" : "s"} in the atelier` : "Drop in an image to start your atelier"}
          </p>
        </div>
        <UploadButton onFiles={handleFiles} />
      </header>

      {/* 编辑 modal */}
      {editing && <EditModal asset={editing} onClose={() => setEditing(null)} onSave={handleSaveEdit} />}

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <input value={q} onChange={(e) => setQ(e.currentTarget.value)} placeholder="Search by category, silhouette, …"
          className="w-60 bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" />
        <div className="inline-flex rounded-xl border border-gray-200 overflow-hidden text-xs">
          {(["recent", "uses"] as const).map((k) => (
            <button key={k} onClick={() => setFilter((f) => ({ ...f, sort: k }))}
              className={`px-3 py-2 transition-colors ${filter.sort === k ? "bg-primary-500 text-white" : "bg-white hover:bg-gray-100 text-gray-700"}`}>
              {k === "recent" ? "Most recent" : "Most used"}
            </button>
          ))}
        </div>
        {/* <Pills options={catalog.categories} value={filter.category} onPick={(v) => setFilter((f) => ({ ...f, category: f.category === v ? undefined : v }))} />
        <Pills options={catalog.visualStyles} value={filter.visualStyle} onPick={(v) => setFilter((f) => ({ ...f, visualStyle: f.visualStyle === v ? undefined : v }))} /> */}
      </div>

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
            {items.map((it) => <AssetCard key={it.id} asset={it} onDelete={handleDelete} onEdit={(a) => setEditing(a)} onRetry={handleRetry} />)}
          </div>
          {cursor && (
            <div className="flex justify-center mt-8">
              <button onClick={loadMore} disabled={loading} className="px-4 py-2 rounded-xl border border-gray-200 text-sm hover:border-gray-800 disabled:opacity-50">
                {loading ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AssetCard({ asset, onDelete, onEdit, onRetry }: { asset: InspirationItem; onDelete: (id: string) => void; onEdit: (asset: InspirationItem) => void; onRetry: (id: string) => void; }) {
  const hasAnalysis = asset.category || asset.visualStyle || asset.designApproach || (asset.inspiration?.length ?? 0) > 0;
  // 分类标签:优先 category; pending 显示 analysing; failed 显示失败+重试
  const categoryLabel = asset.analysisStatus === 'failed'
    ? `分析失败(${asset.analysisError || 'unknown'})`
    : asset.category || (asset.analysisStatus === 'pending' ? 'Analysing…' : '未分类');
  // hover 卡片上显示风格标签(如有)
  const shortStyle = asset.visualStyle
    ? (asset.visualStyle.length > 28 ? asset.visualStyle.slice(0, 28) + "…" : asset.visualStyle)
    : null;
  return (
    <figure onClick={() => onEdit(asset)} className="rounded-2xl border border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow overflow-hidden cursor-pointer group">
      <div className="relative aspect-[3/4] bg-gray-100 overflow-hidden">
        <img src={asset.thumbUrl || asset.url} alt={asset.visualStyle ?? asset.category ?? "inspiration"} loading="lazy"
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.05]" />
        {/* pending 时左上角转圈提示 */}
        {asset.analysisStatus === 'pending' && (
          <div className="absolute top-2 left-2 z-10 w-5 h-5 rounded-full border-2 border-white/70 border-t-primary-500 animate-spin" title="分析中…" />
        )}
        {/* 操作按钮(hover 显示) */}
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
          {asset.analysisStatus === 'failed' && (
            <button onClick={(e) => { e.stopPropagation(); onRetry(asset.id); }}
              className="w-7 h-7 rounded-full bg-amber-500/90 hover:bg-amber-500 text-white text-xs flex items-center justify-center shadow-sm" title="重试分析">⟳</button>
          )}
          <button onClick={(e) => { e.stopPropagation(); onEdit(asset); }}
            className="w-7 h-7 rounded-full bg-white/90 hover:bg-white text-gray-700 text-xs flex items-center justify-center shadow-sm" title="编辑">✎</button>
          <button onClick={(e) => { e.stopPropagation(); if (confirm("删除这张灵感图?")) onDelete(asset.id); }}
            className="w-7 h-7 rounded-full bg-white/90 hover:bg-red-50 text-red-500 text-xs flex items-center justify-center shadow-sm" title="删除">✕</button>
        </div>
        {/* 卡片底部(category + uses) */}
        <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/80 via-black/30 to-transparent text-white">
          <div className="flex items-center justify-between gap-2">
            <span className={`text-[11px] uppercase tracking-wider truncate ${asset.analysisStatus === 'failed' ? 'text-amber-300' : 'opacity-90'}`}>{categoryLabel}</span>
            {asset.useCount > 0 && <span className="text-[11px] bg-white/15 backdrop-blur px-1.5 py-0.5 rounded-full shrink-0">{asset.useCount}×</span>}
          </div>
          {shortStyle && <div className="text-[10px] opacity-80 mt-1 truncate" title={asset.visualStyle!}>{shortStyle}</div>}
          <figcaption className="text-[10px] opacity-60 mt-1 font-mono">{new Date(asset.createdAt).toLocaleDateString()}</figcaption>
        </div>
        {/* Hover 展开:4 维分析详情 */}
        {hasAnalysis && (
          <div className="absolute inset-0 bg-black/75 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-3 text-white flex flex-col gap-2 overflow-y-auto" style={{ pointerEvents: "none" }}>
            {asset.visualStyle && (
              <div className="text-[11px] leading-relaxed"><span className="text-[10px] uppercase tracking-wider opacity-50">Style · </span>{asset.visualStyle}</div>
            )}
            {asset.designApproach && (
              <p className="text-[11px] leading-relaxed opacity-90"><span className="text-[10px] uppercase tracking-wider opacity-50">Approach · </span>{asset.designApproach}</p>
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

/** 灵感图编辑 modal —— 4 维度: category / visualStyle / designApproach / inspiration */
function EditModal({ asset, onClose, onSave }: { asset: InspirationItem; onClose: () => void; onSave: (data: Partial<InspirationItem>) => Promise<void>; }) {
  const [form, setForm] = useState({
    category: asset.category || "",
    visualStyle: asset.visualStyle || "",
    designApproach: asset.designApproach || "",
    inspiration: (asset.inspiration || []).join("\n"),
  });
  const [saving, setSaving] = useState(false);

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

  return (
    <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-gray-200 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <header className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-white/95 backdrop-blur border-b border-gray-100 rounded-t-3xl">
          <h2 className="text-lg font-medium text-gray-900">编辑灵感分析</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-800">×</button>
        </header>
        <div className="p-6">
          <div className="grid grid-cols-[160px_1fr] gap-5 mb-5">
            <img src={asset.thumbUrl || asset.url} alt="" className="w-full rounded-xl border border-gray-200 object-cover" style={{ aspectRatio: "3/4" }} />
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
            {asset.analysisStatus === 'failed' ? (
              <span className="text-amber-500">上次分析失败 ({asset.analysisError || "unknown"}) · 请保存后点击卡片上的 ⟳ 重试</span>
            ) : (
              <span>AI 已自动分析,你可以按需调整</span>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-xl border border-gray-200 text-sm hover:border-gray-800">取消</button>
            <button onClick={save} disabled={saving} className="px-5 py-2 rounded-xl bg-primary-500 text-white text-sm hover:bg-primary-600 disabled:opacity-40">{saving ? "保存中…" : "保存"}</button>
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
      <button onClick={() => ref.current?.click()} className="rounded-xl bg-primary-500 hover:bg-primary-600 text-white px-4 py-2 text-sm font-medium shadow-sm">+ Upload</button>
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
      <div className="text-gray-500 text-sm">Drag & drop inspiration images here, or</div>
      <button onClick={() => ref.current?.click()} className="mt-3 inline-flex rounded-xl bg-primary-500 hover:bg-primary-600 text-white px-5 py-2 text-sm font-medium">Choose files</button>
      <input ref={ref} type="file" accept="image/*" multiple className="hidden"
        onChange={(e) => { if (e.target.files) onFiles(e.target.files); e.target.value = ""; }} />
      <p className="text-[11px] text-gray-500 mt-4 max-w-md mx-auto leading-relaxed">
        We auto-compress on the browser, then send each image to AI for a structured 4-dimension analysis (category · visual style · design approach · inspiration).
      </p>
    </div>
  );
}

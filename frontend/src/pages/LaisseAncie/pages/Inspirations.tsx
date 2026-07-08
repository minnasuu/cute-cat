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
  silhouette?: string | null;
  colors?: string[];
  brandAnalysis?: string | null;
  designHighlights?: string[];
  styleFeatures?: string[];
  analysisStatus?: "pending" | "success" | "failed" | null;
  analysisError?: string | null;
  useCount: number;
  createdAt: string;
}

type Filter = { category?: string; silhouette?: string; sort: "recent" | "uses" };

export default function InspinationsPage() {
  const { teamId } = useCurrentTeam();
  const [items, setItems] = useState<InspirationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>({ sort: "recent" });
  const [catalog, setCatalog] = useState<{ categories: string[]; silhouettes: string[] }>({ categories: [], silhouettes: [] });
  const [uploads, setUploads] = useState<{ id: string; file: string; status: "compressing" | "uploading" | "error" }[]>([]);
  const [editing, setEditing] = useState<InspirationItem | null>(null);

  const cursorRef = useRef<string | null>(null);
  useEffect(() => { cursorRef.current = cursor; }, [cursor]);

  const fetchList = useCallback(async (append: boolean, appendCursor: string | null) => {
    if (!teamId) return;
    setLoading(true);
    try {
      const data = await teamApi(teamId).listInspirations({
        q, category: filter.category, take: TAKE, cursor: appendCursor ?? undefined,
      });
      setItems((prev) => append ? [...prev, ...data.items] : data.items);
      setCursor(data.nextCursor);
      setTotal(data.total);
    } finally { setLoading(false); }
  }, [teamId, q, filter.category]);

  useEffect(() => { void fetchList(false, null); }, [q, filter.category, filter.silhouette, filter.sort, fetchList]);

  useEffect(() => {
    if (!teamId) return;
    teamApi(teamId).listInspirations({ take: 96 })
      .then((all: { items: InspirationItem[] }) => {
        const cats = new Set<string>();
        const sils = new Set<string>();
        for (const it of all.items) {
          if (it.category) cats.add(it.category);
          if (it.silhouette) sils.add(it.silhouette);
        }
        setCatalog({ categories: Array.from(cats), silhouettes: Array.from(sils) });
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
        data = await teamApi(teamId).listInspirations({ q, category: filter.category, take: TAKE });
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
        <Pills options={catalog.categories} value={filter.category} onPick={(v) => setFilter((f) => ({ ...f, category: f.category === v ? undefined : v }))} />
        <Pills options={catalog.silhouettes} value={filter.silhouette} onPick={(v) => setFilter((f) => ({ ...f, silhouette: f.silhouette === v ? undefined : v }))} />
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
  const hasAnalysis = asset.category || asset.brandAnalysis || (asset.styleFeatures?.length ?? 0) > 0;
  // 分类标签:优先 category; pending 显示 analysing; failed 显示失败+重试
  const categoryLabel = asset.analysisStatus === 'failed'
    ? `分析失败(${asset.analysisError || 'unknown'})`
    : asset.category || (asset.analysisStatus === 'pending' ? 'analysing…' : '未分类');
  return (
    <figure className="rounded-2xl border border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow overflow-hidden cursor-pointer group">
      <div className="relative aspect-[3/4] bg-gray-100 overflow-hidden">
        <img src={asset.thumbUrl || asset.url} alt={asset.brandAnalysis ?? asset.category ?? "inspiration"} loading="lazy"
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
        {/* 基础信息(始终可见) */}
        <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/80 via-black/30 to-transparent text-white">
          <div className="flex items-center justify-between gap-2">
            <span className={`text-[11px] uppercase tracking-wider ${asset.analysisStatus === 'failed' ? 'text-amber-300' : 'opacity-90'}`}>{categoryLabel}</span>
            {asset.useCount > 0 && <span className="text-[11px] bg-white/15 backdrop-blur px-1.5 py-0.5 rounded-full">{asset.useCount} uses</span>}
          </div>
          {asset.colors?.length > 0 && (
            <div className="flex gap-1 mt-1.5">{asset.colors.map((c) => <span key={c} className="w-3 h-3 rounded-full border border-white/40" style={{ background: c }} />)}</div>
          )}
          <figcaption className="text-[10px] opacity-75 mt-1 font-mono">{new Date(asset.createdAt).toLocaleDateString()}</figcaption>
        </div>
        {/* Hover 展开:AI 分析详情 */}
        {hasAnalysis && (
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-3 text-white flex flex-col gap-2 overflow-y-auto" style={{ pointerEvents: "none" }}>
            {asset.silhouette && <div className="text-[11px]"><span className="opacity-60">廓形 · </span>{asset.silhouette}</div>}
            {asset.styleFeatures?.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {asset.styleFeatures.map((s) => <span key={s} className="text-[10px] bg-white/15 px-1.5 py-0.5 rounded-full">{s}</span>)}
              </div>
            )}
            {asset.designHighlights?.length > 0 && (
              <ul className="text-[10px] leading-relaxed space-y-0.5">
                {asset.designHighlights.map((h) => <li key={h} className="opacity-90">· {h}</li>)}
              </ul>
            )}
            {asset.brandAnalysis && <p className="text-[10px] leading-relaxed opacity-75 mt-auto">{asset.brandAnalysis}</p>}
          </div>
        )}
      </div>
    </figure>
  );
}

/** 灵感图编辑 modal */
function EditModal({ asset, onClose, onSave }: { asset: InspirationItem; onClose: () => void; onSave: (data: Partial<InspirationItem>) => Promise<void>; }) {
  const [form, setForm] = useState({
    category: asset.category || "",
    silhouette: asset.silhouette || "",
    colors: (asset.colors || []).join(", "),
    designHighlights: (asset.designHighlights || []).join("\n"),
    styleFeatures: (asset.styleFeatures || []).join("\n"),
    brandAnalysis: asset.brandAnalysis || "",
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await onSave({
        category: form.category.trim() || null,
        silhouette: form.silhouette.trim() || null,
        colors: form.colors.split(",").map((s) => s.trim()).filter(Boolean),
        designHighlights: form.designHighlights.split("\n").map((s) => s.trim()).filter(Boolean),
        styleFeatures: form.styleFeatures.split("\n").map((s) => s.trim()).filter(Boolean),
        brandAnalysis: form.brandAnalysis.trim() || null,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-center justify-center" onClick={onClose}>
      <div className="w-full max-w-xl max-h-[88vh] overflow-y-auto rounded-3xl border border-gray-200 bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-start justify-between mb-4">
          <h2 className="text-xl font-medium text-gray-900">编辑灵感分析</h2>
          <button onClick={onClose} className="text-2xl text-gray-400 hover:text-gray-800">×</button>
        </header>
        <div className="grid grid-cols-[120px_1fr] gap-4 mb-4">
          <img src={asset.thumbUrl || asset.url} alt="" className="w-full aspect-[3/4] object-cover rounded-xl border border-gray-200" />
          <div className="space-y-3">
            <FieldInput label="归类" value={form.category} onChange={(v) => setForm({ ...form, category: v })} placeholder="上装 / 下装 / 连衣裙 / …" />
            <FieldInput label="廓形" value={form.silhouette} onChange={(v) => setForm({ ...form, silhouette: v })} placeholder="A字 / H字 / 修身 / …" />
            <FieldInput label="配色" value={form.colors} onChange={(v) => setForm({ ...form, colors: v })} placeholder="#hex, #hex" sublabel=", 分隔" />
          </div>
        </div>
        <div className="space-y-3">
          <FieldTextarea label="设计亮点" value={form.designHighlights} onChange={(v) => setForm({ ...form, designHighlights: v })} sublabel="每行一条" />
          <FieldTextarea label="风格特色" value={form.styleFeatures} onChange={(v) => setForm({ ...form, styleFeatures: v })} sublabel="每行一条" />
          <FieldTextarea label="品牌叙述" value={form.brandAnalysis} onChange={(v) => setForm({ ...form, brandAnalysis: v })} sublabel="100 字以内" rows={3} />
        </div>
        <footer className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-gray-200 text-sm hover:border-gray-800">取消</button>
          <button onClick={save} disabled={saving} className="px-5 py-2 rounded-xl bg-primary-500 text-white text-sm hover:bg-primary-500 disabled:opacity-40">{saving ? "保存中…" : "保存"}</button>
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
        We auto-compress on the browser, then send each image to LongCat for a structured analysis (category · silhouette · palette · brand prompt).
      </p>
    </div>
  );
}

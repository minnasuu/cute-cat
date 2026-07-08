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
  useCount: number;
  createdAt: string;
}

type Filter = { category?: string; silhouette?: string; sort: "recent" | "uses" };

export default function InspirationsPage() {
  const { teamId } = useCurrentTeam();
  const [items, setItems] = useState<InspirationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>({ sort: "recent" });
  const [catalog, setCatalog] = useState<{ categories: string[]; silhouettes: string[] }>({ categories: [], silhouettes: [] });
  const [uploads, setUploads] = useState<{ id: string; file: string; status: "compressing" | "uploading" | "error" }[]>([]);

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
      }).catch(() => {});
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

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <input value={q} onChange={(e) => setQ(e.currentTarget.value)} placeholder="Search by category, silhouette, …"
          className="w-60 bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
        <div className="inline-flex rounded-xl border border-gray-200 overflow-hidden text-xs">
          {(["recent", "uses"] as const).map((k) => (
            <button key={k} onClick={() => setFilter((f) => ({ ...f, sort: k }))}
              className={`px-3 py-2 transition-colors ${filter.sort === k ? "bg-blue-600 text-white" : "bg-white hover:bg-gray-100 text-gray-700"}`}>
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
            {items.map((it) => <AssetCard key={it.id} asset={it} />)}
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

function AssetCard({ asset }: { asset: InspirationItem }) {
  const hasAnalysis = asset.category || asset.brandAnalysis || (asset.styleFeatures?.length ?? 0) > 0;
  return (
    <figure className="rounded-2xl border border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow overflow-hidden cursor-pointer group">
      <div className="relative aspect-[3/4] bg-gray-100 overflow-hidden">
        <img src={asset.thumbUrl || asset.url} alt={asset.brandAnalysis ?? asset.category ?? "inspiration"} loading="lazy"
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.05]" />
        {/* 基础信息(始终可见) */}
        <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/80 via-black/30 to-transparent text-white">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] uppercase tracking-wider opacity-90">{asset.category || "analysing…"}</span>
            {asset.useCount > 0 && <span className="text-[11px] bg-white/15 backdrop-blur px-1.5 py-0.5 rounded-full">{asset.useCount} uses</span>}
          </div>
          {asset.colors?.length > 0 && (
            <div className="flex gap-1 mt-1.5">{asset.colors.map((c) => <span key={c} className="w-3 h-3 rounded-full border border-white/40" style={{ background: c }} />)}</div>
          )}
          <figcaption className="text-[10px] opacity-75 mt-1 font-mono">{new Date(asset.createdAt).toLocaleDateString()}</figcaption>
        </div>
        {/* Hover 展开:AI 分析详情 */}
        {hasAnalysis && (
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-3 text-white flex flex-col gap-2 overflow-y-auto">
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

function Pills({ options, value, onPick }: { options: string[]; value?: string; onPick: (v: string) => void }) {
  if (options.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={o} onClick={() => onPick(o)}
          className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${value === o ? "bg-blue-600 border-blue-600 text-white" : "border-gray-200 text-gray-600 hover:border-blue-500"}`}>
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
      <button onClick={() => ref.current?.click()} className="rounded-xl bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 text-sm font-medium shadow-sm">+ Upload</button>
      <input ref={ref} type="file" accept="image/*" multiple className="hidden"
        onChange={(e) => { if (e.target.files?.length) onFiles(e.target.files); e.target.value = ""; }} />
    </>
  );
}

function EmptyDrop({ onDrop, onFiles }: { onDrop: (e: React.DragEvent) => void; onFiles: (files: FileList) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div onDragOver={(e) => e.preventDefault()} onDrop={onDrop}
      className="border-2 border-dashed border-gray-300 rounded-2xl py-20 text-center hover:border-blue-400 transition-colors">
      <div className="text-gray-500 text-sm">Drag & drop inspiration images here, or</div>
      <button onClick={() => ref.current?.click()} className="mt-3 inline-flex rounded-xl bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 text-sm font-medium">Choose files</button>
      <input ref={ref} type="file" accept="image/*" multiple className="hidden"
        onChange={(e) => { if (e.target.files) onFiles(e.target.files); e.target.value = ""; }} />
      <p className="text-[11px] text-gray-500 mt-4 max-w-md mx-auto leading-relaxed">
        We auto-compress on the browser, then send each image to LongCat for a structured analysis (category · silhouette · palette · brand prompt).
      </p>
    </div>
  );
}

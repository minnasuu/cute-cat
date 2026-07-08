// @ts-nocheck
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useVisualAssetStore } from "../store/visual-asset";
import { apiClient, teamApi } from "../lib/api";
import { useCurrentTeam } from "../../../contexts/CurrentTeamContext";
import {
  VISUAL_KIND_META, type VisualAsset, type VisualAssetKind,
} from "../types/visual-asset";
import { BrandLogo } from "../components/ui";

type Tab = "brand" | "visual";

export default function AssetsPage() {
  const { teamId } = useCurrentTeam();
  const [tab, setTab] = useState<Tab>("brand");
  return (
    <div className="max-w-6xl mx-auto px-6 lg:px-10 py-10">
      <header className="mb-8 flex items-center justify-between">
        <BrandWordmark />
      </header>
      <div className="inline-flex rounded-2xl border border-gray-200 overflow-hidden text-sm mb-6">
        <TabBtn current={tab === "brand"} onClick={() => setTab("brand")} label="品牌信息资产" />
        <TabBtn current={tab === "visual"} onClick={() => setTab("visual")} label="视觉资产" />
      </div>
      {tab === "brand" ? <BrandInfoAssets /> : <VisualAssets />}
    </div>
  );
}

function TabBtn({ current, onClick, label }: { current: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick}
      className={`px-5 py-2.5 transition-colors ${current ? "bg-blue-600 text-white" : "bg-white text-gray-700 hover:bg-blue-50"}`}>
      {label}
    </button>
  );
}

/* ── 品牌信息资产 ─────────────────────────────────────────────── */

function BrandInfoAssets() {
  const [profile, setProfile] = useState<any>(null);
  const [colors, setColors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teamId) return;
    teamApi(teamId).getBrand().then((r) => {
      setProfile(r.profile);
      setColors(r.colors || []);
    }).catch(() => {
      setProfile(null);
      setColors([]);
    }).finally(() => setLoading(false));
  }, []);

  const profileFields = profile ?? {
    nameZh: "来兮·安兮", nameEn: "Laisse Ancie", cnFont: "站酷xiaowei体", enFont: "Poller One",
    sloganZh: "既来之，则安之", sloganEn: "Just Open Yourself, Enjoy Life & Love.",
    greetingEn: "Good morning, It's another beautiful day!", voice: ["优雅", "松弛", "乐趣"],
    audienceAgeMin: 18, audienceAgeMax: 30, priceMin: 20, priceMax: 500,
    systemSnippet: "You are Laisse Ancie (来兮·安兮, typeset Poller One on the English side, 站酷xiaowei on the Chinese side), a young-contemporary fashion brand whose north-slogan is \"既来之，则安之\" — \"Come, be at ease.\"",
  };

  const grouped: { group: string; rows: { label: string; value: ReactNode }[] }[] = [
    { group: "基本信息", rows: [
      { label: "中文名", value: <span className="text-2xl font-medium">{profileFields.nameZh}</span> },
      { label: "英文名", value: <span className="italic text-2xl text-blue-600">{profileFields.nameEn}</span> },
      { label: "中文字体", value: profileFields.cnFont },
      { label: "英文字体", value: profileFields.enFont },
    ]},
    { group: "标识系统", rows: [
      { label: "图形标识", value: <div className="w-24 h-24 rounded-xl border border-gray-200 bg-white p-2 flex items-center justify-center overflow-hidden"><BrandLogo /></div> },
      { label: "中文理念", value: <span className="text-xl font-medium">{profileFields.sloganZh}</span> },
      { label: "English concept", value: <span className="text-lg">{profileFields.sloganEn}</span> },
      { label: "Morning greeting", value: <span className="text-blue-700">{profileFields.greetingEn}</span> },
    ]},
    { group: "调性 · 定位", rows: [
      { label: "品牌调性", value: <div className="flex gap-2">{(profileFields.voice ?? ["优雅", "松弛", "乐趣"]).map((v: string) => <span key={v} className="text-[30px] text-blue-600">{v}</span>)}</div> },
      { label: "目标客群", value: `${profileFields.audienceAgeMin}-${profileFields.audienceAgeMax} 岁 · 独立自我的年轻女性` },
      { label: "价格带", value: `¥${profileFields.priceMin} — ¥${profileFields.priceMax} · 根据产品成本调控` },
    ]},
    { group: "品牌色", rows: [
      { label: "色彩对照表", value:
        <table className="w-full text-[12px] border-collapse mt-1">
          <thead><tr className="text-left text-gray-500"><Th>用途</Th><Th>背景</Th><Th>字色</Th><Th>预览</Th></tr></thead>
          <tbody>
            {colors.map((p: any) => (
              <tr key={p.bg + p.fg} className="border-t border-gray-200">
                <Td className="text-gray-600">{p.usage}</Td>
                <Td className="font-mono">{p.bg}</Td>
                <Td className="font-mono">{p.fg}</Td>
                <Td><span className="inline-flex rounded-lg overflow-hidden border border-gray-200">
                  <span className="px-3 py-1.5" style={{ background: p.bg, color: p.fg }}>Laisse</span>
                  <span className="px-3 py-1.5" style={{ background: p.fg, color: p.bg }}>Ancie</span>
                </span></Td>
              </tr>
            ))}
          </tbody>
        </table>
      },
    ]},
    { group: "下游配置", rows: [
      { label: "AI 系统提示片段", value: <pre className="text-[11px] leading-relaxed text-gray-600 whitespace-pre-wrap font-sans bg-gray-50 border border-gray-200 rounded-xl p-4 max-h-72 overflow-auto">{profileFields.systemSnippet}</pre> },
    ]},
  ];

  if (loading) return <div className="text-gray-500">加载中…</div>;

  return (
    <div className="space-y-6">
      {grouped.map((g) => (
        <section key={g.group}>
          <h3 className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">{g.group}</h3>
          <div className="rounded-2xl border border-gray-200 bg-gray-50 overflow-hidden">
            <table className="w-full text-[13px]">
              <tbody>
                {g.rows.map((r, i) => (
                  <tr key={r.label} className={i > 0 ? "border-t border-gray-200" : ""}>
                    <th className="text-left align-top text-gray-500 font-medium px-5 py-3 w-[18%] whitespace-nowrap">{r.label}</th>
                    <td className="text-gray-800 px-5 py-3">{r.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}

function Th({ children }: { children: ReactNode }) { return <th className="text-left text-[10px] uppercase tracking-wider font-medium px-5 py-2.5">{children}</th>; }
function Td({ children, className = "" }: { children: ReactNode; className?: string }) { return <td className={`px-5 py-3 align-top ${className}`}>{children}</td>; }

/* ── 视觉资产 ──────────────────────────────────────────────── */

function VisualAssets() {
  const store = useVisualAssetStore();
  const [filter, setFilter] = useState<VisualAssetKind | "all">("all");
  const [open, setOpen] = useState<VisualAsset | null>(null);
  const [picker, setPicker] = useState(false);

  const grouped = useMemo(() => {
    let list = store.assets;
    if (filter !== "all") list = list.filter((a) => a.kind === filter);
    return list;
  }, [filter, store.assets]);

  const counts = useMemo(() => {
    const out = new Map<VisualAssetKind, number>();
    for (const a of store.assets) out.set(a.kind, (out.get(a.kind) ?? 0) + 1);
    return out;
  }, [store.assets]);

  return (
    <div id="visual-assets" className="pt-8 mt-8 border-t border-gray-200">
      <header className="flex items-end justify-between mb-5">
        <div>
          <h2 className="text-3xl font-semibold text-blue-600 tracking-tight">Visual Assets</h2>
          <p className="text-sm text-gray-500 mt-1">印花 · 插画 · 主视觉 · 模板 · Lookbook · 包装</p>
        </div>
        <button onClick={() => setPicker(true)} className="rounded-xl bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 text-sm font-medium shadow-sm">+ 新增</button>
      </header>
      <div className="flex flex-wrap gap-1.5 mb-6">
        <FilterPill current={filter === "all"} onClick={() => setFilter("all")} icon="✦" label="全部" count={store.assets.length} />
        {(Object.keys(VISUAL_KIND_META) as VisualAssetKind[]).map((k) => (
          <FilterPill key={k} current={filter === k} onClick={() => setFilter(k)} icon={VISUAL_KIND_META[k].icon} label={VISUAL_KIND_META[k].labelZh} count={counts.get(k) ?? 0} />
        ))}
      </div>

      {grouped.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-gray-300 py-16 text-center text-gray-500 text-sm">
          {store.assets.length === 0 ? "还未上传视觉资产 — 用右上角 + 上传印花 / 插画 / KV …" : "该分类暂无条目。"}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {grouped.map((a) => <AssetCard key={a.id} asset={a} onClick={() => setOpen(a)} onDelete={() => store.remove(a.id)} />)}
        </div>
      )}

      {open && <AssetViewer asset={open} onClose={() => setOpen(null)} onSave={(a) => store.upsert(a)} />}
      {picker && <AssetPicker onClose={() => setPicker(false)} onSave={(a) => store.upsert(a)} />}
    </div>
  );
}

function FilterPill({ current, onClick, icon, label, count }: { current: boolean; onClick: () => void; icon: string; label: string; count?: number }) {
  return (
    <button onClick={onClick}
      className={`text-[11px] px-3 py-1.5 rounded-full border transition-colors flex items-center gap-1.5 ${current ? "bg-blue-600 border-blue-600 text-white" : "border-gray-200 text-gray-600 hover:border-blue-500 hover:text-blue-600"}`}>
      <span>{icon}</span><span>{label}</span>{count != null ? <span className="opacity-60">({count})</span> : null}
    </button>
  );
}

function AssetCard({ asset, onClick, onDelete }: { asset: VisualAsset; onClick: () => void; onDelete: () => void }) {
  return (
    <figure className="rounded-2xl overflow-hidden border border-gray-200 bg-gray-50 shadow-sm hover:shadow-md transition-shadow cursor-pointer relative">
      <button onClick={onClick} className="text-left w-full">
        {asset.pinned && <span className="absolute top-2 right-2 text-[10px] bg-blue-600 text-white px-2 py-0.5 rounded-full z-10">PIN</span>}
        <div className="aspect-[4/3] bg-gray-100 overflow-hidden">
          <img src={asset.thumb || asset.src} alt={asset.title} className="w-full h-full object-cover" />
        </div>
        <figcaption className="px-4 py-3">
          <div className="flex items-baseline gap-2">
            <span className="text-[10px] uppercase tracking-wider text-gray-500 px-1.5 py-0.5 bg-gray-100 rounded">{VISUAL_KIND_META[asset.kind]?.labelZh}</span>
            <span className="text-[15px] font-medium text-gray-900 leading-tight">{asset.title}</span>
          </div>
          {asset.description && <div className="text-[11px] text-gray-500 mt-1 line-clamp-2">{asset.description}</div>}
        </figcaption>
      </button>
      <button onClick={(e) => { e.stopPropagation(); if (confirm("刪除視覺資產？")) onDelete(); }}
        className="absolute bottom-2 right-2 text-[10px] text-gray-500 hover:text-blue-600 underline" title="删除">×</button>
    </figure>
  );
}

function AssetViewer({ asset, onClose, onSave }: { asset: VisualAsset; onClose: () => void; onSave: (a: VisualAsset) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(asset);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function save() { onSave({ ...draft }); onClose(); }

  return (
    <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-center justify-center" onClick={onClose}>
      <div className="w-full max-w-4xl max-h-[88vh] overflow-y-auto rounded-3xl border border-gray-200 bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-start justify-between gap-4 mb-4">
          <div>
            <span className="text-[10px] uppercase tracking-wider text-blue-600">{VISUAL_KIND_META[asset.kind]?.labelZh}</span>
            <h2 className="text-[26px] font-medium text-gray-900">{asset.title}</h2>
          </div>
          <button onClick={onClose} className="text-2xl text-gray-400 hover:text-gray-800">×</button>
        </header>
        <div className="rounded-2xl overflow-hidden border border-gray-200 bg-gray-50 mb-5">
          <img src={asset.src} alt={asset.title} className="w-full max-h-[60vh] object-contain" />
        </div>
        {editing ? (
          <div className="space-y-3">
            <label className="block">
              <div className="text-[10px] uppercase tracking-wider text-gray-500">标题</div>
              <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                className="w-full mt-0.5 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500" />
            </label>
            <label className="block">
              <div className="text-[10px] uppercase tracking-wider text-gray-500">分类</div>
              <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as VisualAssetKind })}
                className="w-full mt-0.5 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500">
                {(Object.keys(VISUAL_KIND_META) as VisualAssetKind[]).map((k) => <option key={k} value={k}>{VISUAL_KIND_META[k].labelZh}</option>)}
              </select>
            </label>
            <label className="block">
              <div className="text-[10px] uppercase tracking-wider text-gray-500">描述</div>
              <textarea value={draft.description ?? ""} rows={3} onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                className="w-full mt-0.5 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500" />
            </label>
            <label className="block">
              <div className="text-[10px] uppercase tracking-wider text-gray-500">标签 (, 分隔)</div>
              <input value={(draft.tags ?? []).join(", ")} onChange={(e) => setDraft({ ...draft, tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })}
                className="w-full mt-0.5 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500" />
            </label>
            <label className="block">
              <div className="text-[10px] uppercase tracking-wider text-gray-500">季节</div>
              <input value={(draft.seasons ?? []).join(", ")} onChange={(e) => setDraft({ ...draft, seasons: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })}
                className="w-full mt-0.5 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500" />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!draft.pinned} onChange={(e) => setDraft({ ...draft, pinned: e.target.checked })} />
              置顶（品牌首页主视觉优先）
            </label>
          </div>
        ) : (
          <div>
            {asset.description && <p className="text-[13px] text-gray-600 mb-4">{asset.description}</p>}
            <div className="text-[11px] text-gray-500 mb-2">{asset.seasons?.length ? `季节 · ${asset.seasons.join(", ")}` : "季节 · —"}</div>
            <div className="flex flex-wrap gap-1.5">
              {asset.tags.map((t) => <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-600">#{t}</span>)}
            </div>
          </div>
        )}
        <footer className="mt-5 flex items-center justify-between">
          <button onClick={() => setEditing((v) => !v)} className="text-blue-600 text-sm underline">{editing ? "取消编辑" : "编辑"}</button>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-xl border border-gray-200 text-sm hover:border-gray-800">关闭</button>
            {editing && <button onClick={save} className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm hover:bg-blue-500">保存</button>}
          </div>
        </footer>
      </div>
    </div>
  );
}

function AssetPicker({ onClose, onSave }: { onClose: () => void; onSave: (a: VisualAsset) => void }) {
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Partial<VisualAsset>>({ kind: "illustration", title: "", description: "", tags: [], seasons: [] });
  const [src, setSrc] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(f: File) {
    if (!f.type.startsWith("image/")) { alert("只支持图片"); return; }
    if (f.size > 8 * 1024 * 1024) { alert("单张不超过 8 MB"); return; }
    setBusy(true);
    try {
      // multipart POST to /api/teams/:teamId/inspirations?kind=visual-asset or keep as data URL for now
      // Simple path: store data URI in src for now (v1)
      const reader = new FileReader();
      reader.onload = () => setSrc(reader.result as string);
      reader.readAsDataURL(f);
    } finally { setBusy(false); }
  }

  function save() {
    if (!src || !draft.title) return;
    const now = new Date().toISOString();
    onSave({
      id: crypto.randomUUID(), kind: draft.kind as VisualAssetKind,
      title: draft.title!, description: (draft.description as string) || undefined,
      src, thumb: src, tags: draft.tags ?? [], seasons: (draft.seasons as string[]) ?? [], createdAt: now,
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-center justify-center" onClick={onClose}>
      <div className="w-full max-w-xl rounded-3xl border border-gray-200 bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-start justify-between mb-4">
          <h2 className="text-2xl font-medium text-gray-800">新增视觉资产</h2>
          <button onClick={onClose} className="text-2xl text-gray-400 hover:text-gray-800">×</button>
        </header>
        <div onClick={() => fileRef.current?.click()} onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
          className="border-2 border-dashed border-gray-300 hover:border-blue-500 rounded-2xl py-8 px-6 text-center text-sm cursor-pointer transition-colors mb-4">
          {src ? (
            <div className="inline-block">
              <img src={src} alt="preview" className="max-h-40 mx-auto rounded-lg mb-2" />
              <div className="text-gray-500 text-[11px]">{busy ? "…" : "点击选择新图片"}</div>
            </div>
          ) : (
            <div>
              <div className="text-2xl text-gray-400 mb-1">↑</div>
              <div className="text-gray-600">拖拽或点击选择图片 (≤ 8 MB)</div>
              <div className="text-gray-400 text-[11px] mt-1">支持 PNG / JPG / WEBP</div>
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        </div>
        <div className="space-y-3">
          <label className="block">
            <div className="text-[10px] uppercase tracking-wider text-gray-500">分类</div>
            <select value={draft.kind as string} onChange={(e) => setDraft({ ...draft, kind: e.target.value as VisualAssetKind })}
              className="w-full mt-0.5 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500">
              {(Object.keys(VISUAL_KIND_META) as VisualAssetKind[]).map((k) => <option key={k} value={k}>{VISUAL_KIND_META[k].labelZh}</option>)}
            </select>
          </label>
          <label className="block">
            <div className="text-[10px] uppercase tracking-wider text-gray-500">标题 (必填)</div>
            <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              className="w-full mt-0.5 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500" />
          </label>
          <label className="block">
            <div className="text-[10px] uppercase tracking-wider text-gray-500">描述</div>
            <textarea value={draft.description ?? ""} rows={2} onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              className="w-full mt-0.5 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500" />
          </label>
          <label className="block">
            <div className="text-[10px] uppercase tracking-wider text-gray-500">标签 (, 分隔)</div>
            <input value={(draft.tags ?? []).join(", ")} onChange={(e) => setDraft({ ...draft, tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })}
              className="w-full mt-0.5 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500" />
          </label>
          <label className="block">
            <div className="text-[10px] uppercase tracking-wider text-gray-500">季节</div>
            <input value={(draft.seasons ?? []).join(", ")} onChange={(e) => setDraft({ ...draft, seasons: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })}
              className="w-full mt-0.5 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500" />
          </label>
        </div>
        <footer className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-gray-200 text-sm hover:border-gray-800">取消</button>
          <button onClick={save} disabled={!src || !draft.title} className="px-5 py-2 rounded-xl bg-blue-600 text-white text-sm hover:bg-blue-500 disabled:opacity-40">保存</button>
        </footer>
      </div>
    </div>
  );
}

function BrandWordmark() {
  return (
    <div className="flex items-baseline gap-3">
      <span className="text-[48px] font-semibold text-blue-600 leading-none">Laisse Ancie</span>
    </div>
  );
}

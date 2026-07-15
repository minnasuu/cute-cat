// @ts-nocheck
import { useCallback, useEffect, useMemo, useState } from "react";
import { teamApi } from "../lib/api";
import { compressForUpload } from "../lib/images";
import { useCurrentTeam } from "../../../contexts/CurrentTeamContext";
import { useResourceStore } from "../store/resource";
import { Modal } from "../components/ui";
import type { StyleRow } from "../types/design";

const STYLE_CATEGORIES = [
  { key: "上装", label: "上装" },
  { key: "下装", label: "下装" },
  { key: "连衣裙", label: "连衣裙" },
  { key: "外套", label: "外套" },
  { key: "连体", label: "连体" },
  { key: "配饰", label: "配饰" },
  { key: "包袋", label: "包袋" },
  { key: "鞋履", label: "鞋履" },
  { key: "其他", label: "其他" },
];

export default function StylesPage() {
  const { teamId } = useCurrentTeam();
  const { refreshStyles } = useResourceStore();
  const [cat, setCat] = useState("上装");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<StyleRow[]>([]);
  const [loading, setLoading] = useState(true);

  // editor: null = 关闭; { mode: 'view'|'edit'|'create', mat? }
  const [editor, setEditor] = useState<null | { mode: "view" | "edit" | "create"; mat?: StyleRow }>(null);

  const refresh = useCallback(async (tid: string) => {
    setLoading(true);
    try {
      const r = await teamApi(tid).listStyles();
      setRows(Array.isArray(r) ? r : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (teamId) void refresh(teamId); }, [refresh, teamId]);

  const visible = useMemo(() => {
    const base = rows.filter((m) => m.category === cat);
    if (!q.trim()) return base;
    const needle = q.trim().toLowerCase();
    return base.filter((m) =>
      m.name.toLowerCase().includes(needle) ||
      (m.tags || []).some((t) => t.toLowerCase().includes(needle)));
  }, [cat, q, rows]);

  // 保存：create / edit 共用。values 含可选 imageFile（新图优先于 image 字符串）
  const handleSave = useCallback(async (values: Partial<StyleRow> & { imageFile?: File | null }) => {
    if (!teamId) return;
    const api = teamApi(teamId);
    const { imageFile, ...data } = values;
    const payload: any = { ...data };
    for (const k of Object.keys(payload)) {
      if (payload[k] === "") payload[k] = null;
    }
    let id = payload.id as string | undefined;
    if (id) {
      await api.updateStyle(id, payload);
    } else {
      const created = await api.createStyle(payload);
      id = created.id;
    }
    // 上传新图（需要先有 id）
    if (id && imageFile) {
      const compressed = await compressForUpload(imageFile);
      const fd = new FormData();
      fd.append("file", compressed);
      const { url } = await api.uploadStyleImage(id, fd);
      if (url) await api.updateStyle(id, { image: url });
    }
    // 成功后关闭弹窗并刷新（刷新不阻塞、不抛错）
    setEditor(null);
    await Promise.allSettled([refresh(teamId), refreshStyles()]);
  }, [teamId, refresh, refreshStyles]);

  const handleDelete = useCallback(async (mat: StyleRow) => {
    if (!teamId) return;
    if (!window.confirm(`确认删除款式「${mat.name}」？`)) return;
    await teamApi(teamId).deleteStyle(mat.id);
    await refresh(teamId);
    await refreshStyles();
  }, [teamId, refresh, refreshStyles]);

  if (loading) return <div className="p-10 text-gray-500">加载中…</div>;

  return (
    <div className="grid grid-cols-[220px_1fr] h-[calc(100vh-64px)] min-h-0">
      <aside className="border-r border-gray-200 bg-gray-50 px-4 py-5 flex flex-col overflow-auto">
        <div className="px-2 mb-2 text-[10px] uppercase tracking-wider text-gray-500">款式分类</div>
        <div className="flex flex-col gap-1 flex-1">
          {STYLE_CATEGORIES.map((c) => {
            const count = rows.filter((m) => m.category === c.key).length;
            const active = cat === c.key;
            return (
              <button key={c.key} onClick={() => setCat(c.key)}
                className={`text-left flex items-baseline justify-between rounded-xl px-3 py-2.5 transition-colors ${active ? "bg-primary-50 text-gray-800 border border-primary-200" : "text-gray-600 hover:bg-gray-100"}`}>
                <span className="text-[13px] font-medium">{c.label}</span>
                <span className="text-[10px] opacity-60">{count}</span>
              </button>
            );
          })}
        </div>
      </aside>

      <main className="overflow-auto bg-white">
        <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-[32px] font-semibold text-text-primary tracking-tight">款式</h1>
            <p className="text-sm text-text-tertiary mt-1">{cat} · 共 {visible.length} 款</p>
          </div>
          <div className="flex items-center gap-3">
            <input value={q} onChange={(e) => setQ(e.currentTarget.value)} placeholder="按名称、标签搜索…"
              className="w-72 bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" />
            <button onClick={() => setEditor({ mode: "create" })}
              className="shrink-0 text-[12px] bg-primary-500 hover:bg-primary-600 text-white px-3 py-2 rounded-xl font-medium transition-colors">
              + 新增款式
            </button>
          </div>
        </header>

        {visible.length === 0 ? (
          <div className="py-16 text-center text-gray-500 text-sm">没有符合搜索的款式</div>
        ) : (
          <div className="p-6 grid grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
            {visible.map((m) => (
              <button key={m.id} onClick={() => setEditor({ mode: "view", mat: m })} className="text-left">
                <StyleCard mat={m} />
              </button>
            ))}
          </div>
        )}
      </main>

      <StyleModal
        editor={editor}
        onClose={() => setEditor(null)}
        onSwitchEdit={() => setEditor((e) => e ? { ...e, mode: "edit" } : e)}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </div>
  );
}

function StyleCard({ mat }: { mat: StyleRow }) {
  return (
    <figure className="rounded-2xl border border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow overflow-hidden cursor-pointer">
      <div className="relative aspect-square overflow-hidden bg-gray-50">
        {mat.image ? (
          <img src={mat.image} alt={mat.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="rounded-xl border-2 border-dashed border-gray-200 w-20 h-20" />
          </div>
        )}
      </div>
      <figcaption className="px-3 py-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13px] text-gray-800 font-medium truncate">{mat.name}</div>
          {mat.tags && mat.tags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {mat.tags.slice(0, 3).map((t) => (
                <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">{t}</span>
              ))}
            </div>
          )}
        </div>
        <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-primary-50 text-primary-600 font-medium">{mat.category}</span>
      </figcaption>
    </figure>
  );
}

/** 三态弹窗：view(只读详情) / edit(编辑) / create(新增) */
function StyleModal({ editor, onClose, onSwitchEdit, onSave, onDelete }: {
  editor: null | { mode: "view" | "edit" | "create"; mat?: StyleRow };
  onClose: () => void;
  onSwitchEdit: () => void;
  onSave: (values: Partial<StyleRow> & { imageFile?: File | null }) => Promise<void>;
  onDelete: (mat: StyleRow) => Promise<void>;
}) {
  if (!editor) return null;
  const { mode, mat } = editor;
  const isEditing = mode === "edit" || mode === "create";
  const title = mode === "create" ? "新增款式" : (mode === "edit" ? "编辑款式" : (mat?.name ?? "款式"));

  return (
    <Modal open onClose={onClose} title={title} maxWidth="max-w-5xl">
      {!isEditing ? (
        <StyleView mat={mat!} onEdit={onSwitchEdit} onDelete={onDelete} />
      ) : (
        <StyleForm key={mat?.id ?? "new"} initial={mat ?? null} onCancel={onClose} onSave={onSave} />
      )}
    </Modal>
  );
}

/** 只读详情 */
function StyleView({ mat, onEdit, onDelete }: { mat: StyleRow; onEdit: () => void; onDelete: (mat: StyleRow) => Promise<void> }) {
  const [deleting, setDeleting] = useState(false);
  const onDel = async () => {
    setDeleting(true);
    try { await onDelete(mat); } finally { setDeleting(false); }
  };
  return (
    <div className="grid grid-cols-[260px_1fr] gap-7 flex-1 min-h-0 h-[60vh]">
      <aside className="rounded-2xl border border-gray-200 overflow-hidden bg-gray-50 overflow-y-auto max-h-full">
        {mat.image ? (
          <div className="aspect-square overflow-hidden border-b border-gray-200">
            <img src={mat.image} alt={mat.name} className="w-full h-full object-cover" />
          </div>
        ) : (
          <div className="aspect-square flex items-center justify-center bg-gray-50">
            <div className="rounded-xl border-2 border-dashed border-gray-200 w-24 h-24" />
          </div>
        )}
      </aside>

      <article className="overflow-auto max-h-full text-xs space-y-5 pr-1">
        <div className="flex items-center justify-between">
          <span className="text-[11px] px-2.5 py-1 rounded-full bg-primary-50 text-primary-600 font-medium">{mat.category}</span>
          <div className="flex items-center gap-2">
            <button onClick={onEdit} className="shrink-0 text-[12px] bg-primary-500 hover:bg-primary-600 text-white px-3 py-1.5 rounded-lg font-medium transition-colors">
              编辑
            </button>
            <button onClick={onDel} disabled={deleting}
              className="shrink-0 text-[12px] bg-red-500 hover:bg-red-600 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg font-medium transition-colors">
              {deleting ? "删除中…" : "删除"}
            </button>
          </div>
        </div>
        {Section("名称", mat.name)}
        {mat.tags && mat.tags.length > 0 && (
          <Section label="标签">
            <div className="flex flex-wrap gap-1.5">
              {mat.tags.map((t) => <span key={t} className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">{t}</span>)}
            </div>
          </Section>
        )}
      </article>
    </div>
  );
}

/** 编辑 / 新增 表单 */
function StyleForm({ initial, onCancel, onSave }: {
  initial: StyleRow | null;
  onCancel: () => void;
  onSave: (values: Partial<StyleRow> & { imageFile?: File | null }) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState(initial?.category ?? "上装");
  const [tags, setTags] = useState<string>((initial?.tags ?? []).join(", "));
  const [imageUrl, setImageUrl] = useState(initial?.image ?? "");
  const [imageFile, setImageFile] = useState<File | null>(null);

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const payload: any = {
        ...(initial?.id ? { id: initial.id } : {}),
        name: name.trim(),
        category,
        tags: tags.split(",").map((s) => s.trim()).filter(Boolean),
      };
      // imageFile 优先；没换图则把现有 url 传回去保持同步
      await onSave({ ...payload, image: imageUrl || null, imageFile });
    } catch (err: any) {
      console.error("[style] save failed", err);
      setError(err?.message || "保存失败，请重试");
      setSaving(false);
    }
  };

  const inputCls = "w-full text-[12px] border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-primary-500";
  const labelCls = "text-[10px] uppercase tracking-wider text-gray-500 mb-1";

  return (
    <div className="flex-1 min-h-0 h-[60vh] overflow-auto pr-1 text-xs space-y-5">
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-[12px] text-red-600">⚠ {error}</div>}

      {/* 图片上传 */}
      <div>
        <div className={labelCls}>款式参考图</div>
        <div className="flex items-center gap-3">
          <div className="w-28 h-28 rounded-xl border border-gray-200 bg-gray-50 overflow-hidden shrink-0">
            {imageUrl ? (
              <img src={imageUrl} alt="款式" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-[10px] text-gray-400 gap-1">
                <div className="rounded-lg border-2 border-dashed border-gray-200 w-10 h-10" />
                <span>暂无图片</span>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] text-primary-600 hover:underline cursor-pointer">
              上传图片
              <input type="file" accept="image/*" className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  setImageFile(f);
                  if (f) setImageUrl(URL.createObjectURL(f));
                }} />
            </label>
            {imageUrl && (
              <button onClick={() => { setImageUrl(""); setImageFile(null); }} className="text-[11px] text-gray-500 hover:underline">移除图片</button>
            )}
            <span className="text-[10px] text-gray-400">建议上传款式效果图或实物图</span>
          </div>
        </div>
      </div>

      {/* 基础信息 */}
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><div className={labelCls}>名称 *</div><input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} /></div>
        <div className="col-span-2">
          <div className={labelCls}>类别</div>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
            {STYLE_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <div className={labelCls}>标签（逗号分隔）</div>
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="圆领, 通勤, 短袖" className={inputCls} />
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 sticky bottom-0 bg-white">
        <button onClick={onCancel} className="text-[12px] text-gray-600 hover:underline px-3 py-1.5">取消</button>
        <button onClick={submit} disabled={saving || !name.trim()}
          className="text-[12px] bg-primary-500 hover:bg-primary-600 disabled:opacity-40 text-white px-4 py-1.5 rounded-lg font-medium transition-colors">
          {saving ? "保存中…" : "保存"}
        </button>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children?: React.ReactNode }) {
  if (!children && children !== 0) return null;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">{label}</div>
      <div className="text-[12px] text-gray-700 leading-relaxed">{children}</div>
    </div>
  );
}

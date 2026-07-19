/**
 * Illustrations(插画库)——用户上传插画图片,可印/刺绣到衣服上。
 * 仿 Styles.tsx 结构,但:1) 无分类侧栏(纯画廊网格 + 搜索); 2) 无「设为共享」开关。
 *
 * 保存流程:create → (可选)uploadIllustrationImage → updateIllustration(image) → refresh。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { teamApi } from "../lib/api";
import { compressForUpload } from "../lib/images";
import { useCurrentTeam } from "../../../contexts/CurrentTeamContext";
import { useResourceStore } from "../store/resource";
import { Modal } from "../components/ui";
import { ResourceCard } from "../components/ResourceCard";
import type { IllustrationRow } from "../types/design";

export default function IllustrationsPage() {
  const { teamId } = useCurrentTeam();
  const { refreshIllustrations } = useResourceStore();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<IllustrationRow[]>([]);
  const [loading, setLoading] = useState(true);

  // editor: null = 关闭; { mode: 'edit'|'create', mat? }
  const [editor, setEditor] = useState<null | { mode: "edit" | "create"; mat?: IllustrationRow }>(null);

  const refresh = useCallback(async (tid: string) => {
    setLoading(true);
    try {
      const r = await teamApi(tid).listIllustrations();
      setRows(Array.isArray(r) ? r : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (teamId) void refresh(teamId); }, [refresh, teamId]);

  const visible = useMemo(() => {
    if (!q.trim()) return rows;
    const needle = q.trim().toLowerCase();
    return rows.filter((m) =>
      m.name.toLowerCase().includes(needle) ||
      (m.tags || []).some((t) => t.toLowerCase().includes(needle)));
  }, [q, rows]);

  // 保存：create / edit 共用。values 含可选 imageFile（新图优先于 image 字符串）
  const handleSave = useCallback(async (values: Partial<IllustrationRow> & { imageFile?: File | null }) => {
    if (!teamId) return;
    const api = teamApi(teamId);
    const { imageFile, ...data } = values;
    const payload: any = { ...data };
    for (const k of Object.keys(payload)) {
      if (payload[k] === "") payload[k] = null;
    }
    let id = payload.id as string | undefined;
    if (id) {
      await api.updateIllustration(id, payload);
    } else {
      const created = await api.createIllustration(payload);
      id = created.id;
    }
    // 上传新图（需要先有 id）
    if (id && imageFile) {
      const compressed = await compressForUpload(imageFile);
      const fd = new FormData();
      fd.append("file", compressed);
      const { url } = await api.uploadIllustrationImage(id, fd);
      if (url) await api.updateIllustration(id, { image: url });
    }
    setEditor(null);
    await Promise.allSettled([refresh(teamId), refreshIllustrations()]);
  }, [teamId, refresh, refreshIllustrations]);

  const handleDelete = useCallback(async (mat: IllustrationRow) => {
    if (!teamId) return;
    if (!window.confirm(`确认删除插画「${mat.name}」？`)) return;
    await teamApi(teamId).deleteIllustration(mat.id);
    await refresh(teamId);
    await refreshIllustrations();
  }, [teamId, refresh, refreshIllustrations]);

  if (loading) return <div className="p-10 text-gray-500">加载中…</div>;

  return (
    <div className="h-[calc(100vh-64px)] min-h-0 overflow-auto bg-white">
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-[32px] font-semibold text-text-primary tracking-tight">插画</h1>
          <p className="text-sm text-text-tertiary mt-1">共 {visible.length} 张 · 用于服装印花/刺绣</p>
        </div>
        <div className="flex items-center gap-3">
          <input value={q} onChange={(e) => setQ(e.currentTarget.value)} placeholder="按名称、标签搜索…"
            className="w-72 bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" />
          <button onClick={() => setEditor({ mode: "create" })}
            className="shrink-0 text-[12px] bg-primary-500 hover:bg-primary-600 text-white px-3 py-2 rounded-xl font-medium transition-colors">
            + 新增插画
          </button>
        </div>
      </header>

      {visible.length === 0 ? (
        <div className="py-16 text-center text-gray-500 text-sm">
          {rows.length === 0 ? "还没有插画，点击右上角「+ 新增插画」开始上传" : "没有符合搜索的插画"}
        </div>
      ) : (
        <div className="p-6 grid grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-5">
          {visible.map((m) => (
            <ResourceCard
              key={m.id}
              image={m.image}
              name={m.name}
              tags={m.tags}
              onEdit={() => setEditor({ mode: "edit", mat: m })}
              onDelete={() => void handleDelete(m)}
            />
          ))}
        </div>
      )}

      <IllustrationModal
        editor={editor}
        onClose={() => setEditor(null)}
        onSave={handleSave}
      />
    </div>
  );
}

/** 双态弹窗：edit(编辑) / create(新增)。所有操作已上浮到卡片 hover 工具栏,不再需要 view 只读弹窗。 */
function IllustrationModal({ editor, onClose, onSave }: {
  editor: null | { mode: "edit" | "create"; mat?: IllustrationRow };
  onClose: () => void;
  onSave: (values: Partial<IllustrationRow> & { imageFile?: File | null }) => Promise<void>;
}) {
  if (!editor) return null;
  const isEditing = editor.mode === "edit";
  const title = isEditing ? "编辑插画" : "新增插画";
  const mat = editor.mat ?? null;

  return (
    <Modal open onClose={onClose} title={title} maxWidth="max-w-[600px]">
      <IllustrationForm
        key={mat?.id ?? "new"}
        initial={mat}
        onCancel={onClose}
        onSave={async (values) => { await onSave(values); onClose(); }}
      />
    </Modal>
  );
}

/** 编辑 / 新增 表单 */
function IllustrationForm({ initial, onCancel, onSave }: {
  initial: IllustrationRow | null;
  onCancel: () => void;
  onSave: (values: Partial<IllustrationRow> & { imageFile?: File | null }) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(initial?.name ?? "");
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
        tags: tags.split(",").map((s) => s.trim()).filter(Boolean),
      };
      await onSave({ ...payload, image: imageUrl || null, imageFile });
    } catch (err: any) {
      console.error("[illustration] save failed", err);
      setError(err?.message || "保存失败，请重试");
      setSaving(false);
    }
  };

  const inputCls = "w-full text-[12px] border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-primary-500";
  const labelCls = "text-[10px] uppercase tracking-wider text-gray-500 mb-1";

  return (
    <div className="flex flex-col max-h-[68vh]">
      <div className="flex-1 min-h-0 overflow-y-auto pr-1 text-xs space-y-5">
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-[12px] text-red-600">⚠ {error}</div>}

      {/* 图片上传 */}
      <div>
        <div className={labelCls}>插画图片</div>
        <div className="flex items-center gap-3">
          <div className="w-28 h-28 rounded-xl border border-gray-200 bg-gray-50 overflow-hidden shrink-0">
            {imageUrl ? (
              <img src={imageUrl} alt="插画" className="w-full h-full object-cover" />
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
            <span className="text-[10px] text-gray-400">建议上传高清插画/图案,可直接用于服装印花或刺绣</span>
          </div>
        </div>
      </div>

      {/* 基础信息 */}
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><div className={labelCls}>名称 <span className="text-red-500">*</span></div><input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} /></div>
        <div className="col-span-2">
          <div className={labelCls}>标签（逗号分隔）</div>
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="花卉, 复古, 几何" className={inputCls} />
        </div>
      </div>

      </div>
      <div className="shrink-0 flex items-center justify-end gap-2 pt-3 mt-4 border-t border-gray-100 bg-white">
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

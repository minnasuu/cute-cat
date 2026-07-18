/**
 * Models(服装模特)——用户上传自己品牌的模特(1-5 张图 + 形体数据);
 * 管理员可将模特共享进系统模特库,所有用户可用。
 *
 * 保存流程:create/update(images) → 逐张 uploadModelImage(后端追加到 images,上限 5) → refresh。
 * 弹窗分 view(只读详情 + 管理员共享开关)/edit·create 两种态,仿 Materials.tsx。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { teamApi } from "../lib/api";
import { compressForUpload } from "../lib/images";
import { useCurrentTeam } from "../../../contexts/CurrentTeamContext";
import { useResourceStore } from "../store/resource";
import { useAuth } from "../../../contexts/AuthContext";
import { showToast } from "../../../components/Toast";
import { Modal } from "../components/ui";
import { ResourceCard } from "../components/ResourceCard";
import { X, Plus } from "lucide-react";
import type { ModelRow } from "../types/design";

const MAX_IMAGES = 5;

export default function ModelsPage() {
  const { teamId } = useCurrentTeam();
  const { refreshModels } = useResourceStore();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<ModelRow[]>([]);
  const [loading, setLoading] = useState(true);

  // viewer: null = 关闭; { mode: 'view'|'edit'|'create', mat? }
  const [viewer, setViewer] = useState<null | { mode: "view" | "edit" | "create"; mat?: ModelRow }>(null);

  const refresh = useCallback(async (tid: string) => {
    setLoading(true);
    try {
      const r = await teamApi(tid).listModels();
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

  // create / edit 共用:先落数据字段 + 当前 images,再逐张上传新图(后端追加)
  const handleSave = useCallback(async (values: Partial<ModelRow> & { newFiles?: File[] }) => {
    if (!teamId) return;
    const api = teamApi(teamId);
    const { newFiles, ...data } = values;
    const payload: any = { ...data };
    for (const k of Object.keys(payload)) {
      if (payload[k] === "") payload[k] = null;
    }
    let id = payload.id as string | undefined;
    if (id) {
      await api.updateModel(id, payload);
    } else {
      const created = await api.createModel(payload);
      id = created.id;
    }
    // 逐张上传新图(后端追加到 images 数组,上限 5)
    if (id && newFiles && newFiles.length) {
      for (const file of newFiles) {
        const compressed = await compressForUpload(file);
        const fd = new FormData();
        fd.append("file", compressed);
        await api.uploadModelImage(id, fd);
      }
    }
    setViewer(null);
    await Promise.allSettled([refresh(teamId), refreshModels()]);
  }, [teamId, refresh, refreshModels]);

  const handleDelete = useCallback(async (mat: ModelRow) => {
    if (!teamId) return;
    if (!window.confirm(`确认删除模特「${mat.name}」？`)) return;
    await teamApi(teamId).deleteModel(mat.id);
    await refresh(teamId);
    await refreshModels();
  }, [teamId, refresh, refreshModels]);

  if (loading) return <div className="p-10 text-gray-500">加载中…</div>;

  return (
    <div className="h-[calc(100vh-64px)] min-h-0 overflow-auto bg-white">
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-[32px] font-semibold text-text-primary tracking-tight">模特</h1>
          <p className="text-sm text-text-tertiary mt-1">共 {visible.length} 位 · 品牌模特档案,可共享进系统模特库</p>
        </div>
        <div className="flex items-center gap-3">
          <input value={q} onChange={(e) => setQ(e.currentTarget.value)} placeholder="按名称、标签搜索…"
            className="w-72 bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" />
          <button onClick={() => setViewer({ mode: "create" })}
            className="shrink-0 text-[12px] bg-primary-500 hover:bg-primary-600 text-white px-3 py-2 rounded-xl font-medium transition-colors">
            + 新增模特
          </button>
        </div>
      </header>

      {visible.length === 0 ? (
        <div className="py-16 text-center text-gray-500 text-sm">
          {rows.length === 0 ? "还没有模特，点击右上角「+ 新增模特」开始上传" : "没有符合搜索的模特"}
        </div>
      ) : (
        <div className="p-6 grid grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
          {visible.map((m) => (
            <ResourceCard
              key={m.id}
              image={m.images?.[0]}
              name={m.name}
              tags={m.tags}
              shared={m.shared}
              meta={m.images && m.images.length > 1 ? `${m.images.length} 张` : undefined}
              onView={() => setViewer({ mode: "view", mat: m })}
              onEdit={() => setViewer({ mode: "edit", mat: m })}
              onDelete={() => void handleDelete(m)}
            />
          ))}
        </div>
      )}

      <ModelModal
        viewer={viewer}
        onClose={() => setViewer(null)}
        onSwitchEdit={() => viewer?.mat && setViewer({ mode: "edit", mat: viewer.mat })}
        onSave={handleSave}
        onDelete={viewer?.mat ? () => void handleDelete(viewer.mat!) : undefined}
      />
    </div>
  );
}

/** 双态弹窗:view(只读详情 + 管理员共享开关) / edit·create(表单)。 */
function ModelModal({ viewer, onClose, onSwitchEdit, onSave, onDelete }: {
  viewer: null | { mode: "view" | "edit" | "create"; mat?: ModelRow };
  onClose: () => void;
  onSwitchEdit: () => void;
  onSave: (values: Partial<ModelRow> & { newFiles?: File[] }) => Promise<void>;
  onDelete?: (m: ModelRow) => void;
}) {
  if (!viewer) return null;
  const { mode, mat } = viewer;
  const isEditing = mode === "edit" || mode === "create";
  const title = mode === "create" ? "新增模特" : (mode === "edit" ? "编辑模特" : (mat?.name ?? "模特"));
  const { isAdmin } = useAuth();
  const { teamId } = useCurrentTeam();
  const [shared, setShared] = useState(!!mat?.shared);
  const [sharing, setSharing] = useState(false);
  useEffect(() => { setShared(!!mat?.shared); }, [mat]);

  // 管理员共享开关(共享进系统模特库)
  const toggleShare = async () => {
    if (!teamId || !mat || sharing) return;
    const next = !shared;
    setSharing(true);
    setShared(next);
    try {
      await teamApi(teamId).setModelShared(mat.id, next);
    } catch (e: any) {
      setShared(!next);
      showToast(e?.message || "操作失败", "error");
    } finally {
      setSharing(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={
      <div className="flex items-center gap-3 max-w-full">
        <div className="flex-1 min-w-0 truncate">{title}</div>
        {!isEditing && mat && (
          <div className="shrink-0 flex items-center gap-2">
            {isAdmin && (
              <button
                onClick={toggleShare}
                disabled={sharing}
                className={`text-[12px] px-3 py-1.5 rounded-lg font-medium transition-colors ${shared ? "bg-amber-500 hover:bg-amber-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
              >
                {sharing ? "保存中…" : (shared ? "取消共享" : "设为共享")}
              </button>
            )}
            {onDelete && (
              <button
                onClick={() => onDelete(mat)}
                className="text-[12px] bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg font-medium transition-colors"
              >
                删除
              </button>
            )}
            <button
              onClick={onSwitchEdit}
              className="text-[12px] bg-primary-500 hover:bg-primary-600 text-white px-3 py-1.5 rounded-lg font-medium transition-colors"
            >
              编辑
            </button>
          </div>
        )}
      </div>
    } maxWidth={isEditing ? "max-w-[640px]" : "max-w-3xl"}>
      {!isEditing ? <ModelView mat={mat!} /> : <ModelForm key={mat?.id ?? "new"} initial={mat ?? null} onCancel={onClose} onSave={onSave} />}
    </Modal>
  );
}

/** 只读详情:展示模特图片 + 形体数据 + 标签。 */
function ModelView({ mat }: { mat: ModelRow }) {
  const images = mat.images ?? [];
  const fmt = (v: number | null | undefined, unit: string) => (v != null ? `${v} ${unit}` : "—");
  const rows: { label: string; value: string }[] = [
    { label: "身高", value: fmt(mat.height, "cm") },
    { label: "体重", value: fmt(mat.weight, "kg") },
    { label: "胸围", value: fmt(mat.bust, "cm") },
    { label: "腰围", value: fmt(mat.waist, "cm") },
    { label: "臀围", value: fmt(mat.hip, "cm") },
    { label: "鞋码", value: mat.shoes != null ? String(mat.shoes) : "—" },
  ];
  return (
    <div className="space-y-6">
      {/* 图片画廊 */}
      {images.length > 0 ? (
        <div className="grid grid-cols-3 gap-3">
          {images.map((u) => (
            <div key={u} className="aspect-[3/4] rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
              <img src={u} alt={mat.name} className="w-full h-full object-cover" />
            </div>
          ))}
        </div>
      ) : (
        <div className="aspect-video rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center text-sm text-gray-400">暂无图片</div>
      )}

      {/* 形体数据 */}
      <div className="grid grid-cols-3 gap-3">
        {rows.map((r) => (
          <div key={r.label} className="rounded-xl border border-gray-200 px-4 py-3">
            <div className="text-[10px] uppercase tracking-wider text-gray-500">{r.label}</div>
            <div className="text-sm font-medium text-gray-800 mt-0.5">{r.value}</div>
          </div>
        ))}
      </div>

      {/* 标签 */}
      {(mat.tags ?? []).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {(mat.tags ?? []).map((t) => (
            <span key={t} className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{t}</span>
          ))}
        </div>
      )}
    </div>
  );
}

/** 编辑 / 新增 表单:形体数据 + 多图上传(1-5) + 标签。 */
function ModelForm({ initial, onCancel, onSave }: {
  initial: ModelRow | null;
  onCancel: () => void;
  onSave: (values: Partial<ModelRow> & { newFiles?: File[] }) => Promise<void>;
}) {
  const { teamId } = useCurrentTeam();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(initial?.name ?? "");
  const [height, setHeight] = useState(numToStr(initial?.height));
  const [weight, setWeight] = useState(numToStr(initial?.weight));
  const [bust, setBust] = useState(numToStr(initial?.bust));
  const [waist, setWaist] = useState(numToStr(initial?.waist));
  const [hip, setHip] = useState(numToStr(initial?.hip));
  const [shoes, setShoes] = useState(numToStr(initial?.shoes));
  const [tags, setTags] = useState<string>((initial?.tags ?? []).join(", "));
  // 已提交的图片 URL(来自初始数据或已上传)
  const [images, setImages] = useState<string[]>(initial?.images ?? []);
  // 待上传的新图(含本地预览)
  const [newFiles, setNewFiles] = useState<{ file: File; url: string }[]>([]);

  const totalCount = images.length + newFiles.length;
  const canAddMore = totalCount < MAX_IMAGES;

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const payload: any = {
        ...(initial?.id ? { id: initial.id } : {}),
        name: name.trim(),
        height: numFromStr(height),
        weight: numFromStr(weight),
        bust: numFromStr(bust),
        waist: numFromStr(waist),
        hip: numFromStr(hip),
        shoes: numFromStr(shoes),
        tags: tags.split(",").map((s) => s.trim()).filter(Boolean),
        images,
      };
      await onSave({ ...payload, newFiles: newFiles.map((f) => f.file) });
    } catch (err: any) {
      console.error("[model] save failed", err);
      setError(err?.message || "保存失败，请重试");
      setSaving(false);
    }
  };

  // 移除已提交的图片(调后端删除 + 清 COS)
  const removeImage = async (url: string) => {
    if (!teamId || !initial?.id) return;
    // 乐观更新,失败回滚
    const prev = images;
    setImages((prev) => prev.filter((u) => u !== url));
    try {
      await teamApi(teamId).removeModelImage(initial.id, url);
    } catch (e: any) {
      setImages(prev);
      showToast(e?.message || "删除失败", "error");
    }
  };

  const removeNewFile = (idx: number) => {
    setNewFiles((prev) => {
      const next = prev.slice();
      next.splice(idx, 1);
      return next;
    });
  };

  const onPickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const remain = MAX_IMAGES - totalCount;
    if (remain <= 0) { showToast(`每个模特最多 ${MAX_IMAGES} 张图片`, "error"); return; }
    const picked = files.slice(0, remain);
    setNewFiles((prev) => [...prev, ...picked.map((file) => ({ file, url: URL.createObjectURL(file) }))]);
    e.target.value = "";
  };

  const inputCls = "w-full text-[12px] border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-primary-500";
  const labelCls = "text-[10px] uppercase tracking-wider text-gray-500 mb-1";

  return (
    <div className="flex flex-col max-h-[68vh]">
      <div className="flex-1 min-h-0 overflow-y-auto pr-1 text-xs space-y-5">
        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-[12px] text-red-600">⚠ {error}</div>}

        {/* 图片上传(1-5 张) */}
        <div>
          <div className={labelCls}>模特图片 <span className="text-gray-400 normal-case">(最多 {MAX_IMAGES} 张,已 {totalCount}/{MAX_IMAGES})</span></div>
          <div className="grid grid-cols-5 gap-2">
            {images.map((u) => (
              <div key={u} className="relative aspect-[3/4] rounded-lg border border-gray-200 bg-gray-50 overflow-hidden group">
                <img src={u} alt="模特" className="w-full h-full object-cover" />
                <button onClick={() => void removeImage(u)}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  title="移除">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            {newFiles.map((f, idx) => (
              <div key={idx} className="relative aspect-[3/4] rounded-lg border border-primary-200 bg-gray-50 overflow-hidden group">
                <img src={f.url} alt="待上传" className="w-full h-full object-cover" />
                <button onClick={() => removeNewFile(idx)}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  title="移除">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            {canAddMore && (
              <label className="aspect-[3/4] rounded-lg border-2 border-dashed border-gray-200 hover:border-primary-400 flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors">
                <Plus className="w-5 h-5 text-gray-400" />
                <span className="text-[10px] text-gray-400">添加</span>
                <input type="file" accept="image/*" multiple className="hidden" onChange={onPickFiles} />
              </label>
            )}
          </div>
        </div>

        {/* 基础信息 */}
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><div className={labelCls}>姓名 <span className="text-red-500">*</span></div><input value={name} onChange={(e) => setName(e.target.value)} placeholder="模特姓名/编号" className={inputCls} /></div>
          <div><div className={labelCls}>身高 (cm)</div><input value={height} onChange={(e) => setHeight(e.target.value)} inputMode="decimal" placeholder="175" className={inputCls} /></div>
          <div><div className={labelCls}>体重 (kg)</div><input value={weight} onChange={(e) => setWeight(e.target.value)} inputMode="decimal" placeholder="55" className={inputCls} /></div>
          <div><div className={labelCls}>胸围 (cm)</div><input value={bust} onChange={(e) => setBust(e.target.value)} inputMode="decimal" placeholder="88" className={inputCls} /></div>
          <div><div className={labelCls}>腰围 (cm)</div><input value={waist} onChange={(e) => setWaist(e.target.value)} inputMode="decimal" placeholder="68" className={inputCls} /></div>
          <div><div className={labelCls}>臀围 (cm)</div><input value={hip} onChange={(e) => setHip(e.target.value)} inputMode="decimal" placeholder="92" className={inputCls} /></div>
          <div><div className={labelCls}>鞋码</div><input value={shoes} onChange={(e) => setShoes(e.target.value)} inputMode="decimal" placeholder="38" className={inputCls} /></div>
          <div className="col-span-2">
            <div className={labelCls}>标签（逗号分隔）</div>
            <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="女装, 春夏, 亚洲" className={inputCls} />
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

function numToStr(v: number | null | undefined): string {
  return v != null ? String(v) : "";
}
function numFromStr(s: string): number | null {
  if (s == null || s.trim() === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

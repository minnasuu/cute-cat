// @ts-nocheck
/**
 * Lookbook 产品的三态弹窗 —— view / edit / create。
 *
 *   view   :只读详情(设计图、工序时间线、推进按钮、结构化方案、基础字段),
 *           右上角「编辑」切入 edit;
 *   edit   :完整作者字段表单(mode/标题/季节/品类/面料/配色/目标价/版型/工艺/主图);
 *   create :同 edit,仅新建。
 *
 * 主图通过 /products/:id/image 上传(无 slot → 写 imageUrl 主图);
 * 其余字段经 /products (POST/PATCH) 持久化。工序状态由时间线/推进按钮单独管理,
 * 不纳入本表单(与表格行内 StatusSelect / 推进按钮的既有职责保持一致)。
 */
import { useState } from "react";
import { Modal } from "./ui";
import { useCurrentTeam } from "../../../contexts/CurrentTeamContext";
import { useDesignStore } from "../store/design";
import { teamApi } from "../lib/api";
import { MODE_LABEL, STATUS_FLOW, STATUS_LABEL, type DesignMode, type Product, type ProductStatus } from "../types/design";

const ALL_MODES: DesignMode[] = ["illustration", "single", "material-combo", "occasion"];
const SEASON_PRESETS = ["春", "夏", "秋", "冬", "春秋", "秋冬", "春夏", "四季"];

interface Props {
  state: null | { mode: "create" } | { mode: "view" | "edit"; product: Product };
  onClose: () => void;
  onSaved: () => void;
  onRequestEdit: (p: Product) => void;
}

export function ProductFormModal({ state, onClose, onSaved, onRequestEdit }: Props) {
  const { teamId } = useCurrentTeam();

  if (!state) return null;
  const isEditing = state.mode === "edit" || state.mode === "create";
  const title = state.mode === "create" ? "新增产品"
    : state.mode === "edit" ? "编辑产品"
    : (state.product.title || "(untitled)");

  async function handleSave(values: any) {
    if (!teamId) return;
    if (!values.title?.trim()) { alert("请填写产品名 / title"); return; }
    const api = teamApi(teamId);
    const { imageFile, ...data } = values;
    let id = data.id as string | undefined;
    if (id) {
      await api.updateProduct(id, data);
    } else {
      const created = await api.createProduct(data);
      id = created.id;
    }
    if (id && imageFile) {
      const fd = new FormData();
      fd.append("file", imageFile);
      await api.uploadProductImage(id, fd);
    }
    await onSaved();
  }

  return (
    <Modal open onClose={onClose} title={title} maxWidth={isEditing ? "max-w-3xl" : "max-w-5xl"}>
      {!isEditing ? (
        <ProductView product={state.product} onEdit={() => onRequestEdit(state!.product)} onClose={onClose} />
      ) : (
        <ProductForm
          key={state.mode === "edit" ? state.product.id : "new"}
          initial={state.mode === "edit" ? state.product : null}
          onCancel={onClose}
          onSave={handleSave}
        />
      )}
    </Modal>
  );
}

// ── 只读详情 ───────────────────────────────────────────────────

function ProductView({ product, onEdit, onClose }: { product: Product; onEdit: () => void; onClose: () => void }) {
  const { teamId } = useCurrentTeam();
  const store = useDesignStore();
  const target = nextStatus(product.status);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [replacingSlot, setReplacingSlot] = useState<string | null>(null);

  const productImages = (product.images ?? []).filter((im) => im.url);
  const hasHtml = !!product.html;
  const colors = product.colors ?? [];

  async function replaceSlotImage(slot: string, file: File) {
    if (!teamId) return;
    setReplacingSlot(slot);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("slot", slot);
      await teamApi(teamId).uploadProductImage(product.id, fd);
      await store.refresh();
    } finally { setReplacingSlot(null); }
  }

  async function advance() {
    if (!target || !teamId) return;
    setSubmitting(true);
    try {
      await teamApi(teamId).setProductStatus(product.id, { status: target, note: note.trim() || undefined });
      await store.refresh();
    } finally { setSubmitting(false); }
  }

  return (
    <div className="flex-1 min-h-0 h-[60vh] overflow-auto pr-1 text-xs">
      {/* 设计工作流生成的图片 / 插画 HTML */}
      {(productImages.length > 0 || hasHtml || product.imageUrl) && (
        <div className="mb-5">
          <SectionLabel>{hasHtml ? "插画 HTML 画布" : `图片 (${productImages.length || (product.imageUrl ? 1 : 0)})`}</SectionLabel>
          {hasHtml ? (
            <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
              <iframe srcDoc={product.html!} sandbox="allow-scripts" title="插画 HTML 画布" className="w-full bg-white"
                style={{ aspectRatio: "1 / 1", border: "none" }} />
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {product.imageUrl && (
                <figure className="rounded-xl border border-gray-200 overflow-hidden bg-gray-50">
                  <div className="aspect-[1/1] bg-gray-100 overflow-hidden"><img src={product.imageUrl} alt="主图" className="w-full h-full object-cover" /></div>
                  <figcaption className="px-2 py-1 text-[10px] text-gray-600 font-medium truncate">主图</figcaption>
                </figure>
              )}
              {productImages.map((im) => {
                const busy = replacingSlot === im.slot;
                return (
                  <figure key={im.slot} className="rounded-xl border border-gray-200 overflow-hidden bg-gray-50">
                    <div className="aspect-[1/1] bg-gray-100 overflow-hidden"><img src={im.url} alt={im.label} className="w-full h-full object-cover" /></div>
                    <figcaption className="px-2 py-1 flex items-center justify-between gap-1">
                      <span className="text-[10px] text-gray-600 font-medium truncate min-w-0">{im.label}</span>
                      <label className="shrink-0 cursor-pointer text-[10px] text-primary-600 hover:text-primary-700 font-medium disabled:opacity-50">
                        {busy ? "替换中" : "替换"}
                        <input type="file" accept="image/*" className="hidden" disabled={busy}
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) void replaceSlotImage(im.slot, f); e.target.value = ""; }} />
                      </label>
                    </figcaption>
                  </figure>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 时间线 + 推进 */}
      <div className="mb-5">
        <SectionLabel>工序时间线</SectionLabel>
        <ol className="space-y-2 max-h-32 overflow-y-auto pr-2">
          {(product.statusHistory || []).length === 0 && <li className="text-gray-500">尚无工序记录</li>}
          {(product.statusHistory || []).concat(
            (product.statusHistory || []).length === 0 ? [{ id: "init", status: "draft" as ProductStatus, at: product.createdAt, actor: "atelier" }] : []
          ).sort((a, b) => a.at.localeCompare(b.at)).map((e) => (
            <li key={e.id} className="flex items-baseline gap-3">
              <span className="font-mono text-[10px] text-gray-500 w-36">{new Date(e.at).toLocaleString()}</span>
              <span className={`px-2 py-0.5 rounded-full border ${e.status === product.status ? "bg-gray-800 border-gray-800 text-white" : "bg-gray-50 border-gray-200 text-gray-600"}`}>
                {STATUS_LABEL[e.status]}
              </span>
              {e.note && <span className="text-gray-600">{e.note}</span>}
            </li>
          ))}
        </ol>
      </div>

      {/* 结构化方案 */}
      <DesignSections product={product} />

      {/* 基础字段 */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-[12px] border-t border-gray-200 pt-4 mb-4">
        <Detail k="创作模式" v={MODE_LABEL[product.mode]} />
        <Detail k="季节" v={product.seasons?.join(", ")} />
        <Detail k="品类" v={product.category} />
        <Detail k="面料" v={product.fabricComposition} />
        <Detail k="目标价" v={typeof product.targetPriceNum === "number" ? `¥${product.targetPriceNum}` : "—"} />
        <Detail k="版型" v={product.silhouette} />
        <Detail k="工艺" v={product.stitchNotes} />
      </div>

      {/* 颜色色板 */}
      {colors.length > 0 && (
        <div className="mb-4">
          <SectionLabel>颜色</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {colors.map((c) => (
              <div key={c} className="flex flex-col items-center gap-0.5" title={c}>
                <div className="w-8 h-8 rounded-md border border-gray-200" style={{ background: c }} />
                <span className="text-[9px] text-gray-500 font-mono">{c}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {product.description && (
        <div className="mb-4">
          <SectionLabel>描述</SectionLabel>
          <div className="text-[12px] text-gray-700 whitespace-pre-wrap leading-relaxed">{product.description}</div>
        </div>
      )}

      {/* 推进操作 */}
      {target ? (
        <div className="border-t border-gray-200 pt-4">
          <div className="flex items-center gap-3 mb-3">
            <span className="bg-gray-800 text-white px-2 py-1 rounded-full text-[11px]">{STATUS_LABEL[product.status]}</span>
            <span className="text-gray-500">→</span>
            <span className="bg-primary-500 text-white px-2 py-1 rounded-full text-[11px]">{STATUS_LABEL[target]}</span>
          </div>
          <textarea value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="(可选) 批注 · 工厂 / 成本 / 样品反馈 …" rows={2}
            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:border-primary-500" />
        </div>
      ) : (
        <div className="border-t border-gray-200 pt-4 text-primary-600 text-[13px]">✓ 产品已上架,流水完成</div>
      )}

      {/* 底部操作 */}
      <div className="flex items-center justify-end gap-2 mt-5 pt-3 border-t border-gray-100">
        <button onClick={onClose} className="text-[12px] text-gray-600 hover:underline px-3 py-1.5">关闭</button>
        {target && (
          <button disabled={submitting} onClick={advance}
            className="text-[12px] bg-primary-500 hover:bg-primary-600 text-white px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50">
            {submitting ? "推进中…" : `推进至 ${STATUS_LABEL[target]}`}
          </button>
        )}
        <button onClick={onEdit}
          className="text-[12px] bg-gray-800 hover:bg-gray-900 text-white px-4 py-1.5 rounded-lg font-medium transition-colors">
          编辑
        </button>
      </div>
    </div>
  );
}

// ── 编辑 / 新增 表单 ───────────────────────────────────────────

function ProductForm({ initial, onCancel, onSave }: {
  initial: Product | null;
  onCancel: () => void;
  onSave: (values: any) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<DesignMode>(initial?.mode ?? "single");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [seasons, setSeasons] = useState<string>((initial?.seasons ?? []).join("\n"));
  const [category, setCategory] = useState(initial?.category ?? "");
  const [colors, setColors] = useState<string[]>(initial?.colors?.length ? initial.colors : ["#cccccc"]);
  const [targetPriceNum, setTargetPriceNum] = useState<string>(initial?.targetPriceNum != null ? String(initial.targetPriceNum) : "");
  const [silhouette, setSilhouette] = useState(initial?.silhouette ?? "");
  const [fabricComposition, setFabricComposition] = useState(initial?.fabricComposition ?? "");
  const [stitchNotes, setStitchNotes] = useState(initial?.stitchNotes ?? "");
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? "");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [status] = useState<ProductStatus>(initial?.status ?? "draft");

  const canAddColor = colors.length < 5;
  const canRemoveColor = colors.length > 1;

  // 季节 toggles:预设 + 自由文本(每行一条)
  const seasonList = seasons.split("\n").map(s => s.trim()).filter(Boolean);
  function toggleSeason(s: string) {
    if (seasonList.includes(s)) setSeasons(seasonList.filter(x => x !== s).join("\n"));
    else setSeasons([...seasonList, s].join("\n"));
  }

  const submit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      onSave({
        ...(initial?.id ? { id: initial.id } : {}),
        mode,
        title: title.trim(),
        description: description.trim() || "",
        seasons: seasonList,
        category: category.trim() || null,
        colors,
        targetPriceNum: targetPriceNum ? Number(targetPriceNum) : null,
        silhouette: silhouette.trim() || null,
        fabricComposition: fabricComposition.trim() || null,
        stitchNotes: stitchNotes.trim() || null,
        status,
        imageUrl: imageUrl || null,
        imageFile,
      });
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "w-full text-[12px] border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-primary-500";

  return (
    <div className="flex-1 min-h-0 h-[60vh] overflow-auto pr-1 text-xs space-y-5">
      {/* 主图 */}
      <div>
        <SectionLabel>主图</SectionLabel>
        <div className="flex items-center gap-3">
          <div className="w-28 h-28 rounded-xl border border-gray-200 bg-gray-50 overflow-hidden shrink-0">
            {imageUrl
              ? <img src={imageUrl} alt="主图" className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-400">暂无图片</div>}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] text-primary-600 hover:underline cursor-pointer">
              上传主图
              <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                const f = e.target.files?.[0] || null; setImageFile(f); if (f) setImageUrl(URL.createObjectURL(f));
              }} />
            </label>
            {imageUrl && <button onClick={() => { setImageUrl(""); setImageFile(null); }} className="text-[11px] text-gray-500 hover:underline">移除图片</button>}
            <span className="text-[10px] text-gray-400">封面 / 效果图,不传则后续由设计工作流产出</span>
          </div>
        </div>
      </div>

      {/* 基础信息 */}
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <SectionLabel>产品名 *</SectionLabel>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="如:春日雏菊连衣裙" className={inputCls} />
        </div>
        <div>
          <SectionLabel>创作模式</SectionLabel>
          <select value={mode} onChange={(e) => setMode(e.target.value as DesignMode)} className={inputCls}>
            {ALL_MODES.map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
          </select>
        </div>
        <div>
          <SectionLabel>品类</SectionLabel>
          <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="如:裙装 / 外套" className={inputCls} />
        </div>
        <div>
          <SectionLabel>面料成分</SectionLabel>
          <input value={fabricComposition} onChange={(e) => setFabricComposition(e.target.value)} placeholder="如:60% 棉 · 40% 聚酯" className={inputCls} />
        </div>
        <div>
          <SectionLabel>目标价 (¥)</SectionLabel>
          <input value={targetPriceNum} onChange={(e) => setTargetPriceNum(e.target.value)} placeholder="如:399" inputMode="decimal" className={inputCls} />
        </div>
      </div>

      {/* 季节 */}
      <div>
        <SectionLabel>季节</SectionLabel>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {SEASON_PRESETS.map((s) => {
            const active = seasonList.includes(s);
            return (
              <button key={s} onClick={() => toggleSeason(s)}
                className={`px-2.5 py-1 rounded-full border text-[12px] transition-colors ${active ? "bg-primary-500 border-primary-500 text-white" : "border-gray-200 text-gray-600 hover:border-primary-300"}`}>
                {s}
              </button>
            );
          })}
        </div>
        <textarea value={seasons} onChange={(e) => setSeasons(e.target.value)} rows={2}
          placeholder="自由补充,每行一条(预设已选入会同步到这里)"
          className={inputCls} />
      </div>

      {/* 配色 */}
      <div>
        <div className="flex items-baseline justify-between mb-1">
          <SectionLabel>配色 ({colors.length}/5)</SectionLabel>
          <button onClick={() => setColors((cs) => canAddColor ? [...cs, "#cccccc"] : cs)} disabled={!canAddColor}
            className="text-[10px] text-primary-600 disabled:text-gray-300 hover:underline">+ 添加颜色</button>
        </div>
        <div className="flex flex-wrap gap-2">
          {colors.map((c, i) => (
            <div key={i} className="flex items-center gap-1 border border-gray-200 rounded-lg px-1.5 py-1 bg-white">
              <input type="color" value={/^#?[0-9a-fA-F]{6}$/.test(c) ? c : "#cccccc"}
                onChange={(e) => setColors((cs) => cs.map((x, j) => j === i ? e.target.value : x))}
                className="w-7 h-7 rounded cursor-pointer border-0 p-0" />
              <input value={c} onChange={(e) => setColors((cs) => cs.map((x, j) => j === i ? e.target.value : x))}
                className="w-20 text-[11px] font-mono border-0 focus:outline-none" />
              <button onClick={() => setColors((cs) => canRemoveColor ? cs.filter((_, j) => j !== i) : cs)}
                disabled={!canRemoveColor} className="text-gray-400 hover:text-red-500 disabled:opacity-30 px-1">×</button>
            </div>
          ))}
        </div>
      </div>

      {/* 版型 / 工艺 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <SectionLabel>版型 / 结构</SectionLabel>
          <textarea value={silhouette} onChange={(e) => setSilhouette(e.target.value)} rows={4} placeholder="宽松 A 字 · 收腰 …" className={inputCls} />
        </div>
        <div>
          <SectionLabel>工艺 / 备注</SectionLabel>
          <textarea value={stitchNotes} onChange={(e) => setStitchNotes(e.target.value)} rows={4} placeholder="来去缝 · 包边 …" className={inputCls} />
        </div>
      </div>

      {/* 描述 */}
      <div>
        <SectionLabel>描述 / 备注</SectionLabel>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="设计理念、场合、特别说明 …" className={inputCls} />
      </div>

      <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100 sticky bottom-0 bg-white">
        <button onClick={onCancel} className="text-[12px] text-gray-600 hover:underline px-3 py-1.5">取消</button>
        <button onClick={submit} disabled={saving || !title.trim()}
          className="text-[12px] bg-primary-500 hover:bg-primary-600 disabled:opacity-40 text-white px-4 py-1.5 rounded-lg font-medium transition-colors">
          {saving ? "保存中…" : "保存"}
        </button>
      </div>
    </div>
  );
}

// ── 共享小组件 ─────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">{children}</div>;
}

function Detail({ k, v }: { k: string; v?: string }) {
  if (!v) return null;
  return (
    <div>
      <span className="text-gray-500 text-[10px] uppercase tracking-wider">{k}</span>
      <div className="text-gray-700 whitespace-pre-wrap">{v}</div>
    </div>
  );
}

function nextStatus(s: ProductStatus): ProductStatus | null {
  const i = STATUS_FLOW.indexOf(s);
  return i === -1 || i >= STATUS_FLOW.length - 1 ? null : STATUS_FLOW[i + 1]!;
}

/** 结构化方案展示(复用自 Lookbook 详情弹窗,独立内联以避免循环依赖) */
function DesignSections({ product }: { product: Product }) {
  const s = product.sections;
  if (!s) return null;
  const hasAny = s.productName || s.themeNarrative || s.inspirationRefs?.length || s.colorway?.length || s.fabric?.length || s.silhouette || s.targetPrice;
  if (!hasAny) return null;

  return (
    <section className="mb-5 space-y-4">
      <SectionLabel>设计提案</SectionLabel>
      {s.productName && (
        <div>
          <SectionLabel>产品名</SectionLabel>
          <div className="text-[14px] font-semibold text-gray-900 leading-snug">{s.productName}</div>
        </div>
      )}
      {s.themeNarrative && (
        <div>
          <SectionLabel>主题叙述</SectionLabel>
          <div className="text-[12px] text-gray-700 leading-relaxed whitespace-pre-wrap">{s.themeNarrative}</div>
        </div>
      )}
      {s.inspirationRefs && s.inspirationRefs.length > 0 && (
        <div>
          <SectionLabel className="mb-1">灵感借鉴</SectionLabel>
          <div className="space-y-1.5">
            {s.inspirationRefs.map((r) => (
              <div key={r.id} className="text-[11px] text-gray-700 flex items-start gap-2">
                <span className="shrink-0 px-1.5 py-0.5 rounded bg-primary-50 text-primary-600 font-mono text-[10px]">#{r.id.slice(0, 8)}</span>
                <span>
                  {r.category && <span className="text-gray-500 mr-1">{r.category}</span>}
                  {r.summary && <span className="text-gray-600">{r.summary}</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      {s.colorway?.map((cw, i) => (
        <div key={i}>
          <SectionLabel>色彩方案{cw.pantone ? ` · ${cw.pantone}` : ""}</SectionLabel>
          {cw.hex?.length > 0 && (
            <div className="flex gap-1.5 mb-1">
              {cw.hex.map((c) => (
                <div key={c} className="flex flex-col items-center gap-0.5" title={c}>
                  <div className="w-7 h-7 rounded-md border border-gray-200" style={{ background: c }} />
                  <span className="text-[9px] text-gray-500 font-mono">{c}</span>
                </div>
              ))}
            </div>
          )}
          {cw.description && <div className="text-[11px] text-gray-700 whitespace-pre-wrap">{cw.description}</div>}
        </div>
      ))}
      {s.fabric && s.fabric.length > 0 && (
        <div>
          <SectionLabel>材质</SectionLabel>
          <ul className="text-[11px] text-gray-700 space-y-0.5">
            {s.fabric.map((f, i) => (
              <li key={i}><span className="font-medium">{f.name}</span>{f.composition && <span className="text-gray-500 ml-1">· {f.composition}</span>}</li>
            ))}
          </ul>
        </div>
      )}
      {s.silhouette && (
        <div><SectionLabel>形态 / 结构</SectionLabel><div className="text-[11px] text-gray-700 whitespace-pre-wrap">{s.silhouette}</div></div>
      )}
      {s.targetPrice && (
        <div><SectionLabel>目标价格带</SectionLabel><div className="text-[11px] text-gray-700">{s.targetPrice}</div></div>
      )}
    </section>
  );
}

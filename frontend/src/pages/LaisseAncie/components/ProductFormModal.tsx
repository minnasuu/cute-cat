/**
 * Lookbook 产品弹窗 —— 详情(view) + 内联编辑(edit) + 新建(create)。
 *
 * 设计要点(合并 edit 到 detail):
 *   单一弹窗内左图右信息布局:
 *     左侧图片面板(主图/线稿/效果图全部展示,编辑态支持每张的增加/替换/删除/主图互换),
 *     右侧信息面板(工序时间线、推进按钮、结构化方案、基础字段、配色、版型/工艺、描述),
 *     底部固定操作栏(关闭 / 编辑 或 取消 / 保存),不随内容滚动。
 *   点「编辑」原地切到编辑态(图片面板出现操作按钮 + 添加图片入口,右侧字段原地可改),
 *   保存成功落库 + store.refresh() 后回到 view 态继续展示最新值——没有"先关弹窗再开新弹窗"的体感。
 *   create 态继续用完整独立表单(首次建产品),保持原样。
 *
 * 图片统一进 images[].slot:主图(slot="main")/线稿(lineart)/效果图(其余)。
 * 上传默认主图(无 slot → slot="main",已有主图则旧主图降级为效果图);
 * 其余字段经 /products (POST/PATCH) 持久化。工序状态由时间线/推进按钮单独管理,
 * 不纳入本表单(与表格行内 StatusSelect / 推进按钮的既有职责保持一致)。
 */
import { useState, useCallback, useRef, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";
import { Modal } from "./ui";
import { useCurrentTeam } from "../../../contexts/CurrentTeamContext";
import { useDesignStore } from "../store/design";
import { teamApi } from "../lib/api";
import { MODE_LABEL, STATUS_LABEL, STATUS_FLOW, type DesignMode, type Product, type ProductStatus, type ProductOutfitEntry } from "../types/design";
import { MAIN_SLOT, LINEART_SLOT, RENDER_SLOT, slotRole } from "../lib/imageRole";
import { Markdown } from "../lib/markdown";

const ALL_MODES: DesignMode[] = ["illustration", "single", "material-combo", "style-mutate", "occasion"];
const SEASON_PRESETS = ["春", "夏", "秋", "冬", "春秋", "秋冬", "春夏", "四季"];

interface Props {
  state: null | { mode: "create" } | { mode: "view" | "edit"; product: Product };
  onClose: () => void;
  onSaved: () => void;
  /** 兼容旧调用方;view→edit 已内联切换,不再走外部接力 */
  onRequestEdit?: (p: Product) => void;
  /** 上一个产品(view 模式可用,用于详情弹窗内切换) */
  onPrev?: () => void;
  /** 下一个产品(view 模式可用) */
  onNext?: () => void;
}

export function ProductFormModal({ state, onClose, onSaved, onRequestEdit, onPrev, onNext }: Props) {
  const { teamId } = useCurrentTeam();

  if (!state) return null;
  const isEditing = state.mode === "edit" || state.mode === "create";
  const product = "product" in state ? state.product : null;
  const title = state.mode === "create" ? "新增产品"
    : state.mode === "edit" ? "编辑产品"
      : (product?.title || "(untitled)");
  const statusLabel = product ? STATUS_LABEL[product.status] : "";

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
    <Modal open onClose={onClose} title={
      <div className="flex items-center gap-3">{title}
        {statusLabel && (
          <span className="bg-gray-800 text-white px-2 py-1 rounded-full text-[11px]">{statusLabel}</span>
        )}
      </div>
    } maxWidth={isEditing ? "max-w-3xl" : "max-w-[1200px]"}>
      {!isEditing ? (
        <ProductView product={product!} onClose={onClose} onSaved={onSaved} onPrev={onPrev} onNext={onNext} />
      ) : (
        <ProductForm
          key={state.mode === "edit" ? product!.id : "new"}
          initial={state.mode === "edit" ? product : null}
          onCancel={onClose}
          onSave={handleSave}
        />
      )}
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// view + 内联 edit 详情(左图右信息布局)
// ─────────────────────────────────────────────────────────────

function ProductView({ product, onClose, onSaved, onPrev, onNext }: { product: Product; onClose: () => void; onSaved: () => void; onPrev?: () => void; onNext?: () => void }) {
  const { teamId } = useCurrentTeam();
  const store = useDesignStore();
  const target = nextStatus(product.status);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // ── 内联编辑态 ──
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<DesignMode>(product.mode);
  const [title, setTitle] = useState(product.title);
  const [description, setDescription] = useState(product.description);
  const [seasons, setSeasons] = useState<string>((product.seasons ?? []).join("\n"));
  const [category, setCategory] = useState(product.category ?? "");
  const [colors, setColors] = useState<string[]>(product.colors?.length ? [...product.colors] : ["#cccccc"]);
  const [targetPriceStr, setTargetPriceStr] = useState<string>(product.targetPriceNum != null ? String(product.targetPriceNum) : "");
  const [silhouette, setSilhouette] = useState(product.silhouette ?? "");
  const [fabricComposition, setFabricComposition] = useState(product.fabricComposition ?? "");
  const [stitchNotes, setStitchNotes] = useState(product.stitchNotes ?? "");
  // 编辑态下的图片草稿:[{slot,label,url,originalUrl?,clientKey}]。增/删/改 slot/替换文件 均本地完成,提交时整体 PATCH。
  const [draftImages, setDraftImages] = useState(() =>
    collectImages(product).map((im, i) => ({ ...im, clientKey: `img-${i}` })));
  const [busyKey, setBusyKey] = useState<string | null>(null); // 当前正在做替换/删除操作的图片 key

  const colorsCanAdd = colors.length < 5;
  const colorsCanRemove = colors.length > 1;
  const seasonList = seasons.split("\n").map((s) => s.trim()).filter(Boolean);
  const toggleSeason = useCallback((s: string) => {
    setSeasons((seasonList.includes(s) ? seasonList.filter((x) => x !== s) : [...seasonList, s]).join("\n"));
  }, [seasonList]);

  // 当前用于渲染的图片列表(编辑态用草稿,只读态用原始 resolved)
  const displayImages = editing ? draftImages : collectImages(product);
  const mainImages = displayImages.filter((im) => im.slot === MAIN_SLOT);
  const renderImages = displayImages.filter((im) => slotRole(im.slot) === "render" && im.slot !== MAIN_SLOT);
  const lineartImages = displayImages.filter((im) => im.slot === LINEART_SLOT);
  // 穿搭效果图(product.outfits):每项含结果图 + 所用模特 + 参与单品列表
  const outfitImages: Product["outfits"] = Array.isArray(product.outfits) ? product.outfits : [];
  const hasHtml = !!product.html;
  const displayColors = product.colors ?? [];
  const mainImageUrl = displayImages.find((im) => im.slot === MAIN_SLOT)?.url || product.imageUrl || "";

  const cancelEdit = () => {
    setMode(product.mode); setTitle(product.title); setDescription(product.description);
    setSeasons((product.seasons ?? []).join("\n")); setCategory(product.category ?? "");
    setColors(product.colors?.length ? [...product.colors] : ["#cccccc"]);
    setTargetPriceStr(product.targetPriceNum != null ? String(product.targetPriceNum) : "");
    setSilhouette(product.silhouette ?? ""); setFabricComposition(product.fabricComposition ?? "");
    setStitchNotes(product.stitchNotes ?? "");
    setDraftImages(collectImages(product).map((im, i) => ({ ...im, clientKey: `img-${i}` })));
    setEditing(false);
  };

  // ── 图片草稿操作 ──
  /** 新增图片:上传到服务端拿持久化 url,追加一条 slot=render 的条目到草稿 */
  const addImage = async (file: File) => {
    if (!teamId) return;
    setBusyKey("new");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("slot", "render"); // 显式 slot → 追加一条,不触发主图互换
      const updated: Product = await teamApi(teamId).uploadProductImage(product.id, fd);
      // 以服务端已持久化的 images 重建草稿(拿到稳定 url + slot),保留本地已删除 key 的不回灌
      const persisted = collectImages(updated);
      setDraftImages((prev) => {
        const removedKeys = new Set(persistRemovedKeys(prev, persisted));
        return persisted
          .filter((im) => !removedKeys.has(im.url))
          .map((im, i) => ({ ...im, clientKey: `img-${Date.now()}-${i}` }));
      });
      await store.refresh();
    } catch (e: any) {
      alert(`图片上传失败: ${e?.message || e}`);
    } finally { setBusyKey(null); }
  };

  /** 替换草稿中某条目的图片文件(服务端替换 slot,拿到新 url 后整体重建草稿以同步) */
  const replaceImageDraft = async (clientKey: string, file: File) => {
    if (!teamId) return;
    const target = draftImages.find((im) => im.clientKey === clientKey);
    const slot = target?.slot || "render";
    // 通过唯一 url(而非非唯一的 slot)定位要替换的图片,避免多张同 slot 图时总替换第一张
    const url = target?.url ?? "";
    setBusyKey(clientKey);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("slot", slot);
      fd.append("url", url);
      const updated: Product = await teamApi(teamId).uploadProductImage(product.id, fd);
      const persisted = collectImages(updated);
      setDraftImages((prev) => {
        const removedKeys = new Set(persistRemovedKeys(prev, persisted));
        return persisted.filter((im) => !removedKeys.has(im.url)).map((im, i) => ({ ...im, clientKey: `img-${Date.now()}-${i}` }));
      });
      await store.refresh();
    } catch (e: any) {
      alert(`替换失败: ${e?.message || e}`);
    } finally { setBusyKey(null); }
  };

  /** 删除草稿中某条目(本地删,保存时提交不含它的数组) */
  const removeImageDraft = (clientKey: string) => {
    setDraftImages((prev) => prev.filter((im) => im.clientKey !== clientKey));
  };

  /** 主图互换 —— 本地操作草稿(设为主图:当前主图降级为目标 render;降级:主图变 render),保存时整体提交 */
  const changeImageMain = (targetKey: string, action: "promote" | "demote") => {
    setDraftImages((prev) => {
      const idx = prev.findIndex((im) => im.clientKey === targetKey);
      if (idx < 0) return prev;
      const next = prev.map((im) => ({ ...im }));
      const target = next[idx];
      if (action === "demote") {
        next[idx] = { ...target, slot: RENDER_SLOT };
      } else {
        for (let i = 0; i < next.length; i++) if (next[i].slot === MAIN_SLOT) next[i] = { ...next[i], slot: RENDER_SLOT };
        next[idx] = { ...target, slot: MAIN_SLOT };
      }
      return next;
    });
  };

  const submitEdit = async () => {
    if (!title.trim() || !teamId) return;
    setSaving(true);
    try {
      const api = teamApi(teamId);
      // 提交的图片数组(去掉本地 clientKey;若主图也作为 imageUrl 派生兼容字段)
      const mainImg = draftImages.find((im) => im.slot === MAIN_SLOT);
      const imagesPayload = draftImages.map(({ clientKey, ...im }) => ({
        slot: im.slot, label: im.label, url: im.url,
        ...(im.originalUrl ? { originalUrl: im.originalUrl } : {}),
      }));
      const payload = {
        mode, title: title.trim(), description: description.trim() || "",
        seasons: seasonList, category: category.trim() || null, colors,
        targetPriceNum: targetPriceStr ? Number(targetPriceStr) : null,
        silhouette: silhouette.trim() || null, fabricComposition: fabricComposition.trim() || null,
        stitchNotes: stitchNotes.trim() || null,
        images: imagesPayload,
        imageUrl: mainImg?.url || null,
      };
      await api.updateProduct(product.id, payload);
      await store.refresh();
      await onSaved();
      setDraftImages(collectImages({ ...product, images: imagesPayload }).map((im, i) => ({ ...im, clientKey: `img-${i}` })));
      setEditing(false);
    } catch (e: any) {
      alert(`保存失败: ${e?.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  async function advance() {
    if (!target || !teamId) return;
    setSubmitting(true);
    try {
      await teamApi(teamId).setProductStatus(product.id, { status: target, note: note.trim() || undefined });
      await store.refresh();
    } finally { setSubmitting(false); }
  }

  const inputCls = "w-full text-[12px] border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-primary-500";

  // ── 单张图片卡片(视图/编辑共用,编辑态叠加操作按钮) ──
  const renderImageCard = (im: typeof displayImages[number], opts: { showSource?: boolean }) => {
    const busy = busyKey === (im as any).clientKey || (im.slot === "main" && busyKey === "new");
    const canDemote = editing && im.slot === MAIN_SLOT;
    const canPromote = editing && im.slot !== MAIN_SLOT && im.slot !== LINEART_SLOT;
    const srcContext = (opts.showSource && (product.mode === "material-combo" || product.mode === "style-mutate"))
      ? product.sourceImages?.[product.images?.indexOf(im) ?? -1]
      : undefined;
    const hasSrc = !!(srcContext?.style || srcContext?.fabric);
    return (
      <figure className="h-full rounded-xl overflow-hidden bg-gray-50 group relative">
        <div className="h-full bg-gray-100 overflow-hidden"><img src={im.url} alt={im.label} className="w-full h-full object-contain" /></div>
        {/* 主图角标 */}
        {im.slot === MAIN_SLOT && (
          <span className="absolute top-1 left-1 z-10 text-[8px] px-1.5 py-0.5 rounded-sm bg-amber-500/95 text-white font-medium">主图</span>
        )}
        {/* 编辑态:操作按钮叠加层 */}
        {editing && (
          <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/60 to-transparent px-2 pt-3 pb-2 flex flex-wrap items-center justify-between gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="text-[10px] text-white font-medium truncate min-w-0 drop-shadow">{im.label}</span>
            <span className="flex items-center gap-1">
              {canPromote && (
                <button type="button" onClick={() => changeImageMain((im as any).clientKey, "promote")}
                  className="text-[10px] bg-white/90 hover:bg-white text-gray-800 px-1.5 py-0.5 rounded font-medium">主图</button>
              )}
              {canDemote && (
                <button type="button" onClick={() => changeImageMain((im as any).clientKey, "demote")}
                  className="text-[10px] bg-white/90 hover:bg-white text-gray-800 px-1.5 py-0.5 rounded font-medium">降级</button>
              )}
              <label className="text-[10px] bg-white/90 hover:bg-white text-gray-800 px-1.5 py-0.5 rounded font-medium cursor-pointer">
                {busy ? "…" : "替换"}
                <input type="file" accept="image/*" className="hidden" disabled={busy}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void replaceImageDraft((im as any).clientKey, f); e.target.value = ""; }} />
              </label>
              <button type="button" onClick={() => removeImageDraft((im as any).clientKey)}
                className="text-[10px] bg-red-500/90 hover:bg-red-600 text-white px-1.5 py-0.5 rounded font-medium">删除</button>
            </span>
          </div>
        )}
        {/* 非编辑态:仅显示名称 */}
        {!editing && im.slot !== MAIN_SLOT && (
          <figcaption className="px-2 py-1 flex items-center justify-between">
            <span className="text-[10px] text-gray-600 font-medium truncate">{im.label}</span>
          </figcaption>
        )}
        {im.slot === MAIN_SLOT && !editing && (
          <figcaption className="px-2 py-1"><span className="text-[10px] text-gray-600 font-medium truncate">{im.label}</span></figcaption>
        )}
        {/* 材料组合 / 款式裂变:图 2 参考图来源小缩略图(hasSrc) */}
        {hasSrc && (
          <div className="px-2 pb-2 flex items-center gap-2 border-t border-gray-100 pt-1.5">
            {srcContext?.style ? <SourceThumb kind="款式" img={srcContext.style} /> : <SourcePlaceholder kind="款式" />}
            {srcContext?.fabric ? <SourceThumb kind="面料" img={srcContext.fabric} /> : <SourcePlaceholder kind="面料" />}
          </div>
        )}
      </figure>
    );
  };

  // 非编辑态:把分组图片(主图/线稿/效果图/穿搭)打平成一维数组,交给 swiper 左右切换
  const renderOutfitFigure = (o: ProductOutfitEntry) => (
    <figure className="overflow-hidden bg-gray-50 group">
      <div className="h-full bg-gray-100 overflow-hidden relative">
        {o.url ? <img src={o.url} alt="穿搭效果" className="w-full h-full object-contain" /> : null}
        {o.model?.url && (
          <span className="absolute top-1 left-1 z-10 flex items-center gap-1 text-[8px] px-1 py-0.5 rounded-sm bg-primary-500/90 text-white font-medium max-w-[80%]">
            <img src={o.model.url} alt="" className="w-3 h-3 rounded-full object-cover shrink-0" />
            <span className="truncate">{o.model.name}</span>
          </span>
        )}
      </div>
      <figcaption className="px-2 py-1 flex items-center justify-between gap-1">
        <span className="text-[10px] text-gray-600 font-medium truncate" title={(o.products || []).map((p) => p.title).join(" + ") || o.note}>
          {(o.products || []).length > 1 ? `${o.products.length} 款搭配` : (o.note || "穿搭效果")}
        </span>
      </figcaption>
    </figure>
  );

  const viewSlides: ReactNode[] = [
    ...mainImages.map((im, i) => <div key={`v-main-${i}`} className="h-full">{renderImageCard(im, { showSource: false })}</div>),
    ...lineartImages.map((im, i) => <div key={`v-line-${i}`} className="h-full">{renderImageCard(im, { showSource: false })}</div>),
    ...renderImages.map((im, i) => <div key={`v-render-${i}`} className="h-full">{renderImageCard(im, { showSource: true })}</div>),
    ...outfitImages.map((o, i) => <div key={`v-outfit-${i}`} className="h-full">{renderOutfitFigure(o)}</div>),
  ];

  return (
    <div className="flex-1 min-h-0 flex flex-col h-[85vh]">
      {/* ── 主体:左图(更宽) / 右信息 双栏 ── */}
      <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[700px_1fr] gap-5 relative">
        {/* 上一个/下一个产品切换按钮(view 模式,固定在右侧 16px,垂直居中) */}
        {!editing && (onPrev || onNext) && (
          <div className="absolute -right-20 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-2">
            <button type="button" title="上一个产品" disabled={!onPrev} onClick={onPrev}
              className="w-9 h-9 rounded-full flex items-center justify-center bg-white/90 hover:bg-primary-500 text-gray-600 hover:text-white ring-1 ring-black/5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-sm font-bold">
                <svg width="16" height="16" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13 30L25 18L37 30" stroke="#4a4a4a" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
            <button type="button" title="下一个产品" disabled={!onNext} onClick={onNext}
              className="w-9 h-9 rounded-full flex items-center justify-center bg-white/90 hover:bg-primary-500 text-gray-600 hover:text-white ring-1 ring-black/5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-sm font-bold">
               <svg width="16" height="16" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M36 18L24 30L12 18" stroke="#4a4a4a" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
          </div>
        )}
        {/* 左侧:图片面板(粘性顶栏 + 滚动内容) */}
        <aside className="min-h-0 flex flex-col border-r border-gray-100 pr-3">
          {/* <div className="flex items-center justify-between mb-2 shrink-0">
            <SectionLabel>图片 ({displayImages.length})</SectionLabel>
            {editing && !hasHtml && (
              <label className="text-[11px] text-primary-600 hover:underline cursor-pointer font-medium">
                {busyKey === "new" ? "上传中…" : "+ 添加图片"}
                <input type="file" accept="image/*" className="hidden" disabled={busyKey === "new"}
                  multiple
                  onChange={(e) => {
                    const files = e.target.files;
                    if (!files?.length) return;
                    void (async () => { for (const f of Array.from(files)) { await addImage(f); } })();
                    e.target.value = "";
                  }} />
              </label>
            )}
          </div> */}
          <div className="flex-1 min-h-0 overflow-auto pt-5">
            {hasHtml ? (
              <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
                <iframe srcDoc={product.html!} sandbox="allow-scripts" title="插画 HTML 画布" className="w-full bg-white"
                  style={{ aspectRatio: "1 / 1", border: "none" }} />
              </div>
            ) : (displayImages.length === 0 && outfitImages.length === 0) ? (
              <div className="rounded-xl border border-dashed border-gray-300 bg-white h-40 flex flex-col items-center justify-center text-[12px] text-gray-400 gap-2">
                <span>暂无图片</span>
                {editing && (
                  <label className="text-[11px] text-primary-600 hover:underline cursor-pointer">
                    <input type="file" accept="image/*" className="hidden" multiple
                      onChange={(e) => {
                        const files = e.target.files; if (!files?.length) return;
                        void (async () => { for (const f of Array.from(files)) { await addImage(f); } })();
                        e.target.value = "";
                      }} />
                    点击上传
                  </label>
                )}
              </div>
            ) : editing ? (
              <div className="space-y-3">
                {mainImages.length > 0 && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">主图</div>
                    <div className="grid grid-cols-2 gap-2">{mainImages.map((im) => <div key={(im as any).clientKey || im.slot}>{renderImageCard(im, { showSource: false })}</div>)}</div>
                  </div>
                )}
                {lineartImages.length > 0 && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">线稿</div>
                    <div className="grid grid-cols-2 gap-2">{lineartImages.map((im) => <div key={(im as any).clientKey || im.slot}>{renderImageCard(im, { showSource: false })}</div>)}</div>
                  </div>
                )}
                {renderImages.length > 0 && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">效果图</div>
                    <div className="grid grid-cols-2 gap-2">{renderImages.map((im) => <div key={(im as any).clientKey || im.slot}>{renderImageCard(im, { showSource: true })}</div>)}</div>
                  </div>
                )}
                {outfitImages.length > 0 && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">穿搭效果图 ({outfitImages.length})</div>
                    <div className="grid grid-cols-2 gap-2">{outfitImages.map((o) => <div key={o.id}>{renderOutfitFigure(o)}</div>)}</div>
                  </div>
                )}
              </div>
            ) : viewSlides.length > 0 ? (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">全部图片 ({viewSlides.length})</div>
                <ImageSwiper slides={viewSlides} />
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-gray-300 bg-white h-40 flex items-center justify-center text-[12px] text-gray-400">
                <span>暂无图片</span>
              </div>
            )}
          </div>
        </aside>

        {/* 右侧:信息面板 */}
        <section className="min-h-0 overflow-auto pl-1 space-y-5 pt-5">
          {/* 工序时间线 + 推进(编辑态也保留,便于边改边推进) */}
          <div>
            <SectionLabel>工序时间线</SectionLabel>
            <ol className="space-y-2 max-h-32 overflow-y-auto pr-2">
              {(product.statusHistory || []).length === 0 && <li className="text-gray-500">尚无工序记录</li>}
              {(product.statusHistory || []).concat(
                (product.statusHistory || []).length === 0 ? [{ id: "init", status: "draft" as ProductStatus, at: product.createdAt, actor: "atelier" }] : []
              ).sort((a, b) => a.at.localeCompare(b.at)).map((e) => (
                <li key={e.id} className="flex items-baseline gap-3">
                  <span className="font-mono text-[10px] text-gray-500 w-36">{new Date(e.at).toLocaleString()}</span>
                  {e.note && <span className="text-gray-600">{e.note}</span>}
                </li>
              ))}
            </ol>
          </div>

          {/* 结构化方案 */}
          <DesignSections product={product} />

          {/* ── 可编辑基础字段 ── */}
          {/* 产品名 + 创作模式 */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-[12px] border-t border-gray-200 pt-4 mb-4">
            {editing ? (
              <>
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
                  <input value={targetPriceStr} onChange={(e) => setTargetPriceStr(e.target.value)} placeholder="如:399" inputMode="decimal" className={inputCls} />
                </div>
              </>
            ) : (
              <>
                <Detail k="创作模式" v={MODE_LABEL[product.mode]} />
                <Detail k="季节" v={product.seasons?.join(", ")} />
                <Detail k="品类" v={product.category} />
                <Detail k="面料" v={product.fabricComposition} />
                <Detail k="目标价" v={typeof product.targetPriceNum === "number" ? `¥${product.targetPriceNum}` : "—"} />
                <Detail k="版型" v={product.silhouette} />
                <Detail k="工艺" v={product.stitchNotes} />
              </>
            )}
          </div>

          {/* 季节(编辑态) */}
          {editing && (
            <div className="mb-4">
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
                placeholder="自由补充,每行一条(预设已选入会同步到这里)" className={inputCls} />
            </div>
          )}

          {/* 配色 */}
          <div className="mb-4">
            {editing ? (
              <div>
                <div className="flex items-baseline justify-between mb-1">
                  <SectionLabel>配色 ({colors.length}/5)</SectionLabel>
                  <button onClick={() => setColors((cs) => colorsCanAdd ? [...cs, "#cccccc"] : cs)} disabled={!colorsCanAdd}
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
                      <button onClick={() => setColors((cs) => colorsCanRemove ? cs.filter((_, j) => j !== i) : cs)}
                        disabled={!colorsCanRemove} className="text-gray-400 hover:text-red-500 disabled:opacity-30 px-1">×</button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <SectionLabel>颜色</SectionLabel>
                <div className="flex flex-wrap gap-2">
                  {displayColors.map((c) => (
                    <div key={c} className="flex flex-col items-center gap-0.5" title={c}>
                      <div className="w-8 h-8 rounded-md border border-gray-200" style={{ background: c }} />
                      <span className="text-[9px] text-gray-500 font-mono">{c}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* 版型 / 工艺(编辑态) */}
          {editing && (
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <SectionLabel>版型 / 结构</SectionLabel>
                <textarea value={silhouette} onChange={(e) => setSilhouette(e.target.value)} rows={4} placeholder="宽松 A 字 · 收腰 …" className={inputCls} />
              </div>
              <div>
                <SectionLabel>工艺 / 备注</SectionLabel>
                <textarea value={stitchNotes} onChange={(e) => setStitchNotes(e.target.value)} rows={4} placeholder="来去缝 · 包边 …" className={inputCls} />
              </div>
            </div>
          )}

          {/* 描述 */}
          {editing ? (
            <div className="mb-4">
              <SectionLabel>描述 / 备注</SectionLabel>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="设计理念、场合、特别说明 …" className={inputCls} />
            </div>
          ) : (
            product.description && (
              <div className="mb-4">
                <SectionLabel>描述</SectionLabel>
                <Markdown source={product.description} />
              </div>
            )
          )}
        </section>
      </div>

      {/* ── 底部固定操作栏(不随内容滚动) ── */}
      <div className="shrink-0 flex items-center justify-between gap-2 pt-3 border-t border-gray-100 bg-white">
        <div className="text-[11px] text-gray-500 truncate min-w-0">
          {mainImageUrl && editing ? "提示: 悬停图片可替换/调整主图/删除 · 可点击「+ 添加图片」追加" : ""}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {editing ? (
            <>
              <button onClick={cancelEdit} disabled={saving} className="text-[12px] text-gray-600 hover:underline px-3 py-1.5 disabled:opacity-50">取消</button>
              <button onClick={submitEdit} disabled={saving || !title.trim()}
                className="text-[12px] bg-primary-500 hover:bg-primary-600 disabled:opacity-40 text-white px-4 py-1.5 rounded-lg font-medium transition-colors">
                {saving ? "保存中…" : "保存"}
              </button>
            </>
          ) : (
            <>
              <button onClick={onClose} className="text-[12px] text-gray-600 hover:underline px-3 py-1.5">关闭</button>
              <button onClick={() => setEditing(true)}
                className="text-[12px] bg-gray-800 hover:bg-gray-900 text-white px-4 py-1.5 rounded-lg font-medium transition-colors">
                编辑
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 非编辑态图片 swiper:打平后的所有图片左右切换(支持箭头/圆点/拖拽) ──
function ImageSwiper({ slides }: { slides: ReactNode[] }) {
  const total = slides.length;
  const [active, setActive] = useState(0);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const offsetRef = useRef(0);

  const go = (i: number) => setActive(((i % total) + total) % total);
  const prev = () => go(active - 1);
  const next = () => go(active + 1);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    startX.current = e.clientX;
    offsetRef.current = 0;
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const dx = e.clientX - startX.current;
    offsetRef.current = dx;
    setOffset(dx);
  };
  const onPointerUp = () => {
    if (!dragging) return;
    const dx = offsetRef.current;
    setDragging(false);
    setOffset(0);
    if (dx <= -50) next();
    else if (dx >= 50) prev();
  };

  return (
    <div>
      <div
        className="relative overflow-hidden rounded-2xl border border-gray-200 bg-gray-50 select-none"
        style={{  height: "570px" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          className="flex h-full w-full"
          style={{
            transform: `translate3d(calc(${-active * 100}% + ${offset}px), 0, 0)`,
            transition: dragging ? "none" : "transform 300ms ease",
            touchAction: "pan-y",
          }}
        >
          {slides.map((s, i) => (
            <div key={i} className="h-full w-full shrink-0 flex items-center justify-center">{s}</div>
          ))}
        </div>
        {total > 1 && (
          <>
            <button type="button" aria-label="上一张" onClick={prev}
              onPointerDown={(e) => e.stopPropagation()}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/85 hover:bg-white shadow ring-1 ring-black/5 flex items-center justify-center text-gray-700">
              <svg width="16" height="16" viewBox="0 0 48 48" fill="none"><path d="M29 12L17 24L29 36" stroke="#4a4a4a" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <button type="button" aria-label="下一张" onClick={next}
              onPointerDown={(e) => e.stopPropagation()}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/85 hover:bg-white shadow ring-1 ring-black/5 flex items-center justify-center text-gray-700">
              <svg width="16" height="16" viewBox="0 0 48 48" fill="none"><path d="M19 12L31 24L19 36" stroke="#4a4a4a" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <span className="absolute bottom-2 right-2 text-[10px] px-2 py-0.5 rounded-full bg-black/55 text-white font-medium">{active + 1} / {total}</span>
          </>
        )}
      </div>
      {total > 1 && (
        <div className="flex items-center justify-center gap-1.5 mt-2">
          {slides.map((_, i) => (
            <button key={i} type="button" aria-label={`第 ${i + 1} 张`} onClick={() => go(i)}
              onPointerDown={(e) => e.stopPropagation()}
              className={`h-1.5 rounded-full transition-all ${i === active ? "w-4 bg-primary-500" : "w-1.5 bg-gray-300 hover:bg-gray-400"}`} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── 图片辅助:合并 images[] + 遗留 imageUrl,按角色顺序输出 ──
function collectImages(p: Product) {
  const imgs = Array.isArray(p.images) ? p.images.filter((im) => im && im.url).map((im) => ({ slot: im.slot, label: im.label, url: im.url, originalUrl: im.originalUrl })) : [];
  if (!imgs.some((im) => im.slot === MAIN_SLOT) && p.imageUrl) {
    // originalUrl 需与上面 map 结果保持一致的字段形态,遗留 imageUrl 无原图,置 null。
    imgs.unshift({ slot: MAIN_SLOT, label: "主图", url: p.imageUrl, originalUrl: null });
  }
  const order = (s: string) => (s === MAIN_SLOT ? 0 : s === LINEART_SLOT ? 1 : 2);
  return [...imgs].sort((a, b) => order(a.slot) - order(b.slot));
}

// ── 图片辅助:检测"草稿中已删除但服务端仍存在的条目 url"(本地删除后上传不回灌) ──
function persistRemovedKeys(prevDraft: Array<{ clientKey: string; url: string }>, persisted: Array<{ url: string }>): string[] {
  // persisted 里没有出现 prevDraft 中某条目 → 已被用户从草稿删除,返回这些 url(让 addImage 时不再回灌)
  const persistedUrls = new Set(persisted.map((im) => im.url));
  return prevDraft.filter((im) => !persistedUrls.has(im.url)).map((im) => im.url);
}

// ─────────────────────────────────────────────────────────────
// create 新增表单(独立)
// ─────────────────────────────────────────────────────────────
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
  const mainFromImages = (initial?.images ?? []).find((im) => im.slot === MAIN_SLOT)?.url;
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? mainFromImages ?? "");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [status] = useState<ProductStatus>(initial?.status ?? "draft");

  const canAddColor = colors.length < 5;
  const canRemoveColor = colors.length > 1;
  const seasonList = seasons.split("\n").map((s) => s.trim()).filter(Boolean);
  function toggleSeason(s: string) {
    if (seasonList.includes(s)) setSeasons(seasonList.filter((x) => x !== s).join("\n"));
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
          placeholder="自由补充,每行一条(预设已选入会同步到这里)" className={inputCls} />
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
              <input value={c} onChange={(e) => setColors((cs) => cs.map((x, j) => j === i ? c : x))}
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

function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={`text-[10px] uppercase tracking-wider text-gray-500 mb-1.5 ${className || ""}`.trim()}>{children}</div>;
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

/** 参考图小缩略图(款式图 / 面料图) */
function SourceThumb({ kind, img }: { kind: string; img: { url: string; name: string } }) {
  return (
    <div className="flex items-center gap-1 min-w-0" title={`${kind}: ${img.name}`}>
      <img src={img.url} alt={img.name} className="w-7 h-7 rounded object-cover border border-gray-200 bg-gray-100 shrink-0" />
      <span className="text-[9px] text-gray-500 truncate">{kind}</span>
    </div>
  );
}

/** 来源为上传(非库)时的占位,保持两张图对齐一致 */
function SourcePlaceholder({ kind }: { kind: string }) {
  return (
    <div className="flex items-center gap-1" title={`${kind}: 用户上传(非库资源)`}>
      <div className="w-7 h-7 rounded border border-dashed border-gray-200 bg-gray-50 flex items-center justify-center text-[8px] text-gray-300 shrink-0">—</div>
      <span className="text-[9px] text-gray-400">{kind}</span>
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

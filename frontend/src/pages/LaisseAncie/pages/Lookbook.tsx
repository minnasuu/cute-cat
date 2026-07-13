// @ts-nocheck
/**
 * Lookbook —— 款式总览。
 *
 * 表格列:预览(堆叠缩略图) / 产品 / 季节 / 品类 / 面料 / 目标价 / 状态(下拉编辑) / 知识 / 最近更新 / 操作。
 *  - 预览列:所有图片堆叠错位展示 + N 标记;
 *  - 状态列:下拉 select,直接调 advance 接口推进 / 回退工序;
 *  - 操作列:「编辑」→ 跳转单品设计工作台(携带产品上下文) / 「删除」行内确认。
 *  - 点击行 → 详情弹窗(含结构化方案、色块、灵感引用、完整方案 Markdown、工序时间线、推进按钮)。
 */
import { useMemo, useState } from "react";
import { useDesignStore } from "../store/design";
import { useSkillStore } from "../store/skill";
import { useCurrentTeam } from "../../../contexts/CurrentTeamContext";
import { useEditingProduct } from "../contexts/editing-product";
import { Markdown } from "../lib/markdown";
import { teamApi } from "../lib/api";
import { MODE_LABEL, STATUS_FLOW, STATUS_LABEL, type Product, type ProductStatus } from "../types/design";

/**
 * 图片悬停放大预览。
 * 鼠标悬停时跟手浮起一张 320px 大图,自动贴近视口边缘避免溢出;
 * 切图/平铺图默认放大 2.5 倍,长图(版型/细节)放大 1.8 倍以保持整体入框。
 */
function HoverZoomImg({ src, alt, zoom = 2.5, className = "" }: { src: string; alt?: string; zoom?: number; className?: string }) {
  const [hovered, setHovered] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [placed, setPlaced] = useState(false);

  const PREV_W = 320;
  const PREV_H = 320;
  const GAP = 16;

  function onMove(e: React.MouseEvent) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // 优先放在鼠标右侧,右侧不够就改到上方
    let left = e.clientX + GAP;
    let top = e.clientY + GAP;
    if (left + PREV_W > vw) left = e.clientX - PREV_W - GAP;
    if (top + PREV_H > vh) top = vh - PREV_H - GAP;
    if (top < GAP) top = GAP;
    setPos({ x: left, y: top });
    setPlaced(true);
  }

  return (
    <>
      <div
        className={`relative inline-block ${className}`}
        onMouseEnter={() => { setPlaced(false); setHovered(true); }}
        onMouseLeave={() => setHovered(false)}
        onMouseMove={onMove}
      >
        {hovered && (
          <div className="absolute inset-0 ring-2 ring-primary-400 ring-offset-1 rounded-md pointer-events-none z-10" />
        )}
        <img src={src} alt={alt} className="w-full h-full object-cover" draggable={false} />
      </div>
      {hovered && (
        <div
          className="fixed z-[60] rounded-xl border border-gray-200 bg-white shadow-2xl overflow-hidden pointer-events-none"
          style={{
            left: pos.x,
            top: pos.y,
            width: PREV_W,
            height: PREV_H,
            opacity: placed ? 1 : 0,
            transition: "opacity 120ms ease-out",
          }}
        >
          <img
            src={src}
            alt={alt}
            draggable={false}
            className="bg-[#f8f8f8]"
            style={{ width: PREV_W * zoom, height: PREV_H * zoom, maxWidth: "none", transformOrigin: "top left" }}
          />
        </div>
      )}
    </>
  );
}

/** 简易行内删除确认状态:id → 是否正在确认中。 */
function useRowDelete() {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const store = useDesignStore();

  async function doDelete(id: string) {
    setPending(id);
    try { await store.removeProduct(id); }
    catch (e: any) { console.error("[lookbook] delete failed", e); alert(`删除失败: ${e?.message || e}`); }
    finally { setPending(null); setConfirming((cur) => (cur === id ? null : cur)); }
  }
  return { confirming, setConfirming, pending, doDelete };
}

const ALL_MODES = ["illustration", "single", "collection", "occasion"] as const;
type TabKey = "illustration" | "single" | "collection" | "occasion" | "all";

function nextStatus(s: ProductStatus): ProductStatus | null {
  const i = STATUS_FLOW.indexOf(s);
  return i === -1 || i >= STATUS_FLOW.length - 1 ? null : STATUS_FLOW[i + 1]!;
}

export default function LookbookPage() {
  const { teamId, navigateTab } = useCurrentTeam();
  const store = useDesignStore();
  const [tab, setTab] = useState<TabKey>("all");
  const [activeProduct, setActiveProduct] = useState<Product | null>(null);
  const { confirming, setConfirming, pending, doDelete } = useRowDelete();
  const { setEditingProduct } = useEditingProduct();

  const items = useMemo(() => {
    if (tab === "all") return store.products;
    return store.products.filter((p) => p.mode === tab);
  }, [store.products, tab]);

  // 行内切换状态(自由切换到任意工序),成功后刷新列表并同步弹窗
  async function changeStatus(p: Product, status: ProductStatus) {
    if (status === p.status) return;
    if (!teamId) return;
    const updated = await teamApi(teamId).setProductStatus(p.id, { status });
    await store.refresh();
    setActiveProduct((prev) => (prev && prev.id === p.id ? updated : prev));
  }
  /** 状态变更 → 调 PATCH 更新状态 + 追加 statusHistory */
  async function handleStatusChange(id: string, newStatus: ProductStatus) {
    const now = new Date().toISOString();
    const entry = { id: crypto.randomUUID(), status: newStatus, at: now, actor: "atelier" };
    // 先乐观更新本地 store,再调接口
    store.products.forEach((p) => {
      // 找到产品并更新 —— 通过 upsertProduct 同步
    });
    try {
      // PATCH /products/:id 状态字段透传
      const target = store.products.find((p) => p.id === id);
      if (target) {
        const updated: Product = {
          ...target,
          status: newStatus,
          statusHistory: [...(target.statusHistory || []), entry],
          updatedAt: now,
        };
        await store.upsertProduct(updated);
        // 同步 activeProduct 引用(弹窗中)
        setActiveProduct((cur) => cur?.id === id ? updated : cur);
      }
    } catch (e: any) {
      alert(`状态更新失败: ${e?.message || e}`);
    }
  }

  /** 编辑:把产品塞入编辑上下文 + 跳转单品设计工作台 */
  function handleEdit(p: Product, e: React.MouseEvent) {
    e.stopPropagation();
    setEditingProduct(p);
    navigateTab("single");
  }

  return (
    <div className="p-8 lg:p-12 max-w-[1500px] mx-auto">
      <header className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-5xl font-semibold text-primary-600 tracking-tight">Lookbook</h1>
          <p className="text-sm text-gray-500 mt-1">款式总览 — 按创作模式分类 · 下拉切换工序 · 点击行编辑详情</p>
        </div>
        <span className="text-xs text-gray-500">{store.products.length} items</span>
      </header>
      <div className="inline-flex rounded-2xl border border-gray-200 overflow-hidden text-sm mb-6">
        <TabBtn current={tab} value="all" onClick={setTab} label="全部" />
        {ALL_MODES.map((m) => <TabBtn key={m} current={tab} value={m} onClick={setTab} label={MODE_LABEL[m]} />)}
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 py-16 text-center text-gray-500 text-sm">
          要去往 <span className="text-primary-600">Design</span> 开始创作，产品才会进入 Lookbook
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] border-collapse">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-200">
                {["预览", "产品", "季节", "品类", "面料", "目标价", "状态", "知识", "最近更新"].map((h) => (
                  <th key={h} className="px-3 py-2.5 font-medium text-[11px] uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} className="border-b border-gray-200 hover:bg-primary-50/40 cursor-pointer transition-colors"
                  onClick={() => setActiveProduct(p)}>
                  <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                    <StackedThumbs product={p} overrideUrl={p.imageUrl} />
                  </td>
                  <td className="px-3 py-3">
                    <div className="font-medium text-gray-900">{p.title || "(untitled)"}</div>
                    {p.description && <div className="text-[11px] text-gray-500 truncate max-w-[280px]">{p.description}</div>}
                  </td>
                  <td className="px-3 py-3">{p.seasons?.join(", ") || "—"}</td>
                  <td className="px-3 py-3">{p.category || "—"}</td>
                  <td className="px-3 py-3 max-w-[200px] truncate">{p.fabricComposition || "—"}</td>
                  <td className="px-3 py-3">{typeof p.targetPriceNum === "number" ? `¥${p.targetPriceNum}` : "—"}</td>
                  <td className="px-3 py-3"><StatusSelect product={p} onChange={(s) => changeStatus(p, s)} /></td>
                  <td className="px-3 py-3"><SkillsBadge productId={p.id} /></td>
                  <td className="px-3 py-3 text-gray-500 font-mono text-[11px]">{new Date(p.updatedAt).toLocaleDateString()}</td>
                  {/* ── 操作:编辑 / 删除 ── */}
                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => handleEdit(p, e)}
                        className="text-[11px] px-2 py-1 rounded-md text-primary-600 hover:bg-primary-50 transition-colors font-medium"
                        title="跳转单品设计工作台继续编辑"
                      >编辑</button>
                      {confirming === p.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            disabled={pending === p.id}
                            onClick={() => void doDelete(p.id)}
                            className="text-[11px] px-2 py-1 rounded-md bg-red-500 hover:bg-red-600 text-white font-medium disabled:opacity-50"
                          >{pending === p.id ? "删除中" : "确认"}</button>
                          <button onClick={() => setConfirming(null)} className="text-[11px] px-2 py-1 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50">取消</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirming(p.id)}
                          className="text-[11px] px-2 py-1 rounded-md text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                          title="删除该产品"
                        >删除</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeProduct && (
        <StageEditor
          product={activeProduct}
          onClose={() => setActiveProduct(null)}
          onSave={async (p) => { await store.upsertProduct(p); setActiveProduct(null); }}
        />
      )}
    </div>
  );
}

// ── 子组件 ───────────────────────────────────────────────────

/** 产品各工序对应色(从草稿灰→已上架绿) */
const STATUS_COLORS: Record<ProductStatus, { text: string; bg: string; border: string }> = {
  draft:        { text: "text-gray-600", bg: "bg-gray-100",   border: "border-gray-300" },
  submitted:    { text: "text-sky-700",   bg: "bg-sky-50",     border: "border-sky-300" },
  proto1:       { text: "text-amber-700", bg: "bg-amber-50",   border: "border-amber-300" },
  proto1_done:  { text: "text-amber-800", bg: "bg-amber-100",  border: "border-amber-400" },
  proto2:       { text: "text-orange-700",bg: "bg-orange-50",  border: "border-orange-300" },
  proto2_done:  { text: "text-orange-800",bg: "bg-orange-100", border: "border-orange-400" },
  bulk:         { text: "text-indigo-700",bg: "bg-indigo-50",  border: "border-indigo-300" },
  bulk_done:    { text: "text-indigo-800",bg: "bg-indigo-100", border: "border-indigo-400" },
  finished:     { text: "text-teal-700",  bg: "bg-teal-50",    border: "border-teal-300" },
  pending_list: { text: "text-violet-700",bg: "bg-violet-50",  border: "border-violet-300" },
  live:         { text: "text-green-700", bg: "bg-green-50",   border: "border-green-300" },
};

/** 图片堆叠错位预览:最多 4 张 + N 标记; overrideUrl(用户上传)优先级最高,作为生成图的替换覆盖 */
function StackedThumbs({ product, overrideUrl }: { product: Product; overrideUrl?: string }) {
  // 用户上传的替换图:单张铺满预览,标记"已替换"
  if (overrideUrl) {
    return (
      <div className="relative w-[72px] h-[72px]" title="已用上传图替换)">
        <img src={overrideUrl} alt="替换图" className="absolute inset-0 w-full h-full rounded-md border-2 border-white shadow-sm object-cover bg-gray-100" />
        <span className="absolute top-0 left-0 px-1 py-0.5 rounded-br-md bg-primary-500 text-white text-[8px] font-medium z-10">替换</span>
      </div>
    );
  }
  const imgs = (product.images ?? []).filter((im): im is typeof im & { url: string } => !!im.url);
  if (imgs.length === 0) {
    return product.html ? (
      <div className="relative w-[72px] h-[72px]">
        <iframe
          srcDoc={product.html}
          sandbox="allow-scripts"
          title="html-thumb"
          className="absolute inset-0 w-[288px] h-[288px]"
          style={{ transform: "scale(0.25)", transformOrigin: "top left", border: "none", pointerEvents: "none" }}
        />
      </div>
    ) : (
      <div className="w-[72px] h-[72px] rounded-md border border-dashed border-gray-200 bg-gray-50 flex items-center justify-center text-gray-300 text-xs">—</div>
    );
  }
  return (
    <div className="relative w-[72px] h-[72px]" title={`${imgs.length} 张图片`}>
      {imgs.slice(0, 4).map((im, i) => (
        <img
          key={im.slot + i}
          src={im.url}
          alt={im.label ?? `img-${i}`}
          loading="lazy"
          className="absolute w-[60px] h-[60px] rounded-md border-2 border-white shadow-sm object-cover bg-gray-100"
          style={{
            top: `${i * 3}px`,
            left: `${i * 3}px`,
            zIndex: imgs.length - i,
            transform: `rotate(${(i - 1) * 2}deg)`,
          }}
        />
      ))}
      {imgs.length > 4 && (
        <span className="absolute bottom-0 right-0 px-1 py-0.5 rounded-md bg-gray-800/80 text-white text-[9px] font-medium z-10">
          +{imgs.length}
        </span>
      )}
    </div>
  );
}

function TabBtn({ current, value, onClick, label }: { current: TabKey; value: TabKey; onClick: (v: TabKey) => void; label: string }) {
  return (
    <button onClick={() => onClick(value)}
      className={`px-4 py-2 transition-colors ${current === value ? "bg-primary-500 text-white" : "bg-white text-gray-700 hover:bg-primary-50"}`}>
      {label}
    </button>
  );
}

function StatusSelect({ product, onChange }: { product: Product; onChange: (s: ProductStatus) => void }) {
  const c = STATUS_COLORS[product.status] ?? STATUS_COLORS.draft;
  return (
    <select
      value={product.status}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onChange(e.target.value as ProductStatus)}
      className={`text-[12px] px-2 py-1 rounded-lg border ${c.bg} ${c.text} ${c.border} focus:outline-none focus:border-primary-500 max-w-[150px]`}
      title="点击切换工序状态"
    >
      {STATUS_FLOW.map((s) => (
        <option key={s} value={s}>{STATUS_LABEL[s]}</option>
      ))}
    </select>
  );
}

function SkillsBadge({ productId }: { productId: string }) {
  const skills = useSkillStore();
  const n = skills.articles.filter((a) => (a.relatedProducts ?? []).includes(productId)).length;
  if (n === 0) return <span className="text-[11px] text-gray-400">—</span>;
  return <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary-100 text-primary-600">ⓢ {n}</span>;
}

// ── 详情弹窗 ──────────────────────────────────────────────────

function StageEditor({ product, onClose, onSave }: { product: Product; onClose: () => void; onSave: (p: Product) => Promise<void> }) {
  const target = nextStatus(product.status);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [replacingSlot, setReplacingSlot] = useState<string | null>(null);

  // 本地上传替换 slot 对应的那张图(线稿/效果图单张替换)
  async function replaceSlotImage(slot: string, file: File) {
    if (!teamId) return;
    setReplacingSlot(slot);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("slot", slot);
      const updated = await teamApi(teamId).uploadProductImage(product.id, fd);
      await onSave(updated);
    } finally { setReplacingSlot(null); }
  }

  const productImages = (product.images ?? []).filter((im) => im.url);
  const hasHtml = !!product.html;

  async function advance() {
    if (!target) return;
    setSubmitting(true);
    try {
      const now = new Date().toISOString();
      const entry = { id: crypto.randomUUID(), status: target, at: now, actor: "atelier", note: note.trim() || undefined };
      const updated = { ...product, status: target, statusHistory: [...(product.statusHistory || []), entry], updatedAt: now };
      await onSave(updated);
    } finally { setSubmitting(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-3xl border border-gray-200 bg-white p-7 shadow-xl max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <header className="mb-5 flex items-start justify-between">
          <div>
            <h2 className="text-[26px] font-medium text-gray-900">{product.title || "(untitled)"}</h2>
            <p className="text-[11px] text-gray-500 font-mono mt-1">{product.id}</p>
          </div>
          <button onClick={onClose} className="text-xl text-gray-400 hover:text-gray-800">×</button>
        </header>

        {/* 设计工作流生成的图片 / 插画 HTML */}
        {(productImages.length > 0 || hasHtml) && (
          <div className="mb-5">
            <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">
              {hasHtml ? "插画 HTML 画布" : `设计图 (${productImages.length})`}
            </div>
            {hasHtml ? (
              <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
                <iframe
                  srcDoc={product.html!}
                  sandbox="allow-scripts"
                  title="插画 HTML 画布"
                  className="w-full bg-white"
                  style={{ aspectRatio: "1 / 1", border: "none" }}
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {productImages.map((im) => {
                  const zoom = im.slot === "editorial" || im.slot === "hero-editorial" ? 1.8 : 2.5;
                  const busy = replacingSlot === im.slot;
                  return (
                    <figure key={im.slot} className="rounded-xl border border-gray-200 overflow-hidden bg-gray-50">
                      <div className="aspect-[1/1] bg-gray-100 overflow-hidden">
                        <HoverZoomImg src={im.url} alt={im.label} zoom={zoom} />
                      </div>
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

        <div className="mb-5">
          <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">工序时间线</div>
          <ol className="space-y-2 max-h-32 overflow-y-auto pr-2">
            {(product.statusHistory || []).length === 0 && (
              <li className="text-[12px] text-gray-500">尚无工序记录</li>
            )}
            {(product.statusHistory || []).concat(
              (product.statusHistory || []).length === 0 ? [{ id: "init", status: "draft" as ProductStatus, at: product.createdAt, actor: "atelier" }] : []
            ).sort((a, b) => a.at.localeCompare(b.at)).map((e) => (
              <li key={e.id} className="text-[12px] flex items-baseline gap-3">
                <span className="font-mono text-[10px] text-gray-500 w-36">{new Date(e.at).toLocaleString()}</span>
                <span className={`px-2 py-0.5 rounded-full border ${e.status === product.status ? "bg-gray-800 border-gray-800 text-white" : "bg-gray-50 border-gray-200 text-gray-600"}`}>
                  {STATUS_LABEL[e.status]}
                </span>
                {e.note && <span className="text-gray-600">{e.note}</span>}
              </li>
            ))}
          </ol>
        </div>

        <DesignSections product={product} />

        <section className="grid grid-cols-2 gap-x-6 gap-y-3 text-[12px] border-t border-gray-200 pt-4 mb-5">
          <Detail k="季节" v={product.seasons?.join(", ")} />
          <Detail k="品类" v={product.category} />
          <Detail k="面料" v={product.fabricComposition || "—"} />
          <Detail k="目标价" v={typeof product.targetPriceNum === "number" ? `¥${product.targetPriceNum}` : product.sections?.targetPrice || "—"} />
          <Detail k="颜色" v={product.colors?.join(", ")} />
          <Detail k="版型" v={product.silhouette} />
          <Detail k="工艺" v={product.stitchNotes} />
        </section>

        {target ? (
          <div className="border-t border-gray-200 pt-5">
            <div className="text-[11px] text-gray-500 mb-1.5">推进至下工序:</div>
            <div className="flex items-center gap-3 mb-3">
              <span className="bg-gray-800 text-white px-2 py-1 rounded-full text-[11px]">{STATUS_LABEL[product.status]}</span>
              <span className="text-gray-500">→</span>
              <span className="bg-primary-500 text-white px-2 py-1 rounded-full text-[11px]">{STATUS_LABEL[target]}</span>
            </div>
            <textarea value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="(可选) 批注 · 工厂 / 成本 / 样品反馈 …" rows={3}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:border-primary-500" />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={onClose} className="rounded-xl border border-gray-200 text-gray-700 font-medium py-2 px-4 text-sm hover:border-gray-800">关闭</button>
              <button disabled={submitting} onClick={advance}
                className="rounded-xl bg-primary-500 hover:bg-primary-600 text-white font-medium py-2.5 px-5 text-sm transition-colors disabled:opacity-50">
                确认推进 → {STATUS_LABEL[target]}
              </button>
            </div>
          </div>
        ) : (
          <div className="border-t border-gray-200 pt-5 text-primary-600 text-[13px]">✓ 产品已上架,流水完成</div>
        )}
      </div>
    </div>
  );
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

function DesignSections({ product }: { product: Product }) {
  const s = product.sections;
  if (!s) return null;
  const hasAny = s.productName || s.themeNarrative || s.inspirationRefs?.length || s.colorway?.length || s.fabric?.length || s.silhouette || s.targetPrice;
  if (!hasAny) return null;

  return (
    <section className="mb-5 space-y-4">
      <div className="text-[10px] uppercase tracking-wider text-gray-500">设计提案</div>

      {s.productName && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-gray-500">产品名</div>
          <div className="text-[18px] font-semibold text-gray-900 leading-snug">{s.productName}</div>
        </div>
      )}

      {s.themeNarrative && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-gray-500">主题叙述</div>
          <div className="text-[13px] text-gray-700 leading-relaxed whitespace-pre-wrap">{s.themeNarrative}</div>
        </div>
      )}

      {s.inspirationRefs && s.inspirationRefs.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">灵感借鉴</div>
          <div className="space-y-1.5">
            {s.inspirationRefs.map((r) => (
              <div key={r.id} className="text-[12px] text-gray-700 flex items-start gap-2">
                <span className="shrink-0 px-1.5 py-0.5 rounded bg-primary-50 text-primary-600 font-mono text-[10px]">#{r.id.slice(0, 8)}</span>
                <span>
                  {r.category && <span className="text-gray-500 mr-1.5">{r.category}</span>}
                  {r.summary && <span className="text-gray-600">{r.summary}</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {s.colorway?.map((cw, i) => (
        <div key={i}>
          <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">
            材质与色彩方案{cw.pantone ? ` · ${cw.pantone}` : ""}
          </div>
          {cw.hex?.length > 0 && (
            <div className="flex gap-1.5 mb-2">
              {cw.hex.map((c) => (
                <div key={c} className="flex flex-col items-center gap-0.5" title={c}>
                  <div className="w-7 h-7 rounded-md border border-gray-200" style={{ backgroundColor: c }} />
                  <span className="text-[9px] text-gray-500 font-mono">{c}</span>
                </div>
              ))}
            </div>
          )}
          {cw.description && <div className="text-[12px] text-gray-700 leading-relaxed whitespace-pre-wrap">{cw.description}</div>}
        </div>
      ))}

      {s.fabric && s.fabric.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">材质</div>
          <ul className="text-[12px] text-gray-700 space-y-0.5">
            {s.fabric.map((f, i) => (
              <li key={i}>
                <span className="font-medium">{f.name}</span>
                {f.composition && <span className="text-gray-500 ml-1.5">· {f.composition}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {s.silhouette && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-gray-500">形态 / 结构 / 细节</div>
          <div className="text-[12px] text-gray-700 leading-relaxed whitespace-pre-wrap">{s.silhouette}</div>
        </div>
      )}

      {s.targetPrice && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-gray-500">目标价格带</div>
          <div className="text-[12px] text-gray-700">{s.targetPrice}</div>
        </div>
      )}

      {s.rawPlan && s.rawPlan.length > 30 && (
        <details className="group" open={false}>
          <summary className="cursor-pointer text-[11px] text-primary-600 hover:text-primary-700 select-none">查看完整方案 ▾</summary>
          <div className="mt-2 rounded-xl border border-gray-200 p-4 bg-gray-50 max-h-72 overflow-y-auto">
            <Markdown source={s.rawPlan} />
          </div>
        </details>
      )}
    </section>
  );
}

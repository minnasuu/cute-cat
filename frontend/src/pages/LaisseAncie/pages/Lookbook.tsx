// @ts-nocheck
/**
 * Lookbook —— 款式总览。
 *
 * 表格列:预览(堆叠缩略图) / 产品 / 季节 / 品类 / 面料 / 目标价 / 状态(下拉编辑) / 知识 / 最近更新 / 操作。
 *  - 预览列:所有图片堆叠错位展示 + N 标记;
 *  - 状态列:下拉 select,直接调 advance 接口推进 / 回退工序;
 *  - 操作列:「编辑」→ 跳转单品设计工作台(携带产品上下文) / 「删除」行内确认。
 *  - 点击行 / 卡片 → 详情弹窗(含结构化方案、色块、灵感引用、工序时间线、推进按钮、编辑入口)。
 *  - 头部「+ 录入产品」→ 手动完整字段录入弹窗(view / edit / create 三态)。
 */
import { useMemo, useState } from "react";
import { useDesignStore } from "../store/design";
import { useSkillStore } from "../store/skill";
import { useCurrentTeam } from "../../../contexts/CurrentTeamContext";
import { useEditingProduct } from "../contexts/editing-product";
import { teamApi } from "../lib/api";
import { ProductFormModal } from "../components/ProductFormModal";
import { MODE_LABEL, STATUS_FLOW, STATUS_LABEL, type Product, type ProductStatus } from "../types/design";

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

// 展示给用户的 Lookbook 创作模式 tab,与当前可用的设计工作台 tab 一致(系列已下线,仅「全部」中能看到历史系列数据)。
const ALL_MODES = ["illustration", "single", "material-combo", "occasion"] as const;
type TabKey = "illustration" | "single" | "material-combo" | "occasion" | "all";
type ViewMode = "table" | "card";

function nextStatus(s: ProductStatus): ProductStatus | null {
  const i = STATUS_FLOW.indexOf(s);
  return i === -1 || i >= STATUS_FLOW.length - 1 ? null : STATUS_FLOW[i + 1]!;
}

/** 选卡片封面:优先「效果图」类 slot(跳过线稿),回退到 imageUrl 兜底 */
function pickCover(product: Product): string | null {
  const imgs = (product.images ?? []).filter((im) => im.url);
  if (!imgs.length) return product.imageUrl ?? null;
  const renderSlots = ["editorial", "flat", "single", "material-combo", "collection", "illustration", "hero-editorial", "detail", "final"];
  for (const slot of renderSlots) {
    const found = imgs.find((im) => im.slot === slot);
    if (found) return found.url;
  }
  return imgs[0]?.url ?? product.imageUrl ?? null;
}

/** 卡片视图的单张卡片:效果图作封面 + 标题文字 + 点击打开详情弹窗 */
function CardItem({ product, cover, onClick }: { product: Product; cover: string | null; onClick: () => void }) {
  return (
    <div onClick={onClick} className="group cursor-pointer rounded-2xl border border-gray-200 bg-white overflow-hidden hover:shadow-lg hover:border-primary-300 transition-all">
      <div className="relative aspect-[1/1] bg-gray-100 overflow-hidden">
        {cover
          ? <img src={cover} alt={product.title} className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300" loading="lazy" />
          : <div className="w-full h-full flex items-center justify-center text-[12px] text-gray-400">暂无图片</div>}
      </div>
      <div className="px-3 py-2.5">
        <div className="text-[13px] font-medium text-gray-900 truncate">{product.title || "(untitled)"}</div>
        {product.category && <div className="text-[11px] text-gray-500 truncate mt-0.5">{product.category}</div>}
      </div>
    </div>
  );
}

export default function LookbookPage() {
  const { teamId, navigateTab } = useCurrentTeam();
  const store = useDesignStore();
  const [tab, setTab] = useState<TabKey>("all");
  const [view, setView] = useState<ViewMode>("card");
  const [statusFilter, setStatusFilter] = useState<ProductStatus | "all">("all");
  // 产品详情/编辑/新增三态弹窗:create | view.p | edit.p
  const [editor, setEditor] = useState<null | { mode: "create" } | { mode: "view" | "edit"; product: Product }>(null);
  const { confirming, setConfirming, pending, doDelete } = useRowDelete();
  const { setEditingProduct } = useEditingProduct();

  const items = useMemo(() => {
    let r = store.products;
    if (tab !== "all") r = r.filter((p) => p.mode === tab);
    if (statusFilter !== "all") r = r.filter((p) => p.status === statusFilter);
    return r;
  }, [store.products, tab, statusFilter]);

  // 行内切换状态(自由切换到任意工序),成功后刷新列表并同步弹窗
  async function changeStatus(p: Product, status: ProductStatus) {
    if (status === p.status) return;
    if (!teamId) return;
    const updated = await teamApi(teamId).setProductStatus(p.id, { status });
    await store.refresh();
    setEditor((prev) => (prev && "product" in prev && prev.product.id === p.id ? { ...prev, product: updated } : prev));
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
          <p className="text-sm text-gray-500 mt-1">款式总览 — 按创作模式与工序筛选 · 下发推进工序 · 点击行编辑详情</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">
            {items.length === store.products.length ? `${items.length} items` : `${items.length} / ${store.products.length}`}
          </span>
          <button onClick={() => setEditor({ mode: "create" })}
            className="text-[12px] bg-primary-500 hover:bg-primary-600 text-white px-3 py-1.5 rounded-xl font-medium transition-colors">
            + 录入产品
          </button>
        </div>
      </header>
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="inline-flex rounded-2xl border border-gray-200 overflow-hidden text-sm">
          <TabBtn current={tab} value="all" onClick={setTab} label="全部" />
          {ALL_MODES.map((m) => <TabBtn key={m} current={tab} value={m} onClick={setTab} label={MODE_LABEL[m]} />)}
        </div>
        <div className="flex items-center gap-3">
          {/* 工序状态筛选 */}
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as ProductStatus | "all")}
            className="text-[12px] border border-gray-200 rounded-xl px-3 py-1.5 bg-white text-gray-600 focus:outline-none focus:border-primary-500"
            title="按工序状态筛选">
            <option value="all">全部状态</option>
            {STATUS_FLOW.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
          <div className="inline-flex rounded-xl border border-gray-200 overflow-hidden text-[12px]">
            <button onClick={() => setView("table")}
              className={`px-3 py-1.5 transition-colors ${view === "table" ? "bg-primary-500 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
              title="表格视图">☰ 表格</button>
            <button onClick={() => setView("card")}
              className={`px-3 py-1.5 transition-colors border-l border-gray-200 ${view === "card" ? "bg-primary-500 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
              title="卡片视图">▦ 卡片</button>
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 py-16 text-center text-gray-500 text-sm space-y-2">
          {store.products.length === 0 ? (
            <>要去往 <span className="text-primary-600">Design</span> 开始创作，或点击「录入产品」，产品才会进入 Lookbook</>
          ) : (
            <>没有符合「{tab === "all" ? "" : MODE_LABEL[tab] + " / "}{statusFilter === "all" ? "" : STATUS_LABEL[statusFilter]}」的产品</>
          )}
          {(tab !== "all" || statusFilter !== "all") && (
            <div>
              <button onClick={() => { setTab("all"); setStatusFilter("all"); }}
                className="text-primary-600 hover:underline text-[13px]">清除筛选</button>
            </div>
          )}
        </div>
      ) : view === "card" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {items.map((p) => (
            <CardItem key={p.id} product={p} cover={pickCover(p)}
              onClick={() => setEditor({ mode: "view", product: p })} onDelete={() => setConfirming(p.id)} />
          ))}
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
                  onClick={() => setEditor({ mode: "view", product: p })}>
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

      <ProductFormModal
        state={editor}
        onClose={() => setEditor(null)}
        onSaved={async () => { await store.refresh(); setEditor(null); }}
        onRequestEdit={(p) => setEditor({ mode: "edit", product: p })}
      />
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


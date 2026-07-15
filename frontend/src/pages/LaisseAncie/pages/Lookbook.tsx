// @ts-nocheck
/**
 * Lookbook —— 款式总览。
 *
 * 表格列:图片叠放缩略图 / 产品名称 / 价格 / 状态 / 最近更新 / 备注信息 / 操作。
 * 状态列:自定义彩色药丸选择器,每种状态可独立配置颜色与标签。
 */
import { useMemo, useState } from "react";
import { useDesignStore } from "../store/design";
import { useCurrentTeam } from "../../../contexts/CurrentTeamContext";
import { useEditingProduct } from "../contexts/editing-product";
import { teamApi } from "../lib/api";
import { ProductFormModal } from "../components/ProductFormModal";
import { MODE_LABEL, STATUS_LABEL, type Product, type ProductStatus } from "../types/design";
import { MAIN_SLOT, slotRole } from "../lib/imageRole";
import { StatusPicker, StatusConfigModal, useStatusConfig, type StatusDef } from "../components/StatusPicker";
import { showToast } from "../../../components/Toast";

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
const ALL_MODES = ["illustration", "single", "material-combo", "style-mutate", "occasion"] as const;
type TabKey = "illustration" | "single" | "material-combo" | "style-mutate" | "occasion" | "all";
type ViewMode = "table" | "card";

/**
 * 选卡片封面:主图 > 效果图(优先 editorial/flat/material-combo 等,跳过线稿) > 第一张 > null。
 * 合并 images[] + 遗留 imageUrl(兼容未迁移数据)。
 */
function pickCover(product: Product): string | null {
  const imgs = (product.images ?? []).filter((im) => im.url);
  const legacyMain = !imgs.some((im) => im.slot === MAIN_SLOT) && product.imageUrl
    ? [{ slot: MAIN_SLOT, label: "主图", url: product.imageUrl }, ...imgs]
    : imgs;
  const main = legacyMain.find((im) => im.slot === MAIN_SLOT);
  if (main) return main.url;
  const render = legacyMain
    .filter((im) => slotRole(im.slot) === "render")
    .sort((a, b) => {
      const order = ["editorial", "flat", "single", "material-combo", "style-mutate", "collection", "illustration", "hero-editorial", "detail", "final"];
      return order.indexOf(a.slot) - order.indexOf(b.slot);
    })[0];
  if (render) return render.url;
  return legacyMain[0]?.url ?? null;
}

/** 卡片视图的单张卡片:效果图作封面 + 标题文字 + 点击打开详情弹窗 + 下载原图 */
function CardItem({ product, cover, onClick, onDownload }: { product: Product; cover: string | null; onClick: () => void; onDownload?: () => void }) {
  return (
    <div onClick={onClick} className="group cursor-pointer rounded-2xl border border-gray-200 bg-white overflow-hidden hover:shadow-lg hover:border-primary-300 transition-all">
      <div className="relative aspect-[1/1] bg-gray-100 overflow-hidden">
        {cover
          ? <img src={cover} alt={product.title} className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300" loading="lazy" />
          : <div className="w-full h-full flex items-center justify-center text-[12px] text-gray-400">暂无图片</div>}
      </div>
      <div className="relative flex-1">
        <div className="px-3 py-2.5">
          <div className="text-[13px] font-medium text-gray-900 truncate">{product.title || "（未命名）"}</div>
          {product.category && <div className="text-[11px] text-gray-500 truncate mt-0.5">{product.category}</div>}
        </div>
        {/* 卡片底部右侧:红色价格 + 下载原图 */}
        <div className="flex items-center justify-end gap-2 px-3 pb-2">
          {typeof product.targetPriceNum === "number" && (
            <span className="text-[13px] font-bold text-red-500">¥{product.targetPriceNum}</span>
          )}
          {onDownload && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDownload(); }}
              className="text-[11px] text-primary-600 hover:text-primary-700 hover:underline"
              title="下载 AI 生成的原图"
            >下载原图</button>
          )}
        </div>
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
  const { statuses: statusConfig, save: saveStatusConfig } = useStatusConfig();
  const [configOpen, setConfigOpen] = useState(false);

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
    try {
      const updated = await teamApi(teamId).setProductStatus(p.id, { status });
      await store.refresh();
      setEditor((prev) => (prev && "product" in prev && prev.product.id === p.id ? { ...prev, product: updated } : prev));
    } catch (err: any) {
      showToast(err?.message || "更新状态失败", "error");
    }
  }

  /** 编辑:把产品塞入编辑上下文 + 跳转单品设计工作台 */
  function handleEdit(p: Product, e: React.MouseEvent) {
    e.stopPropagation();
    setEditingProduct(p);
    navigateTab("single");
  }

  /** 取产品可用的第一张 AI 原图 URL(无则退回压缩主图) */
  function getOriginalUrl(p: Product): string | null {
    const orig = (p.images ?? []).find((im) => im.originalUrl);
    if (orig?.originalUrl) return orig.originalUrl;
    // 回退:取任意一张图(URL 本身,压缩图也算兜底)
    return p.images?.find((im) => im.url)?.url ?? p.imageUrl ?? null;
  }

  /** 下载原图:先取原图 URL,否则取压缩图;新窗口打开 */
  function handleDownload(p: Product, e?: React.MouseEvent) {
    e?.stopPropagation();
    const url = getOriginalUrl(p);
    if (!url) { showToast("该产品暂无可下载的图片", "warning"); return; }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">
      <header className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-[32px] font-semibold text-text-primary tracking-tight">Lookbook</h1>
          <p className="text-sm text-text-tertiary mt-1">款式总览 — 按创作模式与工序筛选 · 点击行编辑详情</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-text-tertiary">
            {items.length === store.products.length ? `${items.length} 款产品` : `${items.length} / ${store.products.length}`}
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
          <StatusFilter value={statusFilter} onChange={setStatusFilter} statuses={statusConfig} />
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
            <>没有符合「{tab === "all" ? "" : MODE_LABEL[tab] + " / "}{statusFilter === "all" ? "" : statusConfig.find((s) => s.id === statusFilter)?.label || STATUS_LABEL[statusFilter]}」的产品</>
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
              onClick={() => setEditor({ mode: "view", product: p })} onDelete={() => setConfirming(p.id)}
              onDownload={() => handleDownload(p)} />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] border-collapse">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-200">
                {["预览", "产品名称", "价格", "状态", "最近更新", "备注信息", "操作"].map((h) => (
                  <th key={h} className="px-3 py-2.5 font-medium text-[11px] uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} className="border-b border-gray-200 hover:bg-primary-50/40 cursor-pointer transition-colors"
                  onClick={() => setEditor({ mode: "view", product: p })}>
                  <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                    <StackedThumbs product={p} />
                  </td>
                  <td className="px-3 py-3">
                    <div className="font-medium text-gray-900">{p.title || "（未命名）"}</div>
                    {p.category && <div className="text-[11px] text-gray-500 truncate max-w-[160px]">{p.category}</div>}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {typeof p.targetPriceNum === "number"
                      ? <span className="font-bold text-red-500">¥{p.targetPriceNum}</span>
                      : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    <StatusPicker
                      value={p.status}
                      onChange={(s) => changeStatus(p, s as ProductStatus)}
                      statuses={statusConfig}
                      onOpenConfig={() => setConfigOpen(true)}
                    />
                  </td>
                  <td className="px-3 py-3 text-gray-500 font-mono text-[11px] whitespace-nowrap">{new Date(p.updatedAt).toLocaleDateString()}</td>
                  <td className="px-3 py-3 max-w-[200px] truncate text-gray-500">{p.description || p.stitchNotes || "—"}</td>
                  {/* ── 操作:编辑 / 删除 ── */}
                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => handleEdit(p, e)}
                        className="text-[11px] px-2 py-1 rounded-md text-primary-600 hover:bg-primary-50 transition-colors font-medium"
                        title="跳转单品设计工作台继续编辑"
                      >编辑</button>
                      <button
                        onClick={(e) => handleDownload(p, e)}
                        className="text-[11px] px-2 py-1 rounded-md text-gray-500 hover:bg-gray-100 transition-colors"
                        title="下载 AI 生成的原图"
                      >下载原图</button>
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

      {/* 状态配置弹窗 */}
      <StatusConfigModal
        open={configOpen}
        onClose={() => setConfigOpen(false)}
        statuses={statusConfig}
        onSave={saveStatusConfig}
      />
    </div>
  );
}

// ── 子组件 ───────────────────────────────────────────────────

/** 状态列筛选下拉(借用 StatusPicker 的配置入口思路,简化为文字下拉) */
function StatusFilter({
  value, onChange, statuses,
}: {
  value: ProductStatus | "all";
  onChange: (v: ProductStatus | "all") => void;
  statuses: StatusDef[];
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as ProductStatus | "all")}
      className="text-[12px] border border-gray-200 rounded-xl px-3 py-1.5 bg-white text-gray-600 focus:outline-none focus:border-primary-500"
      title="按工序状态筛选">
      <option value="all">全部状态</option>
      {statuses.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
    </select>
  );
}

/** 图片堆叠错位预览:最多 4 张 + N 标记; overrideUrl(用户上传)优先级最高,作为生成图的替换覆盖 */
function StackedThumbs({ product }: { product: Product }) {
  const raw = (product.images ?? []).filter((im): im is typeof im & { url: string } => !!im.url);
  if (!raw.some((im) => im.slot === MAIN_SLOT) && product.imageUrl) {
    raw.unshift({ slot: MAIN_SLOT, label: "主图", url: product.imageUrl });
  }
  const imgs = [
    ...raw.filter((im) => im.slot === MAIN_SLOT),
    ...raw.filter((im) => slotRole(im.slot) === "render"),
    ...raw.filter((im) => im.slot !== MAIN_SLOT && slotRole(im.slot) !== "render"),
  ];
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


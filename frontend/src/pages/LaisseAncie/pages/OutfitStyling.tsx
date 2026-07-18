/**
 * OutfitStyling ——「穿搭效果」工作台。
 *
 * 输入:从 Lookbook 选 1-5 款单品(每款取其封面效果图)+ 从品牌/系统模特库选 1 张模特图
 * → 1 张模特穿搭效果图(将所选单品搭配穿在模特身上)。
 *
 * 直接用库图已有的 URL 作为多图参考(模特图 + 单品图),无需重新上传文件。
 * 后端异步批次 + 前端轮询:提交后 202 立即返回,fire-and-forget 后台生成。
 *
 * 生图协议与材料组合/款式裂变一致:POST→202→轮询→失败可重试→保存 Lookbook。
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { useCurrentTeam } from "../../../contexts/CurrentTeamContext";
import { teamApi } from "../lib/api";
import type { OutfitStylingBatch } from "../lib/api";
import { useDesignStore } from "../store/design";
import { useResourceStore } from "../store/resource";
import { useAuth } from "../../../contexts/AuthContext";
import { GenerateButton, AI_COST_PER_IMAGE } from "../../../components/GenerateButton";
import { Modal } from "../components/ui";
import { pickProductCover } from "../lib/product-cover";
import type { KnowledgeDeps } from "../../DashboardPage/knowledge-injectors";
import type { Product } from "../types/design";
import type { ModelRow } from "../types/design";

const MAX_PRODUCTS = 5;
const POLL_MS = 3000;
// 对齐后端 OS_BATCH_TTL_MS = 15min,略小于 TTL 避免与清理竞争
const POLL_MAX_ATTEMPTS = 290;

interface Props {
  knowledge?: KnowledgeDeps;
  brandLoading?: boolean;
  knowledgeLoading?: boolean;
}

export default function OutfitStylingPage({ knowledge, brandLoading, knowledgeLoading }: Props) {
  const { teamId, navigateTab } = useCurrentTeam();
  const { user } = useAuth();
  const store = useDesignStore();
  const resourceStore = useResourceStore();

  // ── 输入状态 ──
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<Product[]>([]);
  // 选中的模特 = 模特记录 + 用户选中的那张图
  const [selectedModel, setSelectedModel] = useState<{ model: ModelRow; imageUrl: string } | null>(null);
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);

  // ── 批次状态 ──
  const [batch, setBatch] = useState<OutfitStylingBatch | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollAttempts = useRef(0);

  // ── 派生态 ──
  const batchRunningOrAnalyzing = !!batch && batch.status === "running";
  const batchDone = !!batch && batch.status === "done";
  const hasSuccess = !!batch && batch.completed > 0;
  const canSubmit = !!name.trim()
    && selectedProducts.length >= 1 && selectedProducts.length <= MAX_PRODUCTS
    && !!selectedModel
    && !batchRunningOrAnalyzing && !submitting
    && !brandLoading && !knowledgeLoading;

  // ── 轮询启停 ──
  const stopPolling = useCallback(() => {
    if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null; }
  }, []);

  const startPolling = useCallback((batchId: string) => {
    if (!teamId) return;
    stopPolling();
    pollAttempts.current = 0;
    pollTimer.current = setInterval(async () => {
      pollAttempts.current += 1;
      if (pollAttempts.current > POLL_MAX_ATTEMPTS) {
        setBatch((b) => b ? {
          ...b,
          status: "done",
          items: b.items.map((it) => it.status === "pending" ? { ...it, status: "error", error: "生成超时,可重试" } : it),
        } : b);
        stopPolling();
        return;
      }
      try {
        const url = teamApi(teamId).outfitStylingBatchUrl(batchId);
        const res = await fetch(url, { credentials: "include" });
        if (res.status === 404) { setError("批次已过期,请重新生成"); setBatch(null); stopPolling(); return; }
        if (!res.ok) return;
        const data: OutfitStylingBatch = await res.json();
        setBatch(data);
        if (data.status === "done") stopPolling();
      } catch { /* 网络错误继续 */ }
    }, POLL_MS);
  }, [teamId, stopPolling]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  // 选区变化 → 清空旧批次
  useEffect(() => {
    setBatch(null);
    stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProducts.length, selectedModel]);

  // ── 提交 ──
  async function submit() {
    if (!canSubmit || !teamId) return;
    setSubmitting(true);
    setError(null);
    setBatch(null);
    stopPolling();
    try {
      const products = selectedProducts.map((p) => ({
        id: p.id,
        title: p.title || "单品",
        url: pickProductCover(p) || p.imageUrl || "",
      }));
      const modelPayload = {
        id: selectedModel!.model.id,
        name: selectedModel!.model.name,
        url: selectedModel!.imageUrl,
        height: selectedModel!.model.height ?? null,
        bust: selectedModel!.model.bust ?? null,
        waist: selectedModel!.model.waist ?? null,
        hip: selectedModel!.model.hip ?? null,
        shoes: selectedModel!.model.shoes ?? null,
      };
      const res = await fetch(teamApi(teamId).outfitStylingUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: name.trim(), description: description.trim(), products, model: modelPayload }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`请求失败 (HTTP ${res.status})${t ? `: ${t.slice(0, 120)}` : ""}`);
      }
      const data: OutfitStylingBatch = await res.json();
      setBatch(data);
      if (data.status === "running" && data.batchId) startPolling(data.batchId);
    } catch (e: any) {
      setError(e?.message || "提交失败,请重试");
    } finally {
      setSubmitting(false);
    }
  }

  // ── 单图重试 ──
  async function retry() {
    if (!batch || !teamId) return;
    setBatch((b) => b ? { ...b, status: "running", items: b.items.map((it) => ({ ...it, status: "pending", error: undefined })) } : b);
    try {
      const url = teamApi(teamId).outfitStylingRegenerateUrl(batch.batchId);
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({}) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      startPolling(batch.batchId);
    } catch (e: any) {
      setBatch((b) => b ? { ...b, status: "error", items: b.items.map((it) => ({ ...it, status: "error", error: e?.message || "重试失败" })) } : b);
    }
  }

  // ── 保存到 Lookbook ──
  async function saveToLookbook() {
    if (!batch) return;
    const doneItem = batch.items.find((it) => it.status === "done" && it.url);
    if (!doneItem) { setError("暂无成功生成的图片"); return; }
    const now = new Date().toISOString();
    const brandColors = (knowledge?.brand?.colors || []).map((c: any) => c?.bg || c).filter(Boolean);
    const productTitles = (batch.products || []).map((p) => p.title).filter(Boolean).join(" + ");
    const product = {
      id: crypto.randomUUID(),
      mode: "outfit-styling" as const,
      title: name || "未命名穿搭",
      description: description.trim() || "",
      seasons: [],
      category: "穿搭",
      colors: brandColors,
      images: [{ slot: "outfit-styling", label: productTitles ? `穿搭（${productTitles}）` : "穿搭效果", url: doneItem.url ?? "" }],
      aiDraftRaw: JSON.stringify({ batchId: batch.batchId, name, description, products: batch.products, model: batch.model }),
      status: "draft" as const,
      statusHistory: [{ id: crypto.randomUUID(), status: "draft" as const, at: now, actor: "atelier" }],
      createdAt: now,
      updatedAt: now,
    };
    try {
      await store.upsertProduct(product);
      stopPolling();
      setBatch(null);
      setSubmitting(false);
      navigateTab("lookbook");
    } catch (e: any) {
      setError(`保存失败: ${e?.message || ""}`);
    }
  }

  const inputCls = "w-full text-[12px] border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-primary-500 bg-white";
  const labelCls = "text-[10px] uppercase tracking-wider text-gray-500 mb-1 block";

  const cell = batch?.items?.[0] || null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr] h-[calc(100vh-64px)] min-h-0">
      {/* 左:表单 */}
      <div className="flex flex-col bg-white min-h-0">
        <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-gray-200 px-5 py-3 shrink-0">
          <h1 className="text-[15px] font-medium text-gray-800 min-h-7 flex items-center gap-2">穿搭效果</h1>
          <span className="text-[10px] text-gray-500">从 Lookbook 选 1-5 款单品 + 选 1 张模特图 → 生成模特穿搭效果图</span>
        </header>

        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="p-5 space-y-5 max-w-2xl">
            {/* 名称 */}
            <div>
              <label className={labelCls}>名称 <span className="text-red-500">*</span></label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="如:春日都市通勤穿搭" className={inputCls} />
            </div>

            {/* 单品选择 */}
            <div>
              <label className={labelCls}>
                单品(Lookbook) <span className="text-gray-400 normal-case tracking-normal">({selectedProducts.length}/{MAX_PRODUCTS})</span> <span className="text-red-500">*</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {selectedProducts.map((p) => (
                  <div key={p.id} className="w-24 rounded-lg border border-gray-200 bg-gray-50 overflow-hidden relative group">
                    {pickProductCover(p) ? (
                      <img src={pickProductCover(p)!} alt={p.title} className="w-24 h-28 object-cover" />
                    ) : (
                      <div className="w-24 h-28 flex items-center justify-center text-[10px] text-gray-300">无图</div>
                    )}
                    {!batchRunningOrAnalyzing && (
                      <button onClick={() => setSelectedProducts((prev) => prev.filter((x) => x.id !== p.id))}
                        className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/50 text-white text-[10px] opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                    )}
                    <div className="px-1 py-0.5 text-[8px] text-gray-400 truncate" title={p.title}>{p.title || "未命名"}</div>
                  </div>
                ))}
                {selectedProducts.length < MAX_PRODUCTS && !batchRunningOrAnalyzing && (
                  <button onClick={() => setProductPickerOpen(true)}
                    className="w-24 h-[7.5rem] rounded-lg border border-dashed border-gray-300 bg-gray-50 flex flex-col items-center justify-center cursor-pointer hover:border-primary-400 transition-colors shrink-0">
                    <span className="text-lg text-gray-400">+</span>
                    <span className="text-[10px] text-gray-400">添加单品</span>
                  </button>
                )}
              </div>
              <span className="text-[10px] text-gray-400">从 Lookbook 已生成的效果图中选择,最多 {MAX_PRODUCTS} 款</span>
            </div>

            {/* 模特选择 */}
            <div>
              <label className={labelCls}>
                模特(品牌库 + 系统库) <span className="text-red-500">*</span>
              </label>
              {selectedModel ? (
                <div className="relative inline-block group">
                  <div className="w-24 rounded-lg border border-gray-200 bg-gray-50 overflow-hidden">
                    <img src={selectedModel.imageUrl} alt={selectedModel.model.name} className="w-24 h-28 object-cover" />
                    <div className="px-1 py-0.5 text-[8px] text-gray-400 truncate">{selectedModel.model.name}</div>
                  </div>
                  {!batchRunningOrAnalyzing && (
                    <button onClick={() => setSelectedModel(null)}
                      className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/50 text-white text-[10px] opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                  )}
                </div>
              ) : (
                !batchRunningOrAnalyzing && (
                  <button onClick={() => setModelPickerOpen(true)}
                    className="w-24 h-[7.5rem] rounded-lg border border-dashed border-primary-200 bg-primary-50/40 flex flex-col items-center justify-center cursor-pointer hover:border-primary-400 transition-colors">
                    <span className="text-base text-primary-500">◉</span>
                    <span className="text-[10px] text-primary-600 mt-0.5">选择模特</span>
                  </button>
                )
              )}
              <div><span className="text-[10px] text-gray-400">从品牌模特库或系统模特库中选择 1 张模特照片</span></div>
            </div>

            {/* 描述 */}
            <div>
              <label className={labelCls}>描述(可选)</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
                placeholder="补充穿搭场景、风格要求、配色偏好等" className={`${inputCls} resize-none`} />
            </div>

            {/* 预览 */}
            {selectedProducts.length > 0 && selectedModel && (
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-[11px] text-gray-600">
                将生成 <span className="font-medium text-primary-600">1</span> 张穿搭效果图({selectedProducts.length} 款单品 × 1 位模特)
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-[12px] text-red-600">⚠ {error}</div>
            )}
          </div>
        </div>

        {/* 底部行动按钮 */}
        <div className="shrink-0 border-t border-gray-200 bg-white px-5 pt-3 pb-4">
          {hasSuccess && !batchRunningOrAnalyzing && !submitting ? (
            <GenerateButton label={`保存到 Lookbook`} loading={false} estimatedCoins={0} userCoins={user?.coins} onClick={saveToLookbook} />
          ) : (
            <GenerateButton label="立即生成" loading={submitting || batchRunningOrAnalyzing} disabled={!canSubmit}
              estimatedCoins={AI_COST_PER_IMAGE} userCoins={user?.coins} onClick={submit} />
          )}
          {batchRunningOrAnalyzing && batch && (
            <div className="text-[11px] text-gray-500 mt-2 text-center">{batch.completed + batch.failed}/{batch.total}
              {batch.failed > 0 && <span className="text-amber-600 ml-1">({batch.failed} 张失败)</span>}
            </div>
          )}
        </div>
      </div>

      {/* 右:结果 */}
      <aside className="border-l border-gray-200 bg-gray-50 overflow-y-auto min-h-0 p-5 space-y-5">
        {!batch && !submitting && (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white text-center text-[12px] text-gray-400 px-6 py-12">
            选择单品与模特后<br />点击底部「立即生成」
          </div>
        )}
        {submitting && (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-primary-200 border-t-primary-500 rounded-full animate-spin" />
              <span className="text-[12px] text-gray-500">正在提交…</span>
            </div>
          </div>
        )}
        {batch && cell && (
          <>
            <div className="text-[10px] uppercase tracking-wider text-gray-500">穿搭效果</div>
            <div className="mx-auto w-full max-w-[360px] aspect-[3/4] rounded-xl border border-gray-200 bg-white overflow-hidden">
              {cell.status === "pending" && (
                <div className="w-full h-full flex items-center justify-center flex-col gap-1">
                  <div className="w-8 h-8 border-2 border-primary-200 border-t-primary-500 rounded-full animate-spin" />
                  <span className="text-[12px] text-gray-400">生成中…</span>
                </div>
              )}
              {cell.status === "done" && cell.url && (
                <img src={cell.url} alt="穿搭效果" className="w-full h-full object-contain" />
              )}
              {cell.status === "error" && (
                <div className="w-full h-full flex items-center justify-center flex-col gap-1 px-4 text-center">
                  <span className="text-[12px] text-red-500">{cell.error || "生成失败"}</span>
                  <button onClick={retry} className="text-[12px] text-primary-600 underline hover:text-primary-700">重试</button>
                </div>
              )}
            </div>

            {/* 参考图 */}
            <div className="space-y-3">
              {batch.model && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">模特</div>
                  <div className="flex items-center gap-2 text-[11px] text-gray-600">
                    <img src={batch.model.url} alt={batch.model.name} className="w-10 h-10 rounded-lg object-cover border border-gray-200" />
                    <span className="truncate">{batch.model.name}</span>
                  </div>
                </div>
              )}
              {(batch.products || []).length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">单品({batch.products.length})</div>
                  <div className="flex flex-wrap gap-2">
                    {(batch.products || []).map((p) => (
                      <div key={p.id} className="w-14 text-center">
                        <div className="w-14 h-14 rounded-lg border border-gray-200 bg-white overflow-hidden">
                          {p.url ? <img src={p.url} alt={p.title} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-gray-100" />}
                        </div>
                        <div className="text-[8px] text-gray-400 mt-0.5 truncate">{p.title}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </aside>

      {/* 单品选择弹窗 */}
      {productPickerOpen && (
        <ProductPickerModal
          products={store.products}
          selectedIds={selectedProducts.map((p) => p.id)}
          maxWidth={MAX_PRODUCTS}
          onClose={() => setProductPickerOpen(false)}
          onConfirm={(picked) => { setSelectedProducts(picked); setProductPickerOpen(false); }}
        />
      )}
      {/* 模特选择弹窗 */}
      {modelPickerOpen && (
        <ModelPickerModal
          models={resourceStore.models}
          onClose={() => setModelPickerOpen(false)}
          onConfirm={(model, imageUrl) => { setSelectedModel({ model, imageUrl }); setModelPickerOpen(false); }}
        />
      )}
    </div>
  );
}

// ─── 单品选择弹窗(从 Lookbook 多选) ──────────────────────────────
function ProductPickerModal({ products, selectedIds, maxWidth, onClose, onConfirm }: {
  products: Product[];
  selectedIds: string[];
  maxWidth: number;
  onClose: () => void;
  onConfirm: (picked: Product[]) => void;
}) {
  const [pickedIds, setPickedIds] = useState<Set<string>>(new Set(selectedIds));
  const [q, setQ] = useState("");

  // 仅展示有图片的单品
  const withImages = products.filter((p) => !!pickProductCover(p));
  const visible = !q.trim() ? withImages : withImages.filter((p) =>
    (p.title || "").toLowerCase().includes(q.trim().toLowerCase()));

  const toggle = (id: string) => {
    setPickedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); return next; }
      if (next.size >= maxWidth) return prev; // 已达上限
      next.add(id);
      return next;
    });
  };

  return (
    <Modal open onClose={onClose} title={`选择单品(已选 ${pickedIds.size}/${maxWidth})`} maxWidth="max-w-3xl">
      <div className="flex flex-col max-h-[68vh]">
        <div className="shrink-0 pb-3 border-b border-gray-100">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="按名称搜索…"
            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:border-primary-500" />
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto py-3">
          {visible.length === 0 ? (
            <div className="py-10 text-center text-gray-500 text-sm">还没有带图片的单品,请先在 Lookbook 中生成</div>
          ) : (
            <div className="grid grid-cols-3 xl:grid-cols-4 gap-3">
              {visible.map((p) => {
                const active = pickedIds.has(p.id);
                return (
                  <button key={p.id} onClick={() => toggle(p.id)}
                    className={`rounded-xl border overflow-hidden text-left transition-all ${active ? "border-primary-500 ring-2 ring-primary-200" : "border-gray-200 hover:border-gray-300"}`}>
                    <div className="aspect-square bg-gray-50 overflow-hidden">
                      {pickProductCover(p) ? <img src={pickProductCover(p)!} alt={p.title} className="w-full h-full object-cover" /> : null}
                    </div>
                    <div className="px-2 py-1.5 text-[11px] text-gray-700 truncate">{p.title || "未命名"}</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="shrink-0 flex items-center justify-end gap-2 pt-3 mt-3 border-t border-gray-100">
          <button onClick={onClose} className="text-[12px] text-gray-600 hover:underline px-3 py-1.5">取消</button>
          <button onClick={() => onConfirm(products.filter((p) => pickedIds.has(p.id)))}
            disabled={pickedIds.size === 0}
            className="text-[12px] bg-primary-500 hover:bg-primary-600 disabled:opacity-40 text-white px-4 py-1.5 rounded-lg font-medium transition-colors">
            确认选择
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── 模特选择弹窗(从品牌/系统模特库选 1 张图) ─────────────────────
function ModelPickerModal({ models, onClose, onConfirm }: {
  models: ModelRow[];
  onClose: () => void;
  onConfirm: (model: ModelRow, imageUrl: string) => void;
}) {
  const [q, setQ] = useState("");
  const withImages = models.filter((m) => (m.images || []).length > 0);
  const visible = !q.trim() ? withImages : withImages.filter((m) =>
    (m.name || "").toLowerCase().includes(q.trim().toLowerCase()) ||
    (m.tags || []).some((t) => t.toLowerCase().includes(q.trim().toLowerCase())));

  const fmtMeasurement = (m: ModelRow) => {
    const parts: string[] = [];
    if (m.height != null) parts.push(`身高${m.height}`);
    if (m.bust != null) parts.push(`胸${m.bust}`);
    if (m.waist != null) parts.push(`腰${m.waist}`);
    if (m.hip != null) parts.push(`臀${m.hip}`);
    return parts.length ? parts.join(" / ") : "";
  };

  return (
    <Modal open onClose={onClose} title="选择模特图片" maxWidth="max-w-3xl">
      <div className="flex flex-col max-h-[68vh]">
        <div className="shrink-0 pb-3 border-b border-gray-100">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="按模特名称、标签搜索…"
            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:border-primary-500" />
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto py-3">
          {visible.length === 0 ? (
            <div className="py-10 text-center text-gray-500 text-sm">还没有模特,请先在「模特」中上传</div>
          ) : (
            <div className="space-y-4">
              {visible.map((m) => (
                <div key={m.id}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[12px] font-medium text-gray-700">{m.name}</span>
                    {m.shared && <span className="text-[8px] px-1.5 py-0.5 rounded-sm bg-amber-500/95 text-white">系统</span>}
                    {fmtMeasurement(m) && <span className="text-[10px] text-gray-400">{fmtMeasurement(m)}</span>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(m.images || []).map((url, idx) => (
                      <button key={idx} onClick={() => onConfirm(m, url)}
                        className="w-24 rounded-xl border border-gray-200 bg-gray-50 overflow-hidden hover:border-primary-400 transition-colors">
                        <img src={url} alt={`${m.name}-${idx + 1}`} className="w-24 h-28 object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="shrink-0 flex items-center justify-end gap-2 pt-3 mt-3 border-t border-gray-100">
          <button onClick={onClose} className="text-[12px] text-gray-600 hover:underline px-3 py-1.5">取消</button>
        </div>
      </div>
    </Modal>
  );
}

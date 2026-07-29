/**
 * RegularGenerate ——「常规生图」工作台。
 *
 * 最轻量的通用生图入口:输入 prompt + 可选的一张参考图(5 选 1:本地 / 款式库 / 面料库 / 插画库 / Lookbook)
 * → 生成 1–4 张产品图 → 保存到任意目标库(Lookbook / 款式 / 面料 / 插画,都新建条目)。
 *
 * 两种模式(页面顶部 header 右侧分段切换):
 *   - 文生图(text):用户描述 → 该内容的 1:1 白底产品图。
 *   - 图生图(image):用户上传/选参考图 → 将参考图转绘为白底产品图。
 *
 * 后端异步批次 + 前端轮询,交互对齐「插画创作」/「穿搭效果」:
 *   POST → 202 batchId → 轮询 batch → 失败可单格重试 → 成功后「保存到目标库」。
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { useCurrentTeam } from "../../../contexts/CurrentTeamContext";
import { teamApi } from "../lib/api";
import type { RegularGenerateBatch } from "../lib/api";
import { useDesignStore } from "../store/design";
import { useResourceStore } from "../store/resource";
import { useAuth } from "../../../contexts/AuthContext";
import { GenerateButton, AI_COST_PER_IMAGE } from "../../../components/GenerateButton";
import { useImageRetry } from "../../../hooks/useImageRetry";
import { useImagePreview } from "../../../components/ImagePreviewModal";
import { Modal } from "../components/ui";
import { showToast } from "../../../components/Toast";
import { compressForUpload } from "../lib/images";
import { pickProductCover } from "../lib/product-cover";
import type { KnowledgeDeps } from "../../DashboardPage/knowledge-injectors";
import type { StyleRow, IllustrationRow } from "../types/design";
import type { Product } from "../types/design";

const MAX_IMAGES = 4;
const POLL_MS = 3000;
// 对齐后端 RG_BATCH_TTL_MS = 15min,略小于 TTL 避免与清理竞争
const POLL_MAX_ATTEMPTS = 290;

// 参考图来源类型
type RefSource = "local" | "style" | "material" | "illustration" | "lookbook";

interface Props {
  knowledge?: Pick<KnowledgeDeps, "brand">;
  brandLoading?: boolean;
  knowledgeLoading?: boolean;
}

export default function RegularGeneratePage({ knowledge, brandLoading, knowledgeLoading }: Props) {
  const { teamId, navigateTab } = useCurrentTeam();
  const { user } = useAuth();
  const { upsertProduct } = useDesignStore();
  const { styles, materials, illustrations, refreshStyles, refreshMaterials, refreshIllustrations } = useResourceStore();

  // ── 输入状态 ──
  const [mode, setMode] = useState<"text" | "image">("text");
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [count, setCount] = useState(1);
  // 参考图:5 选 1 单参考图
  const [refSource, setRefSource] = useState<RefSource | null>(null);
  const [refUrl, setRefUrl] = useState<string>("");
  const [refPreview, setRefPreview] = useState<string>("");
  const [refLabel, setRefLabel] = useState<string>("");
  // 库选择弹窗
  const [pickerOpen, setPickerOpen] = useState<RefSource | null>(null);

  // ── 批次状态 ──
  const [batch, setBatch] = useState<RegularGenerateBatch | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = useImagePreview();
  const refInputRef = useRef<HTMLInputElement>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollAttempts = useRef(0);

  const brandLogo = knowledge?.brand?.logo || undefined;
  const brandSlogan = knowledge?.brand?.slogan || undefined;

  // ── 派生态 ──
  const batchRunning = !!batch && batch.status === "running";
  const hasSuccess = !!batch && batch.completed > 0;
  const canSubmit =
    !!name.trim()
    && (mode === "image" ? true : !!prompt.trim())
    && !batchRunning && !submitting
    && !brandLoading && !knowledgeLoading;

  // ── 生图自动重试(1 次) ──
  const { resetRetries, tryAutoRetry } = useImageRetry({
    maxRetries: 1,
    getKey: () => batch?.batchId ?? "",
    retryFn: (_it, isAutoRetry) => retryByIndex(_it.items?.[0]?.ci, isAutoRetry),
    onFailed: (item, errMsg) => {
      setBatch((b) => b ? {
        ...b,
        items: b.items.map((it) => it.ci === item.ci ? { ...it, status: "error", error: errMsg || "生成失败,请重试" } : it),
      } : b);
    },
  });

  // ── 轮询启停 ──
  const stopPolling = useCallback(() => {
    if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null; }
  }, []);

  const startPolling = useCallback((batchId: string) => {
    if (!teamId) return;
    stopPolling();
    pollAttempts.current = 0;
    resetRetries();
    pollTimer.current = setInterval(async () => {
      pollAttempts.current += 1;
      if (pollAttempts.current > POLL_MAX_ATTEMPTS) {
        setBatch((b) => b ? {
          ...b, status: "done",
          items: b.items.map((it) => it.status === "pending" ? { ...it, status: "error", error: "生成超时,可重试" } : it),
        } : b);
        stopPolling();
        return;
      }
      try {
        const url = teamApi(teamId).regularGenerateBatchUrl(batchId);
        const res = await fetch(url, { credentials: "include" });
        if (res.status === 404) { setError("批次已过期,请重新生成"); setBatch(null); stopPolling(); return; }
        if (!res.ok) return;
        const data: RegularGenerateBatch = await res.json();
        setBatch(data);
        const errItem = data.items.find((it) => it.status === "error");
        if (errItem) tryAutoRetry(errItem, errItem.error || "生成失败");
        if (data.status === "done") stopPolling();
      } catch { /* 网络错误继续 */ }
    }, POLL_MS);
  }, [teamId, stopPolling, resetRetries, tryAutoRetry]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  // 输入变化 → 清空旧批次
  useEffect(() => {
    setBatch(null);
    stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, prompt, mode, count, refUrl]);

  // ── 参考图:本地上传 ──
  async function onPickLocalFile(list: FileList | null) {
    if (!list?.length) return;
    const raw = list[0];
    try {
      const compressed = await compressForUpload(raw);
      setRefSource("local");
      setRefUrl("");
      setRefPreview(URL.createObjectURL(compressed));
      setRefLabel(raw.name.replace(/\.[^.]+$/, "").slice(0, 30) || "本地参考图");
      // 把文件暂存,提交时上传
      pendingFileRef.current = compressed;
    } catch {
      setError("图片处理失败,请换一张重试");
    }
    if (refInputRef.current) refInputRef.current.value = "";
  }

  // 暂存待上传的文件(本地模式)
  const pendingFileRef = useRef<File | null>(null);

  // ── 参考图:从库选取 ──
  function onPickFromLibrary(source: RefSource, url: string, label: string) {
    setRefSource(source);
    setRefUrl(url);
    setRefPreview(url);
    setRefLabel(label);
    setPickerOpen(null);
  }

  function clearRef() {
    if (refSource === "local" && refPreview) URL.revokeObjectURL(refPreview);
    setRefSource(null);
    setRefUrl("");
    setRefPreview("");
    setRefLabel("");
    pendingFileRef.current = null;
    if (refInputRef.current) refInputRef.current.value = "";
  }

  // ── 提交 ──
  async function submit() {
    if (!canSubmit || !teamId) return;
    setSubmitting(true);
    setError(null);
    setBatch(null);
    stopPolling();
    try {
      const fd = new FormData();
      fd.append("mode", mode);
      fd.append("name", name.trim());
      fd.append("count", String(count));
      if (prompt.trim()) fd.append("prompt", prompt.trim());
      // 参考图:本地上传传文件,库选取传 URL
      if (mode === "image" && refSource === "local" && pendingFileRef.current) {
        fd.append("image", pendingFileRef.current);
      } else if (mode === "image" && refUrl) {
        fd.append("refUrl", refUrl);
      }
      if (brandLogo) fd.append("brandLogo", brandLogo);
      if (brandSlogan) fd.append("brandSlogan", brandSlogan);

      const res = await fetch(teamApi(teamId).regularGenerateUrl, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) {
        if (res.status === 402) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || "喵币不足，请充值后再试");
        }
        const t = await res.text().catch(() => "");
        throw new Error(`请求失败 (HTTP ${res.status})${t ? `: ${t.slice(0, 120)}` : ""}`);
      }
      const data: RegularGenerateBatch = await res.json();
      setBatch(data);
      if (data.status === "running" && data.batchId) startPolling(data.batchId);
    } catch (e: any) {
      setError(e?.message || "提交失败,请重试");
    } finally {
      setSubmitting(false);
    }
  }

  // ── 单格重试 ──
  async function retryByIndex(ci: number | undefined, isAutoRetry = false) {
    if (ci === undefined || !batch || !teamId) return;
    if (!isAutoRetry) {
      setBatch((b) => b ? {
        ...b, status: "running",
        items: b.items.map((it) => it.ci === ci ? { ...it, status: "pending", error: null } : it),
      } : b);
    }
    try {
      const url = teamApi(teamId).regularGenerateRegenerateUrl(batch.batchId);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ci }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      startPolling(batch.batchId);
    } catch (e: any) {
      setBatch((b) => b ? {
        ...b, status: "error",
        items: b.items.map((it) => it.ci === ci ? { ...it, status: "error", error: e?.message || "重试失败" } : it),
      } : b);
    }
  }

  // ── 保存到目标库(都新建条目) ──
  async function saveToLookbook() {
    if (!batch) return;
    const doneItems = batch.items.filter((it) => it.status === "done" && it.url);
    if (!doneItems.length) { setError("暂无成功生成的图片"); return; }
    const now = new Date().toISOString();
    const product: any = {
      mode: "regular-generate",
      title: name.trim() || "未命名常规生图",
      description: prompt.trim() || "",
      images: doneItems.map((it, i) => ({
        slot: "regular-generate",
        label: `${name.trim() || "常规生图"} ${i + 1}`,
        url: it.url!,
      })),
      status: "draft",
      statusHistory: [{ id: crypto.randomUUID(), status: "draft", at: now, actor: "atelier" }],
    };
    try {
      await upsertProduct(product);
      showToast(`已保存 ${doneItems.length} 张图到 Lookbook`, "success");
      resetWorkspace();
      navigateTab("lookbook");
    } catch (e: any) {
      setError(`保存失败: ${e?.message || ""}`);
    }
  }

  async function saveToStyles() {
    if (!batch) return;
    const doneItems = batch.items.filter((it) => it.status === "done" && it.url);
    if (!doneItems.length) { setError("暂无成功生成的图片"); return; }
    try {
      for (const [i, it] of doneItems.entries()) {
        await teamApi(teamId!).createStyle({
          name: `${name.trim() || "常规生图"} ${i + 1}`,
          category: "常规生图",
          image: it.url!,
        });
      }
      await refreshStyles();
      showToast(`已保存 ${doneItems.length} 个款式`, "success");
      resetWorkspace();
      navigateTab("styles");
    } catch (e: any) {
      setError(`保存失败: ${e?.message || ""}`);
    }
  }

  async function saveToMaterials() {
    if (!batch) return;
    const doneItems = batch.items.filter((it) => it.status === "done" && it.url);
    if (!doneItems.length) { setError("暂无成功生成的图片"); return; }
    try {
      for (const [i, it] of doneItems.entries()) {
        await teamApi(teamId!).createMaterial({
          name: `${name.trim() || "常规生图"} ${i + 1}`,
          category: "常规生图",
          image: it.url!,
        });
      }
      await refreshMaterials();
      showToast(`已保存 ${doneItems.length} 个面料`, "success");
      resetWorkspace();
      navigateTab("materials");
    } catch (e: any) {
      setError(`保存失败: ${e?.message || ""}`);
    }
  }

  async function saveToIllustrations() {
    if (!batch) return;
    const doneItems = batch.items.filter((it) => it.status === "done" && it.url);
    if (!doneItems.length) { setError("暂无成功生成的图片"); return; }
    try {
      for (const [i, it] of doneItems.entries()) {
        await teamApi(teamId!).createIllustration({
          name: `${name.trim() || "常规生图"} ${i + 1}`,
          image: it.url!,
        });
      }
      await refreshIllustrations();
      showToast(`已保存 ${doneItems.length} 张插画`, "success");
      resetWorkspace();
      navigateTab("illustrations");
    } catch (e: any) {
      setError(`保存失败: ${e?.message || ""}`);
    }
  }

  /** 清空整个工作台填写内容,回到全新可填写状态 */
  function resetWorkspace() {
    if (refSource === "local" && refPreview) URL.revokeObjectURL(refPreview);
    setName("");
    setPrompt("");
    setCount(1);
    setRefSource(null);
    setRefUrl("");
    setRefPreview("");
    setRefLabel("");
    pendingFileRef.current = null;
    setBatch(null);
    setSubmitting(false);
    setError(null);
    stopPolling();
  }

  const inputCls = "w-full text-[12px] border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-primary-500 bg-white";
  const labelCls = "text-[10px] uppercase tracking-wider text-gray-500 mb-1 block";

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr] h-[calc(100vh-64px)] min-h-0">
      {/* 左:表单 */}
      <div className="flex flex-col bg-white min-h-0">
        <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-gray-200 px-5 py-3 shrink-0 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[15px] font-medium text-gray-800 min-h-7 flex items-center gap-2">常规生图</h1>
            <span className="text-[10px] text-gray-500">文字生图 / 参考图生图 → 1–4 张白底产品图,可存入任意素材库</span>
          </div>
          {/* 模式切换分段控件 */}
          <div className="flex items-center rounded-lg border border-gray-200 bg-gray-50 p-0.5 shrink-0">
            <button
              type="button"
              onClick={() => { if (!batchRunning && !submitting) setMode("text"); }}
              className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors ${mode === "text" ? "bg-white text-primary-600 shadow-sm" : "text-gray-500 hover:text-gray-700"} ${batchRunning || submitting ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
            >
              文生图
            </button>
            <button
              type="button"
              onClick={() => { if (!batchRunning && !submitting) setMode("image"); }}
              className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors ${mode === "image" ? "bg-white text-primary-600 shadow-sm" : "text-gray-500 hover:text-gray-700"} ${batchRunning || submitting ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
            >
              图生图
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="p-5 space-y-5 max-w-2xl">
            {/* 名称 */}
            <div>
              <label className={labelCls}>名称 <span className="text-red-500">*</span></label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="如:春日系列概念图" className={inputCls} />
            </div>

            {/* 文生图:描述 */}
            {mode === "text" && (
              <div>
                <label className={labelCls}>画面描述 <span className="text-red-500">*</span></label>
                <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4}
                  placeholder="描述你想生成的产品图,如:一只简约的米白色陶瓷花瓶,瓶身有细腻的磨砂纹理" className={`${inputCls} resize-none`} />
                <span className="text-[10px] text-gray-400">描述越详细,生成效果越贴近预期</span>
              </div>
            )}

            {/* 生成数量 */}
            <div>
              <label className={labelCls}>生成数量 <span className="text-gray-400 normal-case tracking-normal">(最多 {MAX_IMAGES} 张)</span></label>
              <div className="flex items-center gap-2">
                {Array.from({ length: MAX_IMAGES }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    disabled={batchRunning || submitting}
                    onClick={() => setCount(n)}
                    className={`w-10 h-9 rounded-lg border text-[12px] font-medium transition-colors ${count === n
                      ? "border-primary-500 bg-primary-500 text-white"
                      : "border-gray-200 bg-white text-gray-600 hover:border-primary-400"} ${batchRunning || submitting ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                  >
                    {n}
                  </button>
                ))}
                <span className="text-[10px] text-gray-400 ml-1">每张消耗 {AI_COST_PER_IMAGE} 喵币</span>
              </div>
            </div>

            {/* 参考图(可选) */}
            <div>
              <label className={labelCls}>
                参考图(可选)
                <span className="text-gray-400 normal-case tracking-normal ml-1">图生图时作为主体参考</span>
              </label>
              {refPreview ? (
                <div className="relative inline-block group">
                  <div className="w-32 rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
                    <img src={refPreview} alt="参考图" className="w-32 h-32 object-cover" />
                  </div>
                  <div className="absolute inset-x-0 bottom-0 px-2 py-1 bg-black/40 backdrop-blur-sm">
                    <span className="text-[10px] text-white truncate block">{refLabel || "参考图"}</span>
                  </div>
                  {!batchRunning && (
                    <button onClick={clearRef}
                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/50 text-white text-[12px] opacity-0 group-hover:opacity-100 transition-opacity leading-none">×</button>
                  )}
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {/* 本地上传 */}
                  <label className={`w-20 h-20 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 flex flex-col items-center justify-center cursor-pointer hover:border-primary-400 transition-colors ${batchRunning ? "opacity-50 cursor-not-allowed" : ""}`}>
                    <span className="text-lg text-gray-400 leading-none">↑</span>
                    <span className="text-[9px] text-gray-400 mt-0.5">本地</span>
                    <input ref={refInputRef} type="file" accept="image/*" className="hidden" disabled={batchRunning}
                      onChange={(e) => void onPickLocalFile(e.target.files)} />
                  </label>
                  {/* 款式库 */}
                  <button type="button" disabled={batchRunning} onClick={() => setPickerOpen("style")}
                    className={`w-20 h-20 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 flex flex-col items-center justify-center cursor-pointer hover:border-primary-400 transition-colors ${batchRunning ? "opacity-50 cursor-not-allowed" : ""}`}>
                    <span className="text-lg text-gray-400 leading-none">◑</span>
                    <span className="text-[9px] text-gray-400 mt-0.5">款式库</span>
                  </button>
                  {/* 面料库 */}
                  <button type="button" disabled={batchRunning} onClick={() => setPickerOpen("material")}
                    className={`w-20 h-20 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 flex flex-col items-center justify-center cursor-pointer hover:border-primary-400 transition-colors ${batchRunning ? "opacity-50 cursor-not-allowed" : ""}`}>
                    <span className="text-lg text-gray-400 leading-none">◫</span>
                    <span className="text-[9px] text-gray-400 mt-0.5">面料库</span>
                  </button>
                  {/* 插画库 */}
                  <button type="button" disabled={batchRunning} onClick={() => setPickerOpen("illustration")}
                    className={`w-20 h-20 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 flex flex-col items-center justify-center cursor-pointer hover:border-primary-400 transition-colors ${batchRunning ? "opacity-50 cursor-not-allowed" : ""}`}>
                    <span className="text-lg text-gray-400 leading-none">◈</span>
                    <span className="text-[9px] text-gray-400 mt-0.5">插画库</span>
                  </button>
                  {/* Lookbook */}
                  <button type="button" disabled={batchRunning} onClick={() => setPickerOpen("lookbook")}
                    className={`w-20 h-20 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 flex flex-col items-center justify-center cursor-pointer hover:border-primary-400 transition-colors ${batchRunning ? "opacity-50 cursor-not-allowed" : ""}`}>
                    <span className="text-lg text-gray-400 leading-none">✦</span>
                    <span className="text-[9px] text-gray-400 mt-0.5">Lookbook</span>
                  </button>
                </div>
              )}
              <span className="text-[10px] text-gray-400">可选,上传或从库中选取一张参考图(5 选 1)</span>
            </div>

            {/* 图生图:补充描述(可选) */}
            {mode === "image" && (
              <div>
                <label className={labelCls}>补充描述(可选)</label>
                <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={2}
                  placeholder="可补充画面细节要求,如色调、元素取舍等" className={`${inputCls} resize-none`} />
              </div>
            )}

            {/* 预览 */}
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-[11px] text-gray-600">
              将生成 <span className="font-medium text-primary-600">{count}</span> 张 1:1 产品图
              {refPreview && <span> · 含参考图({refLabel})</span>}
            </div>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-[12px] text-red-600">⚠ {error}</div>
            )}
          </div>
        </div>

        {/* 底部行动按钮 */}
        <div className="shrink-0 border-t border-gray-200 bg-white px-5 pt-3 pb-4 space-y-2">
          {hasSuccess && !batchRunning && !submitting ? (
            <div className="space-y-2">
              <div className="text-[11px] text-gray-500 text-center mb-1">已生成 {batch!.completed}/{batch!.total} 张,保存到目标库:</div>
              <div className="grid grid-cols-2 gap-2">
                <GenerateButton label="保存到 Lookbook" loading={false} estimatedCoins={0} onClick={saveToLookbook} />
                <GenerateButton label="保存到款式" loading={false} estimatedCoins={0} onClick={saveToStyles} />
                <GenerateButton label="保存到面料" loading={false} estimatedCoins={0} onClick={saveToMaterials} />
                <GenerateButton label="保存到插画" loading={false} estimatedCoins={0} onClick={saveToIllustrations} />
              </div>
              <button onClick={resetWorkspace} className="w-full text-[11px] text-gray-500 hover:text-primary-600 transition-colors">
                继续创作(清空)
              </button>
            </div>
          ) : (
            <GenerateButton label="立即生成" loading={submitting || batchRunning} disabled={!canSubmit}
              estimatedCoins={AI_COST_PER_IMAGE * count} userCoins={user?.coins} onClick={submit} />
          )}
          {batchRunning && batch && (
            <div className="text-[11px] text-gray-500 mt-1 text-center">生成中… {batch.completed + batch.failed}/{batch.total}</div>
          )}
        </div>
      </div>

      {/* 右:结果 */}
      <aside className="border-l border-gray-200 bg-gray-50 overflow-y-auto min-h-0 p-5 space-y-5">
        {!batch && !submitting && (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white text-center text-[12px] text-gray-400 px-6 py-12">
            {mode === "text" ? "填写名称与画面描述,选择数量后" : "上传或选择参考图后"}<br />点击底部「立即生成」
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
        {batch && (
          <>
            <div className="text-[10px] uppercase tracking-wider text-gray-500">生成结果</div>
            <div className="grid grid-cols-2 gap-3">
              {batch.items.map((it) => (
                <div key={it.ci} className="aspect-square rounded-xl border border-gray-200 bg-white overflow-hidden">
                  {it.status === "pending" && (
                    <div className="w-full h-full flex items-center justify-center flex-col gap-1">
                      <div className="w-7 h-7 border-2 border-primary-200 border-t-primary-500 rounded-full animate-spin" />
                      <span className="text-[11px] text-gray-400">生成中…</span>
                    </div>
                  )}
                  {it.status === "done" && it.url && (
                    <img src={it.url} alt={`结果 ${it.ci + 1}`} className="w-full h-full object-contain cursor-zoom-in"
                      onClick={() => preview.open([{ url: it.url!, label: `结果 ${it.ci + 1}` }], 0)} />
                  )}
                  {it.status === "error" && (
                    <div className="w-full h-full flex items-center justify-center flex-col gap-1 px-3 text-center">
                      <span className="text-[11px] text-red-500">{it.error || "生成失败"}</span>
                      <button onClick={() => void retryByIndex(it.ci, false)} className="text-[11px] text-primary-600 underline hover:text-primary-700">重试</button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* 参考图(已选时展示) */}
            {refPreview && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">参考图</div>
                <div className="relative inline-block">
                  <div className="w-20 rounded-lg border border-gray-200 bg-white overflow-hidden">
                    <img src={refPreview} alt="参考图" className="w-20 h-20 object-cover" />
                  </div>
                  <div className="absolute inset-x-0 bottom-0 px-1.5 py-0.5 bg-black/40 backdrop-blur-sm">
                    <span className="text-[9px] text-white truncate block">{refLabel}</span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </aside>

      {/* 全屏大图预览 */}
      {preview.modal}

      {/* 库选择弹窗 */}
      {pickerOpen && (
        <RefPickerModal
          source={pickerOpen}
          styles={styles}
          materials={materials}
          illustrations={illustrations}
          products={useDesignStore().products}
          onClose={() => setPickerOpen(null)}
          onPick={(url, label) => onPickFromLibrary(pickerOpen, url, label)}
        />
      )}
    </div>
  );
}

// ─── 参考图库选择弹窗(5 选 1 单选) ──────────────────────────────
function RefPickerModal({ source, styles, materials, illustrations, products, onClose, onPick }: {
  source: RefSource;
  styles: StyleRow[];
  materials: any[];
  illustrations: IllustrationRow[];
  products: Product[];
  onClose: () => void;
  onPick: (url: string, label: string) => void;
}) {
  const [q, setQ] = useState("");

  const label = {
    style: "款式库",
    material: "面料库",
    illustration: "插画库",
    lookbook: "Lookbook",
    local: "本地",
  }[source];

  type Item = { url: string; label: string; shared?: boolean };
  let items: Item[] = [];

  if (source === "style") {
    items = styles.filter((s) => s.image).map((s) => ({ url: s.image!, label: s.name, shared: s.shared }));
  } else if (source === "material") {
    items = materials.filter((m) => m.image).map((m) => ({ url: m.image!, label: m.name, shared: m.shared }));
  } else if (source === "illustration") {
    items = illustrations.filter((i) => i.image).map((i) => ({ url: i.image!, label: i.name }));
  } else if (source === "lookbook") {
    items = products.filter((p) => !!pickProductCover(p)).map((p) => ({ url: pickProductCover(p)!, label: p.title || "未命名" }));
  }

  const visible = !q.trim() ? items : items.filter((it) =>
    it.label.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <Modal open onClose={onClose} title={`从${label}选择参考图`} maxWidth="max-w-3xl">
      <div className="flex flex-col max-h-[68vh]">
        <div className="shrink-0 pb-3 border-b border-gray-100">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="按名称搜索…"
            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:border-primary-500" />
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto py-3">
          {visible.length === 0 ? (
            <div className="py-10 text-center text-gray-500 text-sm">暂无带图片的{label},请先在对应库中上传</div>
          ) : (
            <div className="grid grid-cols-3 xl:grid-cols-4 gap-3">
              {visible.map((it, idx) => (
                <button key={idx} onClick={() => onPick(it.url, it.label)}
                  className="rounded-xl border border-gray-200 overflow-hidden text-left transition-all hover:border-primary-400 hover:ring-2 hover:ring-primary-200">
                  <div className="aspect-square bg-gray-50 overflow-hidden">
                    <img src={it.url} alt={it.label} className="w-full h-full object-cover" />
                  </div>
                  <div className="px-2 py-1.5 text-[11px] text-gray-700 truncate flex items-center gap-1">
                    {it.shared && <span className="text-[7px] px-1 py-0.5 rounded bg-amber-500/90 text-white shrink-0">系统</span>}
                    <span className="truncate">{it.label}</span>
                  </div>
                </button>
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

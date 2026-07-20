/**
 * IllustrationCreate ——「插画创作」工作台。
 *
 * 支持两种生成方式(页面顶部 header 右侧分段切换):
 *   - 文生图(text):用户描述 + 风格参考图 → 该风格的 1:1 白底插画。
 *   - 图生图(image):用户上传照片 + 风格参考图 → 将照片转绘为该风格。
 *
 * 两种模式统一走参考图生图(maizi-image-edit),风格由参考图决定(不再用文本 prompt 描述风格)。
 *
 * 后端异步批次 + 前端轮询,交互对齐「穿搭效果」(outfit-styling):
 *   POST → 202 batchId → 轮询 batch → 失败可重试 → 成功后「保存到插画库」。
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { useCurrentTeam } from "../../../contexts/CurrentTeamContext";
import { teamApi } from "../lib/api";
import type { KnowledgeDeps } from "../../DashboardPage/knowledge-injectors";
// 插画创作页仅消费品牌风格(brand),故 knowledge 类型收窄为 Pick<...,'brand'> —— 诚实表达依赖、避免传大量空占位字段。
type IllustrationCreateKnowledge = Pick<KnowledgeDeps, "brand">;
import { compressForUpload } from "../lib/images";
import { GenerateButton, AI_COST_PER_IMAGE } from "../../../components/GenerateButton";
import { useImageRetry } from "../../../hooks/useImageRetry";
import { useImagePreview } from "../../../components/ImagePreviewModal";
import { useAuth } from "../../../contexts/AuthContext";
import { useResourceStore } from "../store/resource";
import { showToast } from "../../../components/Toast";

// 风格参考图静态资源(用户将提供真实图片后替换)
import styleCuteCrayon from "../../../assets/illustration-styles/cute-crayon-sticker.png";
import styleModernWatercolor from "../../../assets/illustration-styles/modern-watercolor.png";
import styleHandDrawnColor from "../../../assets/illustration-styles/hand-drawn-color.png";
import styleHealingHandDrawn from "../../../assets/illustration-styles/healing-hand-drawn.png";
import styleDreamcoreKawaii from "../../../assets/illustration-styles/dreamcore-kawaii-Pencil.png";
import stylePlushWatercolor from "../../../assets/illustration-styles/plush-watercolor.png";

const POLL_MS = 3000;
// 对齐后端 IC_BATCH_TTL_MS = 15min,略小于 TTL 避免与清理竞争
const POLL_MAX_ATTEMPTS = 290;

// ─── 系统预置风格(每张卡片展示风格参考图,传 styleRefUrl 给后端) ───
interface PresetStyle {
  id: string;
  label: string;
  description: string;
  /** 风格参考图 URL(静态资源 import) */
  refImage: string;
}
const PRESET_STYLES: PresetStyle[] = [
  {
    id: "cute-crayon-sticker",
    label: "可爱蜡笔贴纸",
    description: "圆润扁平马卡龙配色,粗柔和彩色描边,纯白背景贴纸集合,萌趣治愈。",
    refImage: styleCuteCrayon,
  },
  {
    id: "modern-watercolor",
    label: "现代水彩",
    description: "柔和水彩晕染与半透明色块,低饱和自然色系,极简留白,现代编辑插画质感。",
    refImage: styleModernWatercolor,
  },
  {
    id: "hand-drawn-color",
    label: "手绘彩色线条",
    description: "圆润扁平马卡龙配色,粗柔和彩色描边,纯白背景贴纸集合,萌趣治愈。",
    refImage: styleHandDrawnColor,
  },
  {
    id: "healing-hand-drawn",
    label: "治愈手绘绘本",
    description: "极简治愈系手绘绘本插画风格，细腻铅笔线稿，线条自然略带手绘抖动感，淡彩水彩晕染，奶油色低饱和配色。",
    refImage: styleHealingHandDrawn,
  },
  {
    id: "dreamcore-kawaii-Pencil",
    label: "梦核× Kawaii × 日系软萌插画",
    description: "柔焦梦幻、发光感和粉彩童话氛围",
    refImage: styleDreamcoreKawaii,
  },
  {
    id: "plush-watercolor",
    label: "毛绒晕染水彩",
    description: "毛绒晕染水彩风格，柔和水彩晕染与半透明色块，低饱和自然色系，极简留白，现代编辑插画质感。",
    refImage: stylePlushWatercolor,
  },
];

/** 后端 icBatchPublicView 的视图形状(前端侧) */
interface IllustrationBatch {
  batchId: string;
  teamId: string;
  status: "running" | "done" | "error";
  error?: string | null;
  name: string;
  mode: "text" | "image";
  styleRefUrl: string | null;
  item: {
    status: "pending" | "done" | "error";
    url?: string | null;
    originalUrl?: string | null;
    error?: string | null;
    prompt?: string | null;
  };
  createdAt: number;
  updatedAt: number;
}

interface Props {
  knowledge?: IllustrationCreateKnowledge;
  brandLoading?: boolean;
  knowledgeLoading?: boolean;
}

export default function IllustrationCreatePage({ knowledge, brandLoading, knowledgeLoading }: Props) {
  const { teamId, navigateTab } = useCurrentTeam();
  const { user } = useAuth();
  const { refreshIllustrations } = useResourceStore();

  // ── 输入状态 ──
  const [mode, setMode] = useState<"text" | "image">("text");
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [refFile, setRefFile] = useState<File | null>(null);
  const [refPreview, setRefPreview] = useState<string>("");
  const [selectedStyleId, setSelectedStyleId] = useState<string>(PRESET_STYLES[0].id);
  const selectedStyleRefUrl = PRESET_STYLES.find((s) => s.id === selectedStyleId)?.refImage || PRESET_STYLES[0].refImage;

  // ── 批次状态 ──
  const [batch, setBatch] = useState<IllustrationBatch | null>(null);
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
  const batchDone = !!batch && batch.status === "done";
  const hasSuccess = !!batch && batch.item?.status === "done" && !!batch.item?.url;
  const canSubmit =
    !!name.trim()
    && (mode === "image" ? !!refFile : !!prompt.trim())
    && !!selectedStyleRefUrl
    && !batchRunning && !submitting
    && !brandLoading && !knowledgeLoading;

  // ── 生图自动重试(1 次) ──
  const { resetRetries, tryAutoRetry } = useImageRetry({
    maxRetries: 1,
    getKey: () => batch?.batchId ?? "",
    retryFn: (_it, isAutoRetry) => retry(isAutoRetry),
    onFailed: (item, errMsg) => {
      setBatch((b) => b ? { ...b, item: { ...b.item, status: "error", error: errMsg || "生成失败,请重试" } } : b);
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
          item: { ...b.item, status: "error", error: "生成超时,可重试" },
        } : b);
        stopPolling();
        return;
      }
      try {
        const url = teamApi(teamId).illustrationCreateBatchUrl(batchId);
        const res = await fetch(url, { credentials: "include" });
        if (res.status === 404) { setError("批次已过期,请重新生成"); setBatch(null); stopPolling(); return; }
        if (!res.ok) return;
        const data: IllustrationBatch = await res.json();
        setBatch(data);
        if (data.item?.status === "error") {
          tryAutoRetry(data.item, data.item?.error || "生成失败");
        }
        if (data.status === "done") stopPolling();
      } catch { /* 网络错误继续 */ }
    }, POLL_MS);
  }, [teamId, stopPolling, resetRetries, tryAutoRetry]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  // 输入变化(名称/描述/参考图/风格/模式)→ 清空旧批次,让底部按钮回到「生成」
  useEffect(() => {
    setBatch(null);
    stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, prompt, refFile, selectedStyleId, mode]);

  // ── 参考图上传 ──
  async function onPickRef(list: FileList | null) {
    if (!list?.length) return;
    const raw = list[0];
    const compressed = await compressForUpload(raw);
    setRefFile(compressed);
    setRefPreview(URL.createObjectURL(compressed));
    if (refInputRef.current) refInputRef.current.value = "";
  }

  function clearRef() {
    if (refPreview) URL.revokeObjectURL(refPreview);
    setRefFile(null);
    setRefPreview("");
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
      // 风格参考图 URL(两种模式共用):文生图作为唯一参考图,图生图作为第二张参考图(转绘目标风格)
      fd.append("styleRefUrl", selectedStyleRefUrl);
      if (prompt.trim()) fd.append("prompt", prompt.trim());
      if (mode === "image" && refFile) {
        fd.append("image", refFile);
      }
      if (brandLogo) fd.append("brandLogo", brandLogo);
      if (brandSlogan) fd.append("brandSlogan", brandSlogan);

      const res = await fetch(teamApi(teamId).illustrationCreateUrl, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) {
        // 402 余额不足 → 抛出让 catch 提示
        if (res.status === 402) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || "喵币不足，请充值后再试");
        }
        const t = await res.text().catch(() => "");
        throw new Error(`请求失败 (HTTP ${res.status})${t ? `: ${t.slice(0, 120)}` : ""}`);
      }
      const data: IllustrationBatch = await res.json();
      setBatch(data);
      if (data.status === "running" && data.batchId) startPolling(data.batchId);
    } catch (e: any) {
      setError(e?.message || "提交失败,请重试");
    } finally {
      setSubmitting(false);
    }
  }

  // ── 单图重试 ──
  async function retry(isAutoRetry = false) {
    if (!batch || !teamId) return;
    if (!isAutoRetry) {
      setBatch((b) => b ? { ...b, status: "running", item: { ...b.item, status: "pending", error: null } } : b);
    }
    try {
      const url = teamApi(teamId).illustrationCreateRegenerateUrl(batch.batchId);
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({}) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      startPolling(batch.batchId);
    } catch (e: any) {
      setBatch((b) => b ? { ...b, status: "error", item: { ...b.item, status: "error", error: e?.message || "重试失败" } } : b);
    }
  }

  // ── 保存到插画库 ──
  async function saveToLibrary() {
    if (!batch?.item?.url) return;
    try {
      await teamApi(teamId!).createIllustration({
        name: name.trim() || "未命名插画",
        image: batch.item.url,
        tags: [selectedStyleId],
      });
      await refreshIllustrations();
      showToast("已保存到插画库", "success");
      resetWorkspace();
      navigateTab("illustrations");
    } catch (e: any) {
      setError(`保存失败: ${e?.message || ""}`);
    }
  }

  /** 清空整个工作台填写内容,回到全新可填写状态 */
  function resetWorkspace() {
    if (refPreview) URL.revokeObjectURL(refPreview);
    setName("");
    setPrompt("");
    setRefFile(null);
    setRefPreview("");
    setSelectedStyleId(PRESET_STYLES[0].id);
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
            <h1 className="text-[15px] font-medium text-gray-800 min-h-7 flex items-center gap-2">插画创作</h1>
            <span className="text-[10px] text-gray-500">文字生图 / 参考图生图 → 按风格参考图生成 1:1 插画,可存入插画库</span>
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
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="如:山间记忆 · 手绘对照" className={inputCls} />
            </div>

            {/* 风格库(文生图 / 图生图 共用):选择风格参考图决定生成效果 */}
            <div>
              <label className={labelCls}>
                风格库 <span className="text-red-500">*</span>
                <span className="text-gray-400 normal-case tracking-normal ml-1">选择风格参考图</span>
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {PRESET_STYLES.map((s) => {
                  const active = selectedStyleId === s.id;
                  return (
                    <button key={s.id} type="button" disabled={batchRunning}
                      onClick={() => setSelectedStyleId(s.id)}
                      className={`group relative rounded-xl border overflow-hidden transition-all ${active ? "border-primary-500 ring-2 ring-primary-200" : "border-gray-200 hover:border-gray-300"} ${batchRunning ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}>
                      {/* 风格参考图 */}
                      <div className="aspect-square bg-gray-100 overflow-hidden">
                        <img src={s.refImage} alt={s.label} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                      </div>
                      {/* 风格名(底部浮层) */}
                      <div className={`absolute inset-x-0 bottom-0 px-2 py-1.5 ${active ? "bg-primary-500/90" : "bg-black/40"} backdrop-blur-sm`}>
                        <span className="text-[11px] font-medium text-white">{s.label}</span>
                      </div>
                      {/* 选中标记 */}
                      {active && (
                        <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-primary-500 flex items-center justify-center">
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-gray-400 mt-1.5">所选风格参考图将作为风格基准,生成对应风格的插画</p>
            </div>

            {/* 文生图:插画描述 */}
            {mode === "text" && (
              <div>
                <label className={labelCls}>插画描述 <span className="text-red-500">*</span></label>
                <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4}
                  placeholder="描述你想画的插画内容,如:一座被云雾环绕的远山,山脚下有一座小木屋,门前坐着一只猫" className={`${inputCls} resize-none`} />
                <span className="text-[10px] text-gray-400">所选风格将自动与品牌风格融合,生成 1:1 白底插画</span>
              </div>
            )}

            {/* 图生图:参考图 + 补充描述 */}
            {mode === "image" && (
              <>
                <div>
                  <label className={labelCls}>参考图 <span className="text-red-500">*</span></label>
                  {refPreview ? (
                    <div className="relative inline-block group">
                      <div className="w-40 rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
                        <img src={refPreview} alt="参考图" className="w-40 h-40 object-cover" />
                      </div>
                      {!batchRunning && (
                        <button onClick={clearRef}
                          className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/50 text-white text-[12px] opacity-0 group-hover:opacity-100 transition-opacity leading-none">×</button>
                      )}
                    </div>
                  ) : (
                    <label className={`w-40 h-40 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 flex flex-col items-center justify-center cursor-pointer hover:border-primary-400 transition-colors ${batchRunning ? "opacity-50 cursor-not-allowed" : ""}`}>
                      <span className="text-2xl text-gray-400">+</span>
                      <span className="text-[10px] text-gray-400 mt-1">上传参考图</span>
                      <input ref={refInputRef} type="file" accept="image/*" className="hidden" disabled={batchRunning}
                        onChange={(e) => void onPickRef(e.target.files)} />
                    </label>
                  )}
                  <div><span className="text-[10px] text-gray-400">上传一张照片,系统将按所选风格生成对照插画</span></div>
                </div>

                <div>
                  <label className={labelCls}>补充描述(可选)</label>
                  <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={2}
                    placeholder="可补充画面细节要求,如色调、元素取舍等" className={`${inputCls} resize-none`} />
                </div>
              </>
            )}

            {/* 预览(本次将生成) */}
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-[11px] text-gray-600">
              将生成 <span className="font-medium text-primary-600">1</span> 张 1:1 插画
              <span> · 风格: {PRESET_STYLES.find((s) => s.id === selectedStyleId)?.label}</span>
            </div>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-[12px] text-red-600">⚠ {error}</div>
            )}
          </div>
        </div>

        {/* 底部行动按钮 */}
        <div className="shrink-0 border-t border-gray-200 bg-white px-5 pt-3 pb-4 space-y-2">
          {hasSuccess && !batchRunning && !submitting ? (
            <div className="flex flex-col items-center gap-2">
              <GenerateButton label="保存到插画库" loading={false} estimatedCoins={0} onClick={saveToLibrary} />
              <button onClick={resetWorkspace} className="text-[11px] text-gray-500 hover:text-primary-600 transition-colors">
                继续创作(清空)
              </button>
            </div>
          ) : (
            <GenerateButton label="立即生成" loading={submitting || batchRunning} disabled={!canSubmit}
              estimatedCoins={AI_COST_PER_IMAGE} userCoins={user?.coins} onClick={submit} />
          )}
          {batchRunning && batch && (
            <div className="text-[11px] text-gray-500 mt-1 text-center">生成中…</div>
          )}
        </div>
      </div>

      {/* 右:结果 */}
      <aside className="border-l border-gray-200 bg-gray-50 overflow-y-auto min-h-0 p-5 space-y-5">
        {!batch && !submitting && (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white text-center text-[12px] text-gray-400 px-6 py-12">
            {mode === "text" ? "填写名称与插画描述,选择风格后" : "上传参考图并选择风格后"}<br />点击底部「立即生成」
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
            <div className="text-[10px] uppercase tracking-wider text-gray-500">插画结果</div>
            <div className="mx-auto w-full max-w-[380px] aspect-square rounded-xl border border-gray-200 bg-white overflow-hidden">
              {batch.item?.status === "pending" && (
                <div className="w-full h-full flex items-center justify-center flex-col gap-1">
                  <div className="w-8 h-8 border-2 border-primary-200 border-t-primary-500 rounded-full animate-spin" />
                  <span className="text-[12px] text-gray-400">生成中…</span>
                </div>
              )}
              {batch.item?.status === "done" && batch.item.url && (
                <img src={batch.item.url} alt="插画结果" className="w-full h-full object-contain cursor-zoom-in"
                  onClick={() => preview.open([{ url: batch.item.url!, label: "插画结果" }], 0)} />
              )}
              {batch.item?.status === "error" && (
                <div className="w-full h-full flex items-center justify-center flex-col gap-1 px-4 text-center">
                  <span className="text-[12px] text-red-500">{batch.item.error || "生成失败"}</span>
                  <button onClick={() => void retry(false)} className="text-[12px] text-primary-600 underline hover:text-primary-700">重试</button>
                </div>
              )}
            </div>

            {/* 参考图(仅 image 模式) */}
            {mode === "image" && refPreview && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">参考图</div>
                <div className="relative inline-block">
                  <div className="w-24 rounded-lg border border-gray-200 bg-white overflow-hidden">
                    <img src={refPreview} alt="参考图" className="w-24 h-24 object-cover" />
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </aside>

      {/* 全屏大图预览(页面级单点渲染) */}
      {preview.modal}
    </div>
  );
}

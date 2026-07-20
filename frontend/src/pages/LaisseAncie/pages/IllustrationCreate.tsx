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
import type { UserIllustrationStyle } from "../lib/api";
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

const POLL_MS = 3000;
// 对齐后端 IC_BATCH_TTL_MS = 15min,略小于 TTL 避免与清理竞争
const POLL_MAX_ATTEMPTS = 290;

// 风格卡片形状:全部为用户上传的风格(≤10 条/团队,文件持久化)。
type StyleCard = {
  id: string;
  label: string;
  description: string;
  refImage: string;
  createdAt: number;
};

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
  // 用户上传风格(文件持久化,≤10 条/团队)。
  const [userStyles, setUserStyles] = useState<UserIllustrationStyle[]>([]);
  // 当前选中的风格 id(用户风格加载后默认选中第一条,无风格则为空)。
  const [selectedStyleId, setSelectedStyleId] = useState<string>("");
  const [userStylesLoading, setUserStylesLoading] = useState(false);
  // 展开的「我的风格」面板 + 上传草稿状态
  const [myPanelOpen, setMyPanelOpen] = useState(false);
  const [usLabel, setUsLabel] = useState("");
  const [usDesc, setUsDesc] = useState("");
  const [usFile, setUsFile] = useState<File | null>(null);
  const [usPreview, setUsPreview] = useState("");
  const [usUploading, setUsUploading] = useState(false);
  const [usError, setUsError] = useState<string | null>(null);
  const usInputRef = useRef<HTMLInputElement>(null);

  // 风格列表 = 用户上传(≤10 条/团队),无预置。
  const allStyles: StyleCard[] = userStyles.map((u) => ({ id: u.id, label: u.label, description: u.description, refImage: u.refImage, createdAt: u.createdAt }));
  const selectedStyleRefUrl = allStyles.find((s) => s.id === selectedStyleId)?.refImage || null;
  const selectedStyle = allStyles.find((s) => s.id === selectedStyleId) || null;
  const canAddUserStyle = userStyles.length < 10;

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

  // ── 加载用户风格(团队切换时重拉) ──
  const loadUserStyles = useCallback(async () => {
    if (!teamId) return;
    setUserStylesLoading(true);
    try {
      const { items } = await teamApi(teamId).listIllustrationStyles();
      setUserStyles(items);
      // 默认选中第一条风格(首次加载或团队切换时重置)。
      setSelectedStyleId(items[0]?.id ?? "");
    } catch (e) {
      console.warn('[illustration-create] load user styles failed:', e);
    } finally {
      setUserStylesLoading(false);
    }
  }, [teamId]);

  useEffect(() => { void loadUserStyles(); }, [loadUserStyles]);

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

  // ── 用户风格上传 ──
  async function onPickUsFile(list: FileList | null) {
    if (!list?.length) return;
    const raw = list[0];
    try {
      const compressed = await compressForUpload(raw);
      setUsFile(compressed);
      setUsPreview(URL.createObjectURL(compressed));
      setUsError(null);
    } catch {
      setUsError("图片处理失败,请换一张重试");
    }
    if (usInputRef.current) usInputRef.current.value = "";
  }

  function clearUsDraft() {
    if (usPreview) URL.revokeObjectURL(usPreview);
    setUsFile(null);
    setUsPreview("");
    setUsLabel("");
    setUsDesc("");
    setUsError(null);
    if (usInputRef.current) usInputRef.current.value = "";
  }

  async function submitUserStyle() {
    if (!teamId || usUploading) return;
    if (!usLabel.trim()) { setUsError("请填写风格名称"); return; }
    if (!usFile) { setUsError("请选择风格参考图"); return; }
    setUsUploading(true);
    setUsError(null);
    try {
      const fd = new FormData();
      fd.append("file", usFile);
      fd.append("label", usLabel.trim());
      if (usDesc.trim()) fd.append("description", usDesc.trim());
      const { item } = await teamApi(teamId).uploadIllustrationStyle(fd);
      setUserStyles((prev) => [...prev, item]);
      // 刚上传的风格自动选中,给用户即时反馈
      setSelectedStyleId(item.id);
      clearUsDraft();
      showToast("风格添加成功", "success");
    } catch (e: any) {
      const msg = e?.message || "添加失败";
      // 后端 409 LIMIT_EXCEEDED → 给出明确上限提示
      setUsError(String(msg).includes("最多保存") ? msg : `添加失败: ${msg}`);
    } finally {
      setUsUploading(false);
    }
  }

  async function removeUserStyle(id: string) {
    if (!teamId) return;
    // 直接确认;影响范围仅限用户自己的风格(预置不可删,不可能命中此分支)
    try {
      await teamApi(teamId).deleteIllustrationStyle(id);
      setUserStyles((prev) => {
        const next = prev.filter((s) => s.id !== id);
        // 选中项被删除 → 回退到第一条剩余风格,或清空。
        if (selectedStyleId === id) setSelectedStyleId(next[0]?.id ?? "");
        return next;
      });
      showToast("已删除该风格", "success");
    } catch (e: any) {
      setError(`删除失败: ${e?.message || ""}`);
    }
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
    setSelectedStyleId(userStyles[0]?.id ?? "");
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
                {allStyles.map((s) => {
                  const active = selectedStyleId === s.id;
                  return (
                    <div key={s.id} className="relative">
                      <button type="button" disabled={batchRunning}
                        onClick={() => setSelectedStyleId(s.id)}
                        title={s.description || s.label}
                        className={`group relative w-full rounded-xl border overflow-hidden transition-all ${active ? "border-primary-500 ring-2 ring-primary-200" : "border-gray-200 hover:border-gray-300"} ${batchRunning ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}>
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
                      {/* 删除按钮(浮在右上角,仅生成空闲时 hover 显示) */}
                      {!batchRunning && (
                        <button type="button" onClick={() => void removeUserStyle(s.id)}
                          title="删除该风格"
                          className="absolute -top-1.5 -right-1.5 z-10 w-5 h-5 rounded-full bg-red-500 text-white text-[11px] leading-none flex items-center justify-center shadow hover:bg-red-600 opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                      )}
                    </div>
                  );
                })}
                {/* 添加卡片(与风格图同尺寸),点击展开下拉上传表单 */}
                <div className="relative">
                  <button type="button" onClick={() => setMyPanelOpen((v) => !v)} disabled={!canAddUserStyle}
                    title={canAddUserStyle ? "添加新风格" : "已达上限 10 个"}
                    className={`w-full aspect-square rounded-xl border-2 border-dashed flex flex-col items-center justify-center transition-colors ${canAddUserStyle ? "border-gray-300 bg-gray-50 hover:border-primary-400 cursor-pointer" : "border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed"}`}>
                    <span className="text-2xl text-gray-400 leading-none">+</span>
                    <span className="text-[10px] text-gray-400 mt-1">添加风格</span>
                  </button>
                </div>
              </div>
              <p className="text-[10px] text-gray-400 mt-1.5">所选风格参考图将作为风格基准,生成对应风格的插画</p>
            </div>

            {/* 添加风格下拉表单(点击网格中「+」卡片展开) */}
            {myPanelOpen && (
              <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-3 space-y-2.5">
                <div className="text-[11px] font-medium text-gray-600">添加新风格 <span className="font-normal text-gray-400">{userStyles.length}/10</span></div>
                <div className="flex items-start gap-2">
                  {/* 图预览 / 上传入口 */}
                  {usPreview ? (
                    <div className="relative w-16 h-16 rounded-lg border border-gray-200 overflow-hidden shrink-0">
                      <img src={usPreview} alt="预览" className="w-full h-full object-cover" />
                      {!usUploading && (
                        <button type="button" onClick={clearUsDraft} className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/50 text-white text-[10px] leading-none">×</button>
                      )}
                    </div>
                  ) : (
                    <label className={`w-16 h-16 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 flex flex-col items-center justify-center cursor-pointer hover:border-primary-400 transition-colors shrink-0 ${usUploading ? "opacity-50 cursor-not-allowed" : ""}`}>
                      <span className="text-lg text-gray-400 leading-none">+</span>
                      <span className="text-[9px] text-gray-400 mt-0.5">参考图</span>
                      <input ref={usInputRef} type="file" accept="image/*" className="hidden" disabled={usUploading}
                        onChange={(e) => void onPickUsFile(e.target.files)} />
                    </label>
                  )}
                  <div className="flex-1 space-y-1.5 min-w-0">
                    <input value={usLabel} onChange={(e) => setUsLabel(e.target.value)} placeholder="风格名称 *"
                      className="w-full text-[11px] border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-primary-500" maxLength={40} />
                    <input value={usDesc} onChange={(e) => setUsDesc(e.target.value)} placeholder="风格描述(可选)"
                      className="w-full text-[11px] border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-primary-500" maxLength={120} />
                  </div>
                </div>
                {usError && <div className="text-[10px] text-red-500">⚠ {usError}</div>}
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-400">{canAddUserStyle ? `还可添加 ${10 - userStyles.length} 个` : "已达上限 10 个"}</span>
                  <div className="flex items-center gap-1.5">
                    <button type="button" onClick={() => { clearUsDraft(); setMyPanelOpen(false); }} disabled={usUploading}
                      className="px-2.5 py-1 rounded-md text-[11px] text-gray-500 hover:text-gray-700">取消</button>
                    <button type="button" onClick={submitUserStyle} disabled={usUploading || !canAddUserStyle}
                      className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed">
                      {usUploading ? "添加中…" : "添加"}
                    </button>
                  </div>
                </div>
              </div>
            )}

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
              <span> · 风格: {selectedStyle?.label ?? "未选择"}</span>
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

/**
 * MaterialCombo ——「材料组合」工作台(矩阵扩展版)。
 *
 * 输入:m 张面料(1–6) × n 张款式(1–6) → m×n 张白底效果图(上限 36 张)。
 * 后端异步批次 + 前端轮询:上传+Ark 分析后 202 立即返回,fire-and-forget 后台生成。
 * 每张图独立 m×n 网格展示,失败可单独重试(timeout 接口自动重试 1 次).
 * 保存到 Lookbook:本批次所有成功图写入同一个 Product 的 images 数组。
 *
 * 每个槽位可以是「上传文件」或「从库选择」:
 *   - 上传:file → 后端 Ark 分析 → {url,name,text}
 *   - 库面料:端合成文本 → {url,name,text}(from colorImages / image / colors)
 *   - 库款式:后端合成文本 → {url,name,text}
 * 提交时前端把 fabricsMeta/stylesMeta 随文件一起发,后端按位置混合。
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { useCurrentTeam } from "../../../contexts/CurrentTeamContext";
import { teamApi } from "../lib/api";
import type { MaterialComboBatch } from "../lib/api";
import { useDesignStore } from "../store/design";
import type { KnowledgeDeps } from "../../DashboardPage/knowledge-injectors";
import { compressForUpload } from "../lib/images";
import { Modal } from "../components/ui";
import {
  GenerateButton,
  AI_COST_PER_IMAGE,
} from "../../../components/GenerateButton";
import { useAuth } from "../../../contexts/AuthContext";
import { useMaterialComboTour } from "../controller/useMaterialComboTour";
import TourOverlay, { type TourStep } from "../components/TourOverlay";
import { useImageRetry } from "../../../hooks/useImageRetry";
import { useImagePreview } from "../../../components/ImagePreviewModal";

// ─── 上限约束(与后端同步) ─────────────────────────────────────
const MAX_FABRIC = 6;   // 面料上限
const MAX_STYLE = 6;    // 款式上限
const MAX_CELLS = MAX_FABRIC * MAX_STYLE; // 36 张上限
const MAX_FABRIC_MIXED = 12; // 拼色模式面料软上限
const POLL_MS = 3000;   // 轮询间隔
// 轮询上限需覆盖后端批次真实生成时间:后端 MC_BATCH_TTL_MS = 15min,
// 单图最长 180s、并发上限 MC_BATCH_CAP=4,正常批次(尤其多格)可能耗时数分钟。
// 原先 120 次(6min)过短,会在生图仍在进行时误判「生成超时」,表现为一直「生成中…」。
// 这里对齐到略小于后端 TTL(15min),避免与后端清理竞争,让正常批次能跑完。
const POLL_MAX_ATTEMPTS = 290; // 最长轮询 ≈14.5 分钟

type Mode = "cross" | "color-mix";

// ─── 槽位 discriminated union ─────────────────────────────────
type FabricRow =
  | {
    kind: "upload";
    id: string;
    file: File;
    preview: string;
    name: string;
    analysisText?: string;
  }
  | {
    kind: "library-fabric";
    id: string;
    matId: string;
    colorIdx: number;
    name: string;
    url: string;
    hex?: string;
    analysisText?: string;
  }
  | { kind: "text"; id: string; name: string; description: string; url?: string; analysisText?: string };

type StyleRow =
  | { kind: "upload"; id: string; file: File; preview: string; name: string; analysisText?: string }
  | { kind: "library-style"; id: string; styleId: string; name: string; url: string; analysisText?: string };

interface Props {
  knowledge?: KnowledgeDeps;
  brandLoading?: boolean;
  knowledgeLoading?: boolean;
}

// ─── 库选择器中扁平化的面料色卡 ───────────────────────────────
interface FlatFabricCard {
  matId: string;
  matCategory: string;
  matName: string;
  colorIdx: number;
  url: string;
  hex?: string;
  colorName?: string; // 卡片独立名(来自 colorImages[].name)
  shared?: boolean; // 管理员共享 → 显示「系统」标签
}

interface FabricPick { kind: "fabric"; matId: string; colorIdx: number; url: string; name: string; hex?: string }
interface StylePick { kind: "style"; styleId: string; url: string; name: string }
type Pick = FabricPick | StylePick;

// 轮询/提交返回中,服务端会把每张面料/款式的分析文本回填到 fabrics[i].text / styles[i].text
// (见文件头注释:上传/库面料 → {url,name,text})。MaterialComboBatch 基础类型未含该字段,
// 这里派生一个带 text? 的视图类型,供回写分析文本到槽位时安全访问。
type BatchWithText = Omit<MaterialComboBatch, "fabrics" | "styles"> & {
  fabrics: (MaterialComboBatch["fabrics"][number] & { text?: string })[];
  styles: (MaterialComboBatch["styles"][number] & { text?: string })[];
};

export default function MaterialComboPage({ knowledge, brandLoading, knowledgeLoading }: Props) {
  const { teamId, navigateTab } = useCurrentTeam();
  const { user } = useAuth();
  const store = useDesignStore();

  // ── 上传/库槽位 ──
  const [fabricRows, setFabricRows] = useState<FabricRow[]>([]);
  const [fabricText, setFabricText] = useState("");
  const [styleRows, setStyleRows] = useState<StyleRow[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [picker, setPicker] = useState<null | "fabric" | "style">(null);
  const [mode, setMode] = useState<Mode>("cross");

  // 切换生成模式(叉乘 / 拼色):清空批次,保留槽位(名称/面料/款式/描述/文字)
  function switchMode(next: Mode) {
    if (next === mode) return;
    setBatch(null);
    setError(null);
    setMode(next);
    if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null; }
  }

  // ── 批次状态 ──(必须在 tour 之前声明,因为 tour.startTour 可能调用 setBatch)
  const [batch, setBatch] = useState<MaterialComboBatch | null>(null);
  const [submitting, setSubmitting] = useState(false); // POST 提交中
  const [error, setError] = useState<string | null>(null);

  // ── 新手引导 ──
  const tour = useMaterialComboTour({
    mode,
    setName,
    setDescription,
    setFabricRows,
    setStyleRows,
    setBatch,
    switchMode,
  });

  const fabricRef = useRef<HTMLInputElement>(null);
  const styleRef = useRef<HTMLInputElement>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollAttempts = useRef(0);

  // ── 派生态 ──
  const batchDone = !!batch && batch.status === "done";
  const batchRunningOrAnalyzing = !!batch && batch.status === "running";
  // 叉乘模式:m×n;拼色模式:1
  const cellCount = mode === "color-mix" ? (fabricRows.length > 0 && styleRows.length === 1 ? 1 : 0) : fabricRows.length * styleRows.length;
  const fabricsLimit = mode === "color-mix" ? MAX_FABRIC_MIXED : MAX_FABRIC;
  const stylesLimit = mode === "color-mix" ? 1 : MAX_STYLE;
  const canSubmit = !!name.trim()
    && fabricRows.length > 0
    && (mode === "color-mix" ? styleRows.length === 1 : styleRows.length > 0)
    && cellCount > 0 && cellCount <= (mode === "color-mix" ? 1 : MAX_CELLS)
    && !batchRunningOrAnalyzing && !submitting
    && !brandLoading && !knowledgeLoading;

  // ── 生图自动重试 ──(必须在 startPolling/stopPolling 之前,因为二者依赖 tryAutoRetry/resetRetries)
  const { resetRetries, tryAutoRetry } = useImageRetry({
    maxRetries: 1,
    getKey: (it) => `${it.fi}-${it.si}`,
    retryFn: (item, isAutoRetry) => retryCell(item.fi, item.si, isAutoRetry),
    onFailed: (item, error) => {
      // 错误局部化到对应格子下方,不显示在左侧全局
      setBatch((b) => {
        if (!b) return b;
        return { ...b, items: b.items.map((it) => it.fi === item.fi && it.si === item.si ? { ...it, status: "error", error: error || "生成失败,请重试" } : it) };
      });
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
        // 超时:标记 pending 格子为可重试的错误(错误局部化到格子,不显示左侧全局)
        setBatch((b) => b ? {
          ...b,
          status: "done",
          items: b.items.map((it) => it.status === "pending" ? { ...it, status: "error", error: "生成超时,可重试" } : it),
        } : b);
        stopPolling();
        return;
      }
      try {
        const url = teamApi(teamId).materialComboBatchUrl(batchId);
        const res = await fetch(url, { credentials: "include" });
        // 批次已不存在(后端进程重启 / 超过 TTL 被清理):必须清掉 running 态,
        // 否则 batchRunningOrAnalyzing 恒为 true,按钮永远显示「生成中…」、格子一直待处理。
        if (res.status === 404) {
          setError("批次已过期,请重新生成");
          setBatch(null);
          stopPolling();
          return;
        }
        if (!res.ok) return; // 网络抖动继续轮询
        const data: BatchWithText = await res.json();
        // 回写分析文本到对应槽位(按位置对齐,含库位)
        setFabricRows((prev) => prev.map((r, i) => data.fabrics[i]?.text != null ? { ...r, analysisText: data.fabrics[i].text } : r));
        setStyleRows((prev) => prev.map((r, i) => data.styles[i]?.text != null ? { ...r, analysisText: data.styles[i].text } : r));
        setBatch(data);
        // 轮询发现失败的格子 → 通过共享 hook 自动重试
        if (data.items) {
          for (const it of data.items) {
            if (it.status === "error") {
              tryAutoRetry(it, it.error || "生成失败");
            }
          }
        }
        if (data.status === "done") stopPolling();
      } catch { /* 网络错误继续 */ }
    }, POLL_MS);
  }, [teamId, stopPolling, resetRetries, tryAutoRetry]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  // 大图预览(单点声明,页面内多处复用)
  const preview = useImagePreview();

  // 新用户自动触发引导(延迟一帧入场,让页面先渲染)
  useEffect(() => {
    if (tour.shouldRegister && !tour.tourActive) {
      const t = setTimeout(() => tour.startTour(), 300);
      return () => clearTimeout(t);
    }
  }, [tour.shouldRegister, tour.tourActive]);

  // 槽位数量变化(用户增删面料/款式)→ 清空旧批次,让底部按钮回到「生成」而非「保存」
  useEffect(() => {
    setBatch(null);
    stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fabricRows.length, styleRows.length]);

  // ── 唯一 id ──
  const uid = useCallback(() => `r-${Date.now().toString()}-${Math.random().toString(36).slice(2, 7)}`, []);

  // ── 追加上传文件 ──
  function addUploads(
    which: "fabric" | "style",
    list: FileList | null,
  ) {
    if (!list || !list.length) return;
    const incoming = Array.from(list);
    const setter = (which === "fabric" ? setFabricRows : setStyleRows) as unknown as
      (updater: (prev: FabricRow[] | StyleRow[]) => (FabricRow | StyleRow)[]) => void;
    const limit =
      which === "fabric" ? fabricsLimit : stylesLimit;
    const label = which === "fabric" ? "面料" : "款式";
    setter((prev) => {
      const room = limit - prev.length;
      if (room <= 0) {
        setError(`${label}已达上限 ${limit} 项`);
        return prev;
      }
      const accepted = incoming.slice(0, room);
      if (incoming.length > room)
        setError(`${label}最多容纳 ${limit} 项,已取前 ${room} 个`);
      const newRows = accepted.map((file) => ({
        kind: "upload" as const,
        id: uid(),
        file,
        preview: URL.createObjectURL(file),
        name: file.name,
      }));
      return [...prev, ...newRows];
    });
  }

  // ── 追加库选择 ──
  function addLibraryFabric(pick: FabricPick) {
    if (fabricRows.length >= fabricsLimit) { setError(`面料已达上限 ${fabricsLimit} 项`); return; }
    // 同一面料颜色去重
    if (fabricRows.some((r) => r.kind === "library-fabric" && r.matId === pick.matId && r.colorIdx === pick.colorIdx)) {
      setError("该面料颜色已添加"); return;
    }
    setFabricRows((prev) => [...prev, {
      kind: "library-fabric", id: uid(), matId: pick.matId, colorIdx: pick.colorIdx,
      name: pick.name, url: pick.url, hex: pick.hex,
    }]);
  }

  function addLibraryStyle(pick: StylePick) {
    if (styleRows.length >= stylesLimit) { setError(`款式已达上限 ${stylesLimit} 项`); return; }
    if (styleRows.some((r) => r.kind === "library-style" && r.styleId === pick.styleId)) {
      setError("该款式已添加"); return;
    }
    setStyleRows((prev) => [...prev, {
      kind: "library-style", id: uid(), styleId: pick.styleId, name: pick.name, url: pick.url,
    }]);
  }

  function removeRow(which: "fabric" | "style", id: string) {
    const setter = (which === "fabric" ? setFabricRows : setStyleRows) as unknown as
      (updater: (prev: FabricRow[] | StyleRow[]) => (FabricRow | StyleRow)[]) => void;
    setter((prev) => {
      const item = prev.find((r) => r.id === id);
      if (item?.kind === "upload") URL.revokeObjectURL(item.preview);
      return prev.filter((r) => r.id !== id);
    });
  }

  // ── 提交批次 ──
  async function submit() {
    if (!canSubmit || !teamId) return;
    setSubmitting(true);
    setError(null);
    setBatch(null);
    stopPolling();
    try {
      // fabricsMeta / stylesMeta 按槽位顺序对齐,上传文件仅含 upload 行(顺序一致)
      // text 类型面料:传文字描述,无文件消耗
      const fabricsMeta = fabricRows.map((r) => {
        if (r.kind === "upload") return { kind: "upload", name: r.name };
        if (r.kind === "text")
          return {
            kind: "text",
            description: r.description,
            name: r.description,
          };
        return {
          kind: "library-fabric",
          matId: r.matId,
          colorIdx: r.colorIdx,
          hex: r.hex,
        };
      });
      const stylesMeta = styleRows.map((r) => {
        if (r.kind === "upload") return { kind: "upload", name: r.name };
        return { kind: "library-style", styleId: r.styleId };
      });
      const fd = new FormData();
      fd.append("name", name.trim());
      fd.append("description", description.trim());
      fd.append("fabricsMeta", JSON.stringify(fabricsMeta));
      fd.append("stylesMeta", JSON.stringify(stylesMeta));
      fd.append("mode", mode);
      for (const r of fabricRows)
        if (r.kind === "upload")
          fd.append("fabrics", await compressForUpload(r.file));
      for (const r of styleRows)
        if (r.kind === "upload")
          fd.append("styles", await compressForUpload(r.file));
      const url = teamApi(teamId).materialComboUrl;
      const res = await fetch(url, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(
          `请求失败 (HTTP ${res.status})${t ? `: ${t.slice(0, 120)}` : ""}`,
        );
      }
      const data: BatchWithText = await res.json();
      setBatch(data);
      if (data.fabrics?.length) {
        setFabricRows((prev) =>
          prev.map((r, i) =>
            data.fabrics[i]?.text != null
              ? { ...r, analysisText: data.fabrics[i].text }
              : r,
          ),
        );
      }
      if (data.styles?.length) {
        setStyleRows((prev) =>
          prev.map((r, i) =>
            data.styles[i]?.text != null
              ? { ...r, analysisText: data.styles[i].text }
              : r,
          ),
        );
      }
      if (data.status === "running" && data.batchId) startPolling(data.batchId);
    } catch (e: any) {
      setError(e?.message || "提交失败,请重试");
    } finally {
      setSubmitting(false);
    }
  }

  // ── 单格重试 ──
  // isAutoRetry=true 表示由轮询中的 tryAutoRetry 触发;此时不能调 startPolling,
  // 否则会 stopPolling()+重置 pollAttempts+resetRetries(),把正在进行的轮询打断并把
  // 重试计数清零 → 形成「轮询发现 error → 自动重试 → 重启轮询+清零重试 → 再发现 error…」
  // 的无限循环,表现为格子一直「生成中…/待处理」且大模型后台收不到稳定请求。
  async function retryCell(fi: number, si: number, isAutoRetry = false) {
    if (!batch || !teamId) return;
    // optimistic:本格打回 pending,批次回到 running
    setBatch((b) => {
      if (!b) return b;
      return { ...b, status: "running", items: b.items.map((it) => it.fi === fi && it.si === si ? { ...it, status: "pending", error: undefined } : it) };
    });
    try {
      const url = teamApi(teamId).materialComboRegenerateUrl(batch.batchId);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ fi, si }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // 仅手动重试(用户点「重试」按钮)时重启轮询;自动重试时轮询仍在进行,不重启
      if (!isAutoRetry) startPolling(batch.batchId);
    } catch (e: any) {
      // 使用共享 hook 决定是否自动重试
      const item = batch.items.find((it) => it.fi === fi && it.si === si);
      if (item && !isAutoRetry) {
        tryAutoRetry(item, e?.message || "重试失败");
      } else if (isAutoRetry) {
        setBatch((b) => {
          if (!b) return b;
          return { ...b, items: b.items.map((it) => it.fi === fi && it.si === si ? { ...it, status: "error", error: e?.message || "生成失败,请重试" } : it) };
        });
      }
    }
  }

  // ── 保存到 Lookbook(多图) ──
  async function saveToLookbook() {
    if (!batch) return;
    const doneItems = batch.items.filter((it) => it.status === "done" && it.url);
    if (!doneItems.length) { setError("暂无成功生成的图片"); return; }
    const now = new Date().toISOString();
    const brandColors = (knowledge?.brand?.colors || []).map((c: any) => c?.bg || c).filter(Boolean);
    const mixName = batch.fabrics?.slice(0, 6).map((f) => (f?.name || "").split("·")[0].trim()).filter(Boolean).join(" + ");
    // 参考图来源(仅「库」来源保留,上传项为 undefined → 弹窗不展示)
    const sourceImages = doneItems.map((it) => {
      const fRow = fabricRows[it.fi];
      const sRow = styleRows[it.si];
      const src: {
        style?: { url: string; name: string };
        fabric?: { url: string; name: string };
      } = {};
      if (fRow && fRow.kind === "library-fabric") src.fabric = { url: fRow.url, name: fRow.name };
      if (sRow && sRow.kind === "library-style") src.style = { url: sRow.url, name: sRow.name };
      return Object.keys(src).length ? src : undefined;
    });
    const product: any = {
      mode: "material-combo",
      title: name || "未命名材料组合",
      description: description.trim() || "",
      colors: brandColors,
      images: doneItems.map((it) => ({
        slot: "material-combo",
        label: mode === "color-mix" && mixName ? `拼色（${mixName}）` : `面料${it.fi + 1} × 款式${it.si + 1}`,
        url: it.url!,
      })),
      sourceImages,
      aiDraftRaw: JSON.stringify({
        batchId: batch.batchId, mode, name, description,
        fabrics: batch.fabrics, styles: batch.styles, items: batch.items,
      }),
      status: "draft",
      statusHistory: [{ id: crypto.randomUUID(), status: "draft", at: now, actor: "atelier" }],
    };
    try {
      await store.upsertProduct(product);
      // 清空本次任务:停止轮询 + 清空批次,保留面料/款式槽位配置,让页面回到「可重新生成」的新一轮状态
      stopPolling();
      setBatch(null);
      setSubmitting(false);
      navigateTab("lookbook");
    } catch (e: any) {
      setError(`保存失败: ${e?.message || ""}`);
    }
  }

  function splitAnalysisTags(text?: string): string[] {
    if (!text) return [];
    return text
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .flatMap((seg) => {
        // 分离出 hex 色值单独成 tag(更醒目)
        const hexMatch = seg.match(/(#[0-9a-fA-F]{3,8})/g);
        const withoutHex = seg.replace(/#[0-9a-fA-F]{3,8}/g, "").trim();
        const out: string[] = [];
        if (withoutHex) out.push(withoutHex);
        if (hexMatch) out.push(...hexMatch);
        return out;
      });
  }

  const inputCls = "w-full text-[12px] border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-primary-500 bg-white";
  const labelCls = "text-[10px] uppercase tracking-wider text-gray-500 mb-1 block";

  const hasSuccess = !!batch && batch.completed > 0;
  // 叉乘模式扁平化:按 款式(si) 分组、再按 面料(fi) 展开,每行 = 款式 × 面料 = 结果
  const sortedCrossItems = batch && mode !== "color-mix"
    ? batch.items.slice().sort((a, b) => a.si - b.si || a.fi - b.fi)
    : [];

  // 引导步骤定义
  const tourSteps: TourStep[] = mode === 'cross'
    ? [
      { target: 'tour-name', title: '① 输入作品名称', description: '给你的材料组合取个名字,比如「春日雏菊连衣裙」。' },
      { target: 'tour-fabric', title: '② 添加面料', description: '上传面料图或从面料库选择。可添加多张面料进行叉乘组合。' },
      { target: 'tour-style', title: '③ 添加款式参考', description: '选择或上传款式参考图,系统会将每块面料与款式进行叉乘组合。' },
      { target: 'tour-generate', title: '④ 点击生成', description: '点击底部「立即生成」,系统将自动组合生成多张白底效果图。', actionLabel: '立即生成' },
      { target: 'tour-result', title: '⑤ 查看结果', description: '生成的效果图按款式×面料矩阵展示,可点击单张重试。' },
    ]
    : [
      { target: 'tour-name', title: '① 输入作品名称', description: '给你的拼色作品取个名字。' },
      { target: 'tour-fabric', title: '② 添加多块面料', description: '拼色模式下可添加多块面料(无需款式),系统会将它们拼成一张图。' },
      { target: 'tour-generate', title: '③ 点击生成', description: '点击底部「立即生成」生成拼色效果图。', actionLabel: '立即生成' },
      { target: 'tour-result', title: '④ 查看结果', description: '拼色结果展示,可重试生成。' },
    ];

  return (
    <>
      {/* 新手引导浮层 */}
      {tour.tourActive && (
        <TourOverlay
          steps={tourSteps}
          stepIdx={tour.tourStep}
          onAdvance={tour.next}
          onPrev={tour.prev}
          onSkip={tour.skip}
        />
      )}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr] h-[calc(100vh-64px)] min-h-0">
        {/* 左:表单(上中下布局) */}
        <div className="flex flex-col bg-white min-h-0">
          {/* 顶部:固定 header */}
          <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-gray-200 px-5 py-3 shrink-0">
            <div className="flex items-center justify-between">
              <h1 className="text-[15px] font-medium text-gray-800 min-h-7 flex items-center gap-2">材料组合
                {tour.shouldRegister && !tour.tourActive && (
                  <button
                    type="button"
                    onClick={tour.startTour}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-primary-50 text-primary-600 hover:bg-primary-100 transition-colors font-normal"
                  >
                    ? 新手引导
                  </button>
                )}
              </h1>
              <div className="h-7 flex items-center gap-1 bg-gray-100 rounded-lg p-0.5 text-[11px]">
                <button
                  onClick={() => switchMode("cross")}
                  className={`px-2 py-1 rounded-md ${mode === "cross" ? "bg-white text-primary-600 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                >
                  叉乘
                </button>
                <button
                  onClick={() => switchMode("color-mix")}
                  className={`px-2 py-1 rounded-md ${mode === "color-mix" ? "bg-white text-primary-600 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                >
                  拼色
                </button>
              </div>
            </div>
            <span className="text-[10px] text-gray-500">
              {mode === "cross"
                ? `m 面料 × n 款式 → m×n 白底图(≤${MAX_CELLS})`
                : `多面料 × 1 款式 → 1 张拼色图(面料≤${MAX_FABRIC_MIXED})`}
            </span>
          </header>

          {/* 中间:可滚动内容 */}
          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="p-5 space-y-5 max-w-2xl">
              {/* 名称 */}
              <div data-tour="tour-name">
                <label className={labelCls}>
                  名称 <span className="text-red-500">*</span>
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="如:春日雏菊连衣裙"
                  className={inputCls}
                />
              </div>

              {/* 面料槽位(上传 + 库)*/}
              <div data-tour="tour-fabric">
                <label className={labelCls}>
                  面料{" "}
                  <span className="text-gray-400 normal-case tracking-normal">
                    ({fabricRows.length}/{fabricsLimit})
                  </span>
                  <span className="text-red-500">*</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {fabricRows.map((row) => (
                    <div
                      key={row.id}
                      className="w-24 rounded-lg border border-gray-200 bg-gray-50 overflow-hidden relative group"
                    >
                      {row.kind === "text" ? (
                        <div className="w-24 h-24 flex flex-col items-center justify-center bg-primary-50/50 border border-primary-100 rounded-lg p-1.5 text-center">
                          <span className="text-primary-500 text-base">✎</span>
                          <span className="text-[9px] text-primary-700 mt-1 line-clamp-3 leading-tight break-all">
                            {row.description}
                          </span>
                        </div>
                      ) : row.kind === "upload" ? (
                        <img
                          src={row.preview}
                          alt={row.name}
                          className="w-24 h-20 object-cover"
                        />
                      ) : row.url ? (
                        <img
                          src={row.url}
                          alt={row.name}
                          className="w-24 h-20 object-cover"
                        />
                      ) : (
                        <div
                          className="w-24 h-20"
                          style={{ backgroundColor: row.hex || "#e5e7eb" }}
                        />
                      )}
                      {row.kind === "library-fabric" && (
                        <span className="absolute top-0.5 left-0.5 text-[8px] bg-primary-500 text-white px-1 rounded">
                          库
                        </span>
                      )}
                      {row.kind === "text" && (
                        <span className="absolute top-0.5 left-0.5 text-[8px] bg-primary-500 text-white px-1 rounded">
                          文
                        </span>
                      )}
                      {row.kind === "library-fabric" &&
                        row.hex &&
                        !/^#/.test(row.name) && (
                          <span className="absolute bottom-6 right-0.5 text-[8px] bg-white/80 text-gray-600 px-0.5">
                            {row.hex}
                          </span>
                        )}
                      {!batchRunningOrAnalyzing && (
                        <button
                          onClick={() => removeRow("fabric", row.id)}
                          className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/50 text-white text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          ×
                        </button>
                      )}
                      {row.kind !== "text" && (
                        <div
                          className="px-1 py-0.5 text-[8px] text-gray-400 truncate"
                          title={row.name}
                        >
                          {row.name}
                        </div>
                      )}
                    </div>
                  ))}
                  {fabricRows.length < fabricsLimit &&
                    !batchRunningOrAnalyzing && (
                      <>
                        <button
                          onClick={() => fabricRef.current?.click()}
                          className="w-28 h-28 rounded-lg border border-dashed border-gray-300 bg-gray-50 flex flex-col items-center justify-center cursor-pointer hover:border-primary-400 transition-colors shrink-0"
                        >
                          <span className="text-lg text-gray-400">+</span>
                          <span className="text-[10px] text-gray-400">
                            添加面料
                          </span>
                        </button>
                        <button
                          onClick={() => setPicker("fabric")}
                          className="w-28 h-28 rounded-lg border border-dashed border-primary-200 bg-primary-50/40 flex flex-col items-center justify-center cursor-pointer hover:border-primary-400 transition-colors shrink-0"
                        >
                          <span className="text-base text-primary-500">▦</span>
                          <span className="text-[10px] text-primary-600 mt-0.5">
                            从库选择
                          </span>
                        </button>
                      </>
                    )}
                </div>
                <input
                  ref={fabricRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => addUploads("fabric", e.target.files)}
                />
                {/* 文字描述面料(作为额外面料槽位) */}
                {fabricText && !batchRunningOrAnalyzing && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {fabricText.split(/[,，]/).map((t, i) => {
                      const desc = t.trim();
                      if (!desc) return null;
                      return (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-primary-50 border border-primary-200 text-primary-700 text-[11px]"
                        >
                          <span className="text-primary-400">✎</span>
                          {desc}
                          <button
                            type="button"
                            onClick={() =>
                              setFabricText((prev) =>
                                prev
                                  .split(/[,，]/)
                                  .filter((x, idx) => idx !== i)
                                  .join(","),
                              )
                            }
                            className="text-primary-400 hover:text-red-500 leading-none ml-1"
                          >
                            ×
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
                {(!fabricText || !batchRunningOrAnalyzing) && (
                  <textarea
                    value={fabricText}
                    onChange={(e) => setFabricText(e.target.value)}
                    onBlur={() => {
                      // 解析逗号分隔的多条文本,自动补充为 text 面料行(最多补到上限)
                      const descs = fabricText
                        .split(/[,，]/)
                        .map((s) => s.trim())
                        .filter(Boolean);
                      if (descs.length > 0 && fabricRows.length < fabricsLimit) {
                        const room = fabricsLimit - fabricRows.length;
                        const newRows: FabricRow[] = descs
                          .slice(0, room)
                          .map((d) => ({
                            kind: "text" as const,
                            id: crypto.randomUUID(),
                            name: d,
                            description: d,
                          }));
                        setFabricRows((prev) => [...prev, ...newRows]);
                        setFabricText("");
                      }
                    }}
                    placeholder="或文字描述面料,添加进槽位(逗号分隔多条,如:纯白色纯棉,天丝混纺,碎花雪纺)"
                    rows={2}
                    className="w-full mt-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-[12px] placeholder:text-gray-400 focus:outline-none focus:border-primary-400 resize-none"
                    disabled={batchRunningOrAnalyzing}
                  />
                )}
                <span className="text-[10px] text-gray-400">
                  {mode === "cross"
                    ? "面料上限 6 项,支持上传 / 库选 / 文字描述三种方式"
                    : `拼色模式:按款式自由上传(建议≤${MAX_FABRIC_MIXED})`}
                </span>
              </div>

              {/* 款式槽位(上传 + 库)*/}
              <div data-tour="tour-style">
                <label className={labelCls}>
                  款式参考{" "}
                  <span className="text-gray-400 normal-case tracking-normal">
                    ({styleRows.length}/{stylesLimit})
                  </span>
                  <span className="text-red-500">*</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {styleRows.map((row) => (
                    <div
                      key={row.id}
                      className="w-24 rounded-lg border border-gray-200 bg-gray-50 overflow-hidden relative group"
                    >
                      {row.kind === "upload" ? (
                        <img
                          src={row.preview}
                          alt={row.name}
                          className="w-24 h-20 object-cover"
                        />
                      ) : row.url ? (
                        <img
                          src={row.url}
                          alt={row.name}
                          className="w-24 h-20 object-cover"
                        />
                      ) : (
                        <div className="w-24 h-20 border border-dashed border-gray-300 rounded flex items-center justify-center text-[10px] text-gray-300">
                          无图
                        </div>
                      )}
                      {row.kind !== "upload" && (
                        <span className="absolute top-0.5 left-0.5 text-[8px] bg-primary-500 text-white px-1 rounded">
                          库
                        </span>
                      )}
                      {!batchRunningOrAnalyzing && (
                        <button
                          onClick={() => removeRow("style", row.id)}
                          className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/50 text-white text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          ×
                        </button>
                      )}
                      <div
                        className="px-1 py-0.5 text-[8px] text-gray-400 truncate"
                        title={row.name}
                      >
                        {row.name}
                      </div>
                    </div>
                  ))}
                  {styleRows.length < stylesLimit && !batchRunningOrAnalyzing && (
                    <>
                      <button
                        onClick={() => styleRef.current?.click()}
                        className="w-28 h-28 rounded-lg border border-dashed border-gray-300 bg-gray-50 flex flex-col items-center justify-center cursor-pointer hover:border-primary-400 transition-colors shrink-0"
                      >
                        <span className="text-lg text-gray-400">+</span>
                        <span className="text-[10px] text-gray-400">
                          添加款式
                        </span>
                      </button>
                      <button
                        onClick={() => setPicker("style")}
                        className="w-28 h-28 rounded-lg border border-dashed border-primary-200 bg-primary-50/40 flex flex-col items-center justify-center cursor-pointer hover:border-primary-400 transition-colors shrink-0"
                      >
                        <span className="text-base text-primary-500">▦</span>
                        <span className="text-[10px] text-primary-600 mt-0.5">
                          从库选择
                        </span>
                      </button>
                    </>
                  )}
                </div>
                <input
                  ref={styleRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => addUploads("style", e.target.files)}
                />
              </div>

              {/* 其他描述 */}
              <div>
                <label className={labelCls}>其他描述</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="补充设计想法、穿着场景、特殊工艺要求等(可选)"
                  className={`${inputCls} resize-none`}
                />
              </div>

              {/* 张数预览 */}
              {fabricRows.length > 0 && styleRows.length > 0 && (
                <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-[11px] text-gray-600">
                  {mode === "cross" ? (
                    <>
                      将生成{" "}
                      <span className="font-medium text-primary-600">
                        {fabricRows.length} × {styleRows.length} = {cellCount}
                      </span>{" "}
                      张白底效果图
                      {cellCount > MAX_CELLS && (
                        <span className="text-red-500 ml-2">
                          超过上限 {MAX_CELLS},请减少图片
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      将生成{" "}
                      <span className="font-medium text-primary-600">1</span>{" "}
                      张拼色白底效果图（共 {fabricRows.length} 块面料拼接）
                    </>
                  )}
                </div>
              )}

              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-[12px] text-red-600">
                  ⚠ {error}
                </div>
              )}
            </div>
            {/* 结束滚动区 */}
          </div>
          {/* 结束滚动容器 */}

          {/* 底部:固定行动按钮(按批次状态切换,与 Composer 规范一致) */}
          <div className="shrink-0 border-t border-gray-200 bg-white px-5 pt-3 pb-4">
            <div data-tour="tour-generate">
              {hasSuccess && !batchRunningOrAnalyzing && !submitting ? (
                <GenerateButton
                  label={`保存到 Lookbook (${batch!.completed}/${batch!.total})`}
                  loading={false}
                  estimatedCoins={0}
                  userCoins={user?.coins}
                  onClick={saveToLookbook}
                />
              ) : (
                <GenerateButton
                  label="立即生成"
                  loading={submitting || batchRunningOrAnalyzing}
                  disabled={!canSubmit}
                  estimatedCoins={cellCount * AI_COST_PER_IMAGE}
                  userCoins={user?.coins}
                  onClick={submit}
                />
              )}
            </div>
            {batchRunningOrAnalyzing && batch && (
              <div className="text-[11px] text-gray-500 mt-2 text-center">
                {batch.completed + batch.failed}/{batch.total}
                {batch.failed > 0 && (
                  <span className="text-amber-600 ml-1">
                    ({batch.failed} 张失败)
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 右:结果矩阵 */}
        <aside data-tour="tour-result" className="border-l border-gray-200 bg-gray-50 overflow-y-auto min-h-0 p-5 space-y-5">
          {!batch && !submitting && (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white text-center text-[12px] text-gray-400 px-6 py-12">
              上传面料与款式后<br />点击底部「立即生成」
            </div>
          )}

          {submitting && (
            <div className="flex items-center justify-center h-full">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-primary-200 border-t-primary-500 rounded-full animate-spin" />
                <span className="text-[12px] text-gray-500">
                  正在上传并分析图片…
                </span>
              </div>
            </div>
          )}

          {batch &&
            batch.fabrics.length > 0 &&
            batch.styles.length > 0 &&
            (mode === "color-mix" ? (
              // 拼色模式:单张大图 + 底部面料缩略条(不标「拼色」标签)
              <ColorMixResult
                batch={batch}
                retryCell={retryCell}
                preview={preview}
              />
            ) : (
              // 叉乘模式:纵向列表,每行 = 款式 × 面料 = 结果
              <>
                <div className="text-[10px] uppercase tracking-wider text-gray-500">
                  生成结果 {fabricRows.length}×{styleRows.length} = {batch.items.length}
                  {hasSuccess && (
                    <span className="ml-2 text-gray-400 normal-case tracking-normal">({batch.completed}/{batch.total} 成功)</span>
                  )}
                </div>

                <div className="space-y-2">
                  {sortedCrossItems.map((cell) => {
                    const fRow = fabricRows[cell.fi];
                    const sRow = styleRows[cell.si];
                    return (
                      <div
                        key={`c-${cell.fi}-${cell.si}`}
                        className="flex items-center gap-3 p-2.5 rounded-xl border border-gray-200 bg-white hover:border-gray-300 transition-colors"
                      >
                        {/* 款式缩略图 */}
                        <div className="shrink-0 text-center">
                          <div className="w-16 h-16 rounded-lg overflow-hidden border border-gray-200 bg-gray-100 mx-auto">
                            {sRow && sRow.kind === "upload" ? (
                              <img
                                src={batch.styles[cell.si]?.url || sRow.preview}
                                alt={sRow.name}
                                className="w-full h-full object-cover"
                              />
                            ) : sRow && sRow.url ? (
                              <img
                                src={batch.styles[cell.si]?.url || sRow.url}
                                alt={sRow.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-[9px] text-gray-300">
                                无图
                              </div>
                            )}
                          </div>
                          {sRow && (
                            <div
                              className="text-[9px] text-gray-500 mt-1 w-16 truncate"
                              title={sRow.name}
                            >
                              {sRow.kind !== "upload"
                                ? sRow.name
                                : `款式${cell.si + 1}`}
                            </div>
                          )}
                        </div>

                        {/* 乘号 */}
                        <span className="shrink-0 text-gray-300 text-sm font-light">
                          ×
                        </span>

                        {/* 面料缩略图 */}
                        <div className="shrink-0 text-center">
                          <div className="w-16 h-16 rounded-lg overflow-hidden border border-gray-200 bg-gray-100 mx-auto">
                            {fRow && fRow.kind === "upload" ? (
                              <img
                                src={batch.fabrics[cell.fi]?.url || fRow.preview}
                                alt={fRow.name}
                                className="w-full h-full object-cover"
                              />
                            ) : fRow && fRow.url ? (
                              <img
                                src={batch.fabrics[cell.fi]?.url || fRow.url}
                                alt={fRow.name}
                                className="w-full h-full object-cover"
                              />
                            ) : fRow &&
                              fRow.kind === "library-fabric" &&
                              fRow.hex ? (
                              <div
                                className="w-full h-full"
                                style={{ backgroundColor: fRow.hex }}
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-[9px] text-gray-300">
                                无图
                              </div>
                            )}
                          </div>
                          {fRow && (
                            <div
                              className="text-[9px] text-gray-500 mt-1 w-16 truncate"
                              title={fRow.name}
                            >
                              {fRow.kind !== "upload"
                                ? fRow.name
                                : `面料${cell.fi + 1}`}
                            </div>
                          )}
                        </div>

                        {/* 等号 */}
                        <span className="shrink-0 text-gray-300 text-sm font-light">
                          ＝
                        </span>

                        {/* 结果 */}
                        <div className="flex-1 min-w-0 flex justify-end">
                          <div className="w-40 h-40 rounded-lg border border-gray-200 bg-white overflow-hidden flex flex-col shrink-0">
                            <div className="flex-1 relative bg-white">
                              {cell.status === "pending" && (
                                <div className="w-full h-full flex items-center justify-center flex-col gap-1">
                                  <div className="w-6 h-6 border-2 border-primary-200 border-t-primary-500 rounded-full animate-spin" />
                                  <span className="text-[9px] text-gray-400">
                                    生成中…
                                  </span>
                                </div>
                              )}
                              {cell.status === "done" && cell.url && (
                                <img
                                  src={cell.url}
                                  alt={`面料${cell.fi + 1} × 款式${cell.si + 1}`}
                                  className="w-full h-full object-contain cursor-zoom-in"
                                  onClick={() => preview.openFromMixed(
                                    sortedCrossItems.filter((c) => c.url).map((c) => ({ url: c.url, label: `面${c.fi + 1} × 款${c.si + 1}` })),
                                    sortedCrossItems.findIndex((c) => c === cell),
                                  )}
                                />
                              )}
                              {cell.status === "error" && (
                                <div className="w-full h-full flex items-center justify-center flex-col gap-1 px-2 text-center">
                                  <span className="text-[10px] text-red-500">
                                    {cell.error || "生成失败"}
                                  </span>
                                  <button
                                    onClick={() => retryCell(cell.fi, cell.si)}
                                    className="text-[10px] text-primary-600 underline hover:text-primary-700"
                                  >
                                    重试
                                  </button>
                                </div>
                              )}
                            </div>
                            <div className="px-1 py-0.5 text-[8px] text-center text-gray-400 border-t border-gray-100 truncate">
                              面{cell.fi + 1} × 款{cell.si + 1}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* 查看生成 prompt 已隐藏 */}
              </>
            ))}
        </aside>

        {/* 库选择器 */}
        <LibraryPickerModal
          mode={picker}
          knowledge={knowledge}
          onClose={() => setPicker(null)}
          onFabric={addLibraryFabric}
          onStyle={(p) => addLibraryStyle(p)}
        />

        {/* 全屏大图预览(页面级单点渲染) */}
        {preview.modal}
      </div>
    </>
  );
}

/**
 * 拼色模式结果面板:单张大图 + 底部面料缩略条。
 * 严格不出现「拼色」文案,让用户感知与叉乘单图一致。
 */
function ColorMixResult({ batch, retryCell, preview }: { batch: MaterialComboBatch; retryCell: (fi: number, si: number) => void; preview: ReturnType<typeof useImagePreview>; }) {
  const cell = batch.items?.[0];
  const styleRow = batch.styles?.[0];
  const showingFabrics = batch.fabrics || [];
  return (
    <div className="space-y-4">
      <div className="text-[10px] uppercase tracking-wider text-gray-500">拼色结果</div>

      {/* 左侧 1 款式信息 */}
      <div className="flex items-center gap-3 text-[11px] text-gray-600">
        <span className="text-gray-400 shrink-0">款式:</span>
        {styleRow?.url
          ? <img src={styleRow.url} alt="" className="w-12 h-12 rounded-lg object-cover border border-gray-200" />
          : <div className="w-12 h-12 rounded-lg bg-gray-100" />}
        <span className="truncate">{styleRow?.name || "(无)"}</span>
      </div>

      {/* 单张主图 */}
      <div className="mx-auto w-full max-w-[360px] aspect-square rounded-xl border border-gray-200 bg-white overflow-hidden">
        {cell?.status === "pending" && (
          <div className="w-full h-full flex items-center justify-center flex-col gap-1">
            <div className="w-8 h-8 border-2 border-primary-200 border-t-primary-500 rounded-full animate-spin" />
            <span className="text-[12px] text-gray-400">生成中…</span>
          </div>
        )}
        {cell?.status === "done" && cell.url && (
          <img src={cell.url} alt="拼色结果" className="w-full h-full object-contain cursor-zoom-in" onClick={() => preview.open([{ url: cell.url, label: "拼色结果" }], 0)} />
        )}
        {cell?.status === "error" && (
          <div className="w-full h-full flex items-center justify-center flex-col gap-1 px-4 text-center">
            <span className="text-[12px] text-red-500">{cell.error || "生成失败"}</span>
            <button onClick={() => retryCell(0, 0)} className="text-[12px] text-primary-600 underline hover:text-primary-700">重试</button>
          </div>
        )}
      </div>

      {/* 面料缩略条 */}
      <div>
        <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-2">面料 ({showingFabrics.length})</div>
        <div className="flex flex-wrap gap-2">
          {showingFabrics.map((f, i) => (
            <div key={i} className="w-16 text-center">
              <div className="w-16 h-16 rounded-lg border border-gray-200 bg-white overflow-hidden">
                {f?.url
                  ? <img src={f.url} alt={f.name || `面料${i + 1}`} className="w-full h-full object-cover" />
                  : <div className="w-full h-full bg-gray-100" />}
              </div>
              <div className="text-[8px] text-gray-400 mt-0.5 truncate">{f?.name || `面料${i + 1}`}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 查看生成 prompt 已隐藏 */}
    </div>
  );
}

// ─── 库选择弹窗 ────────────────────────────────────────────────
interface PickerProps {
  mode: null | "fabric" | "style";
  knowledge?: KnowledgeDeps;
  onClose: () => void;
  onFabric: (p: FabricPick) => void;
  onStyle: (p: {
    kind: "style";
    styleId: string;
    url: string;
    name: string;
  }) => void;
}

function LibraryPickerModal({
  mode,
  knowledge,
  onClose,
  onFabric,
  onStyle,
}: PickerProps) {
  const [q, setQ] = useState("");

  // 重置搜索词在每次打开时
  useEffect(() => {
    if (mode) setQ("");
  }, [mode]);

  if (!mode) return null;
  const isFabric = mode === "fabric";

  // 面料:展平为单个颜色卡片(colorImages 优先,回退 image / colors)
  const materials = (knowledge?.materials || []) as any[];
  const cards: FlatFabricCard[] = [];
  for (const m of materials) {
    if (!m) continue;
    const cis: any[] = Array.isArray(m.colorImages) ? m.colorImages : [];
    const matName = m.name || "未命名面料";
    const matCat = m.category || "";
    if (cis.length) {
      cis.forEach((c, i) => {
        if (!c) return;
        cards.push({
          matId: m.id,
          matCategory: matCat,
          matName,
          colorIdx: i,
          url: c.url || "",
          hex: c.hex,
          colorName: c.name || undefined,
          shared: !!m.shared,
        });
      });
    } else if (m.image) {
      // 回退:面料参考图一张
      cards.push({
        matId: m.id,
        matCategory: matCat,
        matName,
        colorIdx: -1,
        url: m.image || "",
        hex: undefined,
        colorName: undefined,
        shared: !!m.shared,
      });
    } else {
      // 回退:colors 色值(仅 hex)
      const cols: any[] = Array.isArray(m.colors) ? m.colors : [];
      if (cols.length) {
        // 一张卡片代表整块面料(取首个 hex 上色)
        cards.push({
          matId: m.id,
          matCategory: matCat,
          matName,
          colorIdx: -1,
          url: "",
          hex: typeof cols[0] === "string" ? cols[0] : undefined,
          colorName: undefined,
          shared: !!m.shared,
        });
      }
    }
  }
  const cardFilter = cards.filter((c) => {
    if (!q.trim()) return true;
    const k = q.trim().toLowerCase();
    return [c.matName, c.matCategory, c.colorName || "", c.hex || ""].some(
      (f) => f.toLowerCase().includes(k),
    );
  });

  // 款式
  const styles = (knowledge?.styles || []) as any[];
  const styleFilter = styles.filter((s: any) => {
    if (!q.trim()) return true;
    const k = q.trim().toLowerCase();
    return [s?.name || "", s?.category || ""].some((f) =>
      String(f).toLowerCase().includes(k),
    );
  });

  function handlePick(pick: Pick) {
    if (pick.kind === "fabric") onFabric(pick);
    else onStyle(pick);
    onClose();
  }

  const title = isFabric ? "选择面料色卡" : "选择款式";

  return (
    <Modal open onClose={onClose} title={title} maxWidth="max-w-5xl">
      <div className="mb-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={
            isFabric
              ? "搜索面料名 / 颜色 / 品类..."
              : "搜索款式名 / 品类..."
          }
          className="w-full text-[12px] border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-primary-500"
          autoFocus
        />
      </div>

      {!isFabric && styleFilter.length === 0 && (
        <div className="text-center text-[12px] text-gray-400 py-16">
          款式库里暂无款式,请先在「款式」页添加。
        </div>
      )}
      {isFabric && cardFilter.length === 0 && (
        <div className="text-center text-[12px] text-gray-400 py-16">
          {materials.length === 0
            ? "面料库里暂无材料,请先在「材料」页添加。"
            : "没有匹配的面料色卡。"}
        </div>
      )}
      {isFabric ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 max-h-[60vh] overflow-y-auto pr-1">
          {cardFilter.map((c) => {
            const displayName = c.colorName || c.hex || c.matName;
            const fullName = c.colorName
              ? `${c.matName} · ${c.colorName}`
              : displayName;
            const hasImage = !!c.url;
            return (
              <button
                key={`${c.matId}-${c.colorIdx}`}
                onClick={() =>
                  handlePick({
                    kind: "fabric",
                    matId: c.matId,
                    colorIdx: c.colorIdx,
                    url: c.url,
                    name: fullName,
                    hex: c.hex,
                  })
                }
                className="text-left rounded-xl border border-gray-200 bg-white hover:border-primary-400 hover:shadow-sm transition-all overflow-hidden"
              >
                <div className="aspect-square w-full relative">
                  {c.shared && (
                    <span className="absolute top-2 left-2 z-10 text-[8px] px-1.5 py-0.5 rounded-sm bg-amber-500/95 text-white font-medium">
                      系统
                    </span>
                  )}
                  {hasImage ? (
                    <img
                      src={c.url}
                      alt={fullName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center text-[10px] text-gray-400"
                      style={{
                        backgroundColor:
                          c.hex && /^#/.test(c.hex) ? c.hex : "#f3f4f6",
                      }}
                    >
                      {c.hex || "无图"}
                    </div>
                  )}
                </div>
                <div className="px-1.5 py-1">
                  <div
                    className="text-[9px] text-gray-700 truncate"
                    title={fullName}
                  >
                    {fullName}
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    {c.hex && (
                      <span className="inline-flex items-center gap-0.5 text-[8px] text-gray-400">
                        <span
                          className="inline-block w-2 h-2 rounded-full border border-gray-300"
                          style={{
                            backgroundColor: /^#/.test(c.hex)
                              ? c.hex
                              : "#e5e7eb",
                          }}
                        />
                        {c.hex}
                      </span>
                    )}
                    {c.matCategory && (
                      <span className="text-[8px] text-gray-400 truncate">
                        {c.matCategory}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 max-h-[60vh] overflow-y-auto pr-1">
          {styleFilter.map((s: any) => (
            <button
              key={s.id}
              onClick={() =>
                handlePick({
                  kind: "style",
                  styleId: s.id,
                  url: s.image || "",
                  name: s.name || "未命名款式",
                })
              }
              className="text-left rounded-xl border border-gray-200 bg-white hover:border-primary-400 hover:shadow-sm transition-all overflow-hidden"
            >
              <div className="aspect-square w-full relative">
                {s.shared && (
                  <span className="absolute top-2 left-2 z-10 text-[8px] px-1.5 py-0.5 rounded-sm bg-amber-500/95 text-white font-medium">
                    系统
                  </span>
                )}
                {s.image ? (
                  <img
                    src={s.image}
                    alt={s.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-300">
                    无图
                  </div>
                )}
              </div>
              <div className="px-1.5 py-1">
                <div
                  className="text-[9px] text-gray-700 truncate"
                  title={s.name}
                >
                  {s.name}
                </div>
                {s.category && (
                  <span className="inline-block mt-0.5 text-[8px] bg-gray-100 text-gray-500 px-1 rounded">
                    {s.category}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <button
          onClick={onClose}
          className="text-[12px] text-gray-500 hover:text-gray-700 px-3 py-1.5"
        >
          取消
        </button>
      </div>
    </Modal>
  );
}

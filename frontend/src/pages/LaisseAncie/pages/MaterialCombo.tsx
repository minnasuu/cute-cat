// @ts-nocheck
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

// ─── 上限约束(与后端同步) ─────────────────────────────────────
const MAX_FABRIC = 6;   // 面料上限
const MAX_STYLE = 6;    // 款式上限
const MAX_CELLS = MAX_FABRIC * MAX_STYLE; // 36 张上限
const MAX_FABRIC_MIXED = 12; // 拼色模式面料软上限
const POLL_MS = 3000;   // 轮询间隔
const POLL_MAX_ATTEMPTS = 120; // 最长轮询 6 分钟

type Mode = "cross" | "color-mix";

// ─── 槽位 discriminated union ─────────────────────────────────
type FabricRow =
  | { kind: "upload"; id: string; file: File; preview: string; name: string; analysisText?: string }
  | { kind: "library-fabric"; id: string; matId: string; colorIdx: number; name: string; url: string; hex?: string; analysisText?: string };

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
  colorName?: string;  // 卡片独立名(来自 colorImages[].name)
}

interface FabricPick { kind: "fabric"; matId: string; colorIdx: number; url: string; name: string; hex?: string }
interface StylePick { kind: "style"; styleId: string; url: string; name: string }
type Pick = FabricPick | StylePick;

export default function MaterialComboPage({ knowledge, brandLoading, knowledgeLoading }: Props) {
  const { teamId, navigateTab } = useCurrentTeam();
  const store = useDesignStore();

  // ── 上传/库槽位 ──
  const [fabricRows, setFabricRows] = useState<FabricRow[]>([]);
  const [styleRows, setStyleRows] = useState<StyleRow[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [picker, setPicker] = useState<null | "fabric" | "style">(null);
  const [mode, setMode] = useState<Mode>("cross");

  // 切换生成模式(叉乘 / 拼色):清空槽位与批次,保留名称/描述
  function switchMode(next: Mode) {
    if (next === mode) return;
    setFabricRows([]); setStyleRows([]); setBatch(null); setError(null);
    setMode(next);
    if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null; }
  }

  // ── 批次状态 ──
  const [batch, setBatch] = useState<MaterialComboBatch | null>(null);
  const [submitting, setSubmitting] = useState(false); // POST 提交中
  const [error, setError] = useState<string | null>(null);

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

  // ── 轮询启停 ──
  const stopPolling = useCallback(() => {
    if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null; }
  }, []);

  const startPolling = useCallback((batchId: string) => {
    stopPolling();
    pollAttempts.current = 0;
    pollTimer.current = setInterval(async () => {
      pollAttempts.current += 1;
      if (pollAttempts.current > POLL_MAX_ATTEMPTS) {
        setError((prev) => prev || "部分图片生成超时,可点击失败单元格下方重试");
        stopPolling();
        setBatch((b) => b ? { ...b, status: "done" } : b);
        return;
      }
      try {
        const url = teamApi(teamId).materialComboBatchUrl(batchId);
        const res = await fetch(url, { credentials: "include" });
        if (res.status === 404) { setError("批次已过期,请重新生成"); stopPolling(); return; }
        if (!res.ok) return; // 网络抖动继续轮询
        const data: MaterialComboBatch = await res.json();
        // 回写分析文本到对应槽位(按位置对齐,含库位)
        setFabricRows((prev) => prev.map((r, i) => data.fabrics[i]?.text != null ? { ...r, analysisText: data.fabrics[i].text } : r));
        setStyleRows((prev) => prev.map((r, i) => data.styles[i]?.text != null ? { ...r, analysisText: data.styles[i].text } : r));
        setBatch(data);
        if (data.status === "done") stopPolling();
      } catch { /* 网络错误继续 */ }
    }, POLL_MS);
  }, [teamId, stopPolling]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  // ── 唯一 id ──
  const uid = useCallback(() => `r-${Date.now().toString()}-${Math.random().toString(36).slice(2, 7)}`, []);

  // ── 追加上传文件 ──
  function addUploads(which: "fabric" | "style", list: FileList | null) {
    if (!list || !list.length) return;
    const incoming = Array.from(list);
    const setter = which === "fabric" ? setFabricRows : setStyleRows;
    const limit = which === "fabric" ? fabricsLimit : stylesLimit;
    const label = which === "fabric" ? "面料" : "款式";
    setter((prev) => {
      const room = limit - prev.length;
      if (room <= 0) { setError(`${label}已达上限 ${limit} 项`); return prev; }
      const accepted = incoming.slice(0, room);
      if (incoming.length > room) setError(`${label}最多容纳 ${limit} 项,已取前 ${room} 个`);
      const newRows = accepted.map((file) => ({
        kind: "upload", id: uid(), file, preview: URL.createObjectURL(file), name: file.name,
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
    const setter = which === "fabric" ? setFabricRows : setStyleRows;
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
      const fabricsMeta = fabricRows.map((r) => {
        if (r.kind === "upload") return { kind: "upload", name: r.name };
        return { kind: "library-fabric", matId: r.matId, colorIdx: r.colorIdx, hex: r.hex };
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
      for (const r of fabricRows) if (r.kind === "upload") fd.append("fabrics", await compressForUpload(r.file));
      for (const r of styleRows) if (r.kind === "upload") fd.append("styles", await compressForUpload(r.file));
      if (knowledge?.brand) fd.append("brand", JSON.stringify(knowledge.brand));
      const url = teamApi(teamId).materialComboUrl;
      const res = await fetch(url, { method: "POST", body: fd, credentials: "include" });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`请求失败 (HTTP ${res.status})${t ? `: ${t.slice(0, 120)}` : ""}`);
      }
      const data: MaterialComboBatch = await res.json();
      setBatch(data);
      if (data.fabrics?.length) {
        setFabricRows((prev) => prev.map((r, i) => data.fabrics[i]?.text != null ? { ...r, analysisText: data.fabrics[i].text } : r));
      }
      if (data.styles?.length) {
        setStyleRows((prev) => prev.map((r, i) => data.styles[i]?.text != null ? { ...r, analysisText: data.styles[i].text } : r));
      }
      if (data.status === "running" && data.batchId) startPolling(data.batchId);
    } catch (e: any) {
      setError(e?.message || "提交失败,请重试");
    } finally {
      setSubmitting(false);
    }
  }

  // ── 单格重试 ──
  async function retryCell(fi: number, si: number) {
    if (!batch) return;
    // optimistic:本格打回 pending,批次回到 running 并重启轮询
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
      startPolling(batch.batchId);
    } catch (e: any) {
      setError(e?.message || "重试失败");
      setBatch((b) => {
        if (!b) return b;
        return { ...b, items: b.items.map((it) => it.fi === fi && it.si === si ? { ...it, status: "error", error: e?.message || "重试失败" } : it) };
      });
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
      const src: { style?: { url: string; name: string }; fabric?: { url: string; name: string } } = {};
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
  const sortedCrossItems = batch && batch.mode !== "color-mix"
    ? batch.items.slice().sort((a, b) => a.si - b.si || a.fi - b.fi)
    : [];

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr] h-[calc(100vh-64px)] min-h-0">
      {/* 左:表单 */}
      <div className="overflow-y-auto bg-white">
        <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-gray-200 px-5 py-3">
          <div className="flex items-center justify-between mb-1.5">
            <h1 className="text-[15px] font-medium text-gray-800">材料组合</h1>
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5 text-[11px]">
              <button onClick={() => switchMode("cross")} className={`px-2 py-1 rounded-md ${mode === "cross" ? "bg-white text-primary-600 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>叉乘</button>
              <button onClick={() => switchMode("color-mix")} className={`px-2 py-1 rounded-md ${mode === "color-mix" ? "bg-white text-primary-600 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>拼色</button>
            </div>
          </div>
          <span className="text-[10px] text-gray-500">
            {mode === "cross" ? `m 面料 × n 款式 → m×n 白底图(≤${MAX_CELLS})` : `多面料 × 1 款式 → 1 张拼色图(面料≤${MAX_FABRIC_MIXED})`}
          </span>
        </header>

        <div className="p-5 space-y-5 max-w-2xl">
          {/* 名称 */}
          <div>
            <label className={labelCls}>名称 *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="如:春日雏菊连衣裙" className={inputCls} />
          </div>

          {/* 面料槽位(上传 + 库)*/}
          <div>
            <label className={labelCls}>面料 <span className="text-gray-400 normal-case tracking-normal">({fabricRows.length}/{fabricsLimit})</span></label>
            <div className="flex flex-wrap gap-2">
              {fabricRows.map((row) => (
                <div key={row.id} className="w-24 rounded-lg border border-gray-200 bg-gray-50 overflow-hidden relative group">
                  {row.kind === "upload" ? (
                    <img src={row.preview} alt={row.name} className="w-24 h-20 object-cover" />
                  ) : row.url ? (
                    <img src={row.url} alt={row.name} className="w-24 h-20 object-cover" />
                  ) : (
                    <div className="w-24 h-20" style={{ backgroundColor: row.hex || "#e5e7eb" }} />
                  )}
                  {row.kind !== "upload" && (
                    <span className="absolute top-0.5 left-0.5 text-[8px] bg-primary-500 text-white px-1 rounded">库</span>
                  )}
                  {row.kind === "library-fabric" && row.hex && !/^#/.test(row.name) && (
                    <span className="absolute bottom-6 right-0.5 text-[8px] bg-white/80 text-gray-600 px-0.5">{row.hex}</span>
                  )}
                  {!batchRunningOrAnalyzing && (
                    <button onClick={() => removeRow("fabric", row.id)}
                      className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/50 text-white text-[10px] opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                  )}
                  <div className="px-1 py-0.5 text-[8px] text-gray-400 truncate" title={row.name}>{row.name}</div>
                </div>
              ))}
              {fabricRows.length < fabricsLimit && !batchRunningOrAnalyzing && (
                <>
                  <button onClick={() => fabricRef.current?.click()}
                    className="w-24 h-24 rounded-lg border border-dashed border-gray-300 bg-gray-50 flex flex-col items-center justify-center cursor-pointer hover:border-primary-400 transition-colors shrink-0">
                    <span className="text-lg text-gray-400">+</span>
                    <span className="text-[10px] text-gray-400">添加面料</span>
                  </button>
                  <button onClick={() => setPicker("fabric")}
                    className="w-24 h-24 rounded-lg border border-dashed border-primary-200 bg-primary-50/40 flex flex-col items-center justify-center cursor-pointer hover:border-primary-400 transition-colors shrink-0">
                    <span className="text-base text-primary-500">▦</span>
                    <span className="text-[10px] text-primary-600 mt-0.5">从库选择</span>
                  </button>
                </>
              )}
            </div>
            <input ref={fabricRef} type="file" accept="image/*" multiple className="hidden"
              onChange={(e) => addUploads("fabric", e.target.files)} />
            <span className="text-[10px] text-gray-400">
              {mode === "cross" ? "面料上限 6 项" : `拼色模式:按款式自由上传(建议≤${MAX_FABRIC_MIXED})`}
            </span>
          </div>

          {/* 款式槽位(上传 + 库)*/}
          <div>
            <label className={labelCls}>款式参考 <span className="text-gray-400 normal-case tracking-normal">({styleRows.length}/{stylesLimit})</span></label>
            <div className="flex flex-wrap gap-2">
              {styleRows.map((row) => (
                <div key={row.id} className="w-24 rounded-lg border border-gray-200 bg-gray-50 overflow-hidden relative group">
                  {row.kind === "upload" ? (
                    <img src={row.preview} alt={row.name} className="w-24 h-20 object-cover" />
                  ) : row.url ? (
                    <img src={row.url} alt={row.name} className="w-24 h-20 object-cover" />
                  ) : (
                    <div className="w-24 h-20 border border-dashed border-gray-300 rounded flex items-center justify-center text-[10px] text-gray-300">无图</div>
                  )}
                  {row.kind !== "upload" && (
                    <span className="absolute top-0.5 left-0.5 text-[8px] bg-primary-500 text-white px-1 rounded">库</span>
                  )}
                  {!batchRunningOrAnalyzing && (
                    <button onClick={() => removeRow("style", row.id)}
                      className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/50 text-white text-[10px] opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                  )}
                  <div className="px-1 py-0.5 text-[8px] text-gray-400 truncate" title={row.name}>{row.name}</div>
                </div>
              ))}
              {styleRows.length < stylesLimit && !batchRunningOrAnalyzing && (
                <>
                  <button onClick={() => styleRef.current?.click()}
                    className="w-24 h-24 rounded-lg border border-dashed border-gray-300 bg-gray-50 flex flex-col items-center justify-center cursor-pointer hover:border-primary-400 transition-colors shrink-0">
                    <span className="text-lg text-gray-400">+</span>
                    <span className="text-[10px] text-gray-400">添加款式</span>
                  </button>
                  <button onClick={() => setPicker("style")}
                    className="w-24 h-24 rounded-lg border border-dashed border-primary-200 bg-primary-50/40 flex flex-col items-center justify-center cursor-pointer hover:border-primary-400 transition-colors shrink-0">
                    <span className="text-base text-primary-500">▦</span>
                    <span className="text-[10px] text-primary-600 mt-0.5">从库选择</span>
                  </button>
                </>
              )}
            </div>
            <input ref={styleRef} type="file" accept="image/*" multiple className="hidden"
              onChange={(e) => addUploads("style", e.target.files)} />
          </div>

          {/* 其他描述 */}
          <div>
            <label className={labelCls}>其他描述</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
              placeholder="补充设计想法、穿着场景、特殊工艺要求等(可选)"
              className={`${inputCls} resize-none`} />
          </div>

          {/* 品牌信息提示 */}
          {knowledge?.brand && (knowledge.brand.nameZh || knowledge.brand.nameEn) && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-[11px] text-gray-600">
              <span className="text-gray-500">品牌信息:</span> {knowledge.brand.nameZh}{knowledge.brand.nameEn ? ` (${knowledge.brand.nameEn})` : ""}
              {knowledge.brand.voice ? ` · ${knowledge.brand.voice}` : ""}
              <span className="text-gray-400 ml-1">(自动注入设计 prompt)</span>
            </div>
          )}

          {/* 张数预览 */}
          {fabricRows.length > 0 && styleRows.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-[11px] text-gray-600">
              {mode === "cross" ? (<>将生成 <span className="font-medium text-primary-600">{fabricRows.length} × {styleRows.length} = {cellCount}</span> 张白底效果图{cellCount > MAX_CELLS && <span className="text-red-500 ml-2">超过上限 {MAX_CELLS},请减少图片</span>}</>) : (<>将生成 <span className="font-medium text-primary-600">1</span> 张拼色白底效果图（共 {fabricRows.length} 块面料拼接）</>)}
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-[12px] text-red-600">⚠ {error}</div>
          )}

          {/* 提交 */}
          <div className="flex items-center gap-3">
            <button onClick={submit} disabled={!canSubmit}
              className="px-6 py-3 rounded-2xl bg-primary-500 hover:bg-primary-600 disabled:opacity-40 text-white font-medium text-sm shadow-lg transition-colors">
              {submitting ? "上传中…" : batchRunningOrAnalyzing ? "生成中…" : "生成白底效果图"}
            </button>
            {batchRunningOrAnalyzing && batch && (
              <span className="text-[11px] text-gray-500">
                {batch.completed + batch.failed}/{batch.total}
                {batch.failed > 0 && <span className="text-amber-600 ml-1">({batch.failed} 张失败)</span>}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 右:结果矩阵 */}
      <aside className="border-l border-gray-200 bg-gray-50 overflow-y-auto min-h-0 p-5 space-y-5">
        {!batch && !submitting && (
          <div className="flex items-center justify-center h-full">
            <div className="rounded-xl border border-dashed border-gray-300 bg-white text-center text-[12px] text-gray-400 px-8 py-10 max-w-[280px]">
              上传面料与款式后点击<br />「生成白底效果图」
            </div>
          </div>
        )}

        {submitting && (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-primary-200 border-t-primary-500 rounded-full animate-spin" />
              <span className="text-[12px] text-gray-500">正在上传并分析图片…</span>
            </div>
          </div>
        )}

        {batch && batch.fabrics.length > 0 && batch.styles.length > 0 && (
          batch.mode === "color-mix" ? (
            // 拼色模式:单张大图 + 底部面料缩略条(不标「拼色」标签)
            <ColorMixResult batch={batch} retryCell={retryCell} hasSuccess={hasSuccess} onSave={saveToLookbook} />
          ) : (
            // 叉乘模式:纵向列表,每行 = 款式 × 面料 = 结果
            <>
              <div className="flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-wider text-gray-500">
                  生成结果 {fabricRows.length}×{styleRows.length} = {batch.items.length}
                </div>
                {hasSuccess && (
                  <button onClick={saveToLookbook}
                    className="text-[12px] bg-primary-500 hover:bg-primary-600 text-white px-3 py-1.5 rounded-lg font-medium transition-colors">
                    保存到 Lookbook ({batch.completed}/{batch.total})
                  </button>
                )}
              </div>

              <div className="space-y-2">
                {sortedCrossItems.map((cell) => {
                  const fRow = fabricRows[cell.fi];
                  const sRow = styleRows[cell.si];
                  return (
                    <div key={`c-${cell.fi}-${cell.si}`} className="flex items-center gap-3 p-2.5 rounded-xl border border-gray-200 bg-white hover:border-gray-300 transition-colors">
                      {/* 款式缩略图 */}
                      <div className="shrink-0 text-center">
                        <div className="w-16 h-16 rounded-lg overflow-hidden border border-gray-200 bg-gray-100 mx-auto">
                          {sRow && sRow.kind === "upload" ? (
                            <img src={batch.styles[cell.si]?.url || sRow.preview} alt={sRow.name} className="w-full h-full object-cover" />
                          ) : sRow && sRow.url ? (
                            <img src={batch.styles[cell.si]?.url || sRow.url} alt={sRow.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-[9px] text-gray-300">无图</div>
                          )}
                        </div>
                        {sRow && <div className="text-[9px] text-gray-500 mt-1 w-16 truncate" title={sRow.name}>{sRow.kind !== "upload" ? sRow.name : `款式${cell.si + 1}`}</div>}
                      </div>

                      {/* 乘号 */}
                      <span className="shrink-0 text-gray-300 text-sm font-light">×</span>

                      {/* 面料缩略图 */}
                      <div className="shrink-0 text-center">
                        <div className="w-16 h-16 rounded-lg overflow-hidden border border-gray-200 bg-gray-100 mx-auto">
                          {fRow && fRow.kind === "upload" ? (
                            <img src={batch.fabrics[cell.fi]?.url || fRow.preview} alt={fRow.name} className="w-full h-full object-cover" />
                          ) : fRow && fRow.url ? (
                            <img src={batch.fabrics[cell.fi]?.url || fRow.url} alt={fRow.name} className="w-full h-full object-cover" />
                          ) : fRow && fRow.kind === "library-fabric" && fRow.hex ? (
                            <div className="w-full h-full" style={{ backgroundColor: fRow.hex }} />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-[9px] text-gray-300">无图</div>
                          )}
                        </div>
                        {fRow && <div className="text-[9px] text-gray-500 mt-1 w-16 truncate" title={fRow.name}>{fRow.kind !== "upload" ? fRow.name : `面料${cell.fi + 1}`}</div>}
                      </div>

                      {/* 等号 */}
                      <span className="shrink-0 text-gray-300 text-sm font-light">＝</span>

                      {/* 结果 */}
                      <div className="flex-1 min-w-0 flex justify-end">
                        <div className="w-28 h-28 rounded-lg border border-gray-200 bg-white overflow-hidden flex flex-col shrink-0">
                          <div className="flex-1 relative bg-white">
                            {cell.status === "pending" && (
                              <div className="w-full h-full flex items-center justify-center flex-col gap-1">
                                <div className="w-6 h-6 border-2 border-primary-200 border-t-primary-500 rounded-full animate-spin" />
                                <span className="text-[9px] text-gray-400">生成中…</span>
                              </div>
                            )}
                            {cell.status === "done" && <img src={cell.url} alt={`面料${cell.fi + 1} × 款式${cell.si + 1}`} className="w-full h-full object-contain" />}
                            {cell.status === "error" && (
                              <div className="w-full h-full flex items-center justify-center flex-col gap-1 px-2 text-center">
                                <span className="text-[10px] text-red-500">{cell.error || "生成失败"}</span>
                                <button onClick={() => retryCell(cell.fi, cell.si)}
                                  className="text-[10px] text-primary-600 underline hover:text-primary-700">重试</button>
                              </div>
                            )}
                          </div>
                          <div className="px-1 py-0.5 text-[8px] text-center text-gray-400 border-t border-gray-100 truncate">面{cell.fi + 1} × 款{cell.si + 1}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {batch.items.find((it) => it.prompt) && (
                <details className="text-[11px] text-gray-500">
                  <summary className="cursor-pointer hover:text-gray-700">查看生成 prompt</summary>
                  <pre className="mt-2 whitespace-pre-wrap leading-relaxed text-gray-600 max-h-60 overflow-y-auto rounded-lg bg-white border border-gray-200 p-3 font-mono text-[10px]">
                    {batch.items.filter((it) => it.prompt).slice(0, 1).map((it, i) => `# 面料${it.fi + 1} × 款式${it.si + 1}\n${it.prompt}`).join("\n\n")}
                  </pre>
                </details>
              )}
            </>
          )
        )}
      </aside>

      {/* 库选择器 */}
      <LibraryPickerModal
        mode={picker}
        knowledge={knowledge}
        onClose={() => setPicker(null)}
        onFabric={addLibraryFabric}
        onStyle={(p) => addLibraryStyle(p)}
      />
    </div>
  );
}

/**
 * 拼色模式结果面板:单张大图 + 底部面料缩略条。
 * 严格不出现「拼色」文案,让用户感知与叉乘单图一致。
 */
function ColorMixResult({ batch, retryCell, hasSuccess, onSave }: { batch: MaterialComboBatch; retryCell: (fi: number, si: number) => void; hasSuccess: boolean; onSave: () => void }) {
  const cell = batch.items?.[0];
  const styleRow = batch.styles?.[0];
  const showingFabrics = batch.fabrics || [];
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider text-gray-500">结果</div>
        {hasSuccess && (
          <button onClick={onSave}
            className="text-[12px] bg-primary-500 hover:bg-primary-600 text-white px-3 py-1.5 rounded-lg font-medium transition-colors">
            保存到 Lookbook
          </button>
        )}
      </div>

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
        {cell?.status === "done" && <img src={cell.url} alt="拼色结果" className="w-full h-full object-contain" />}
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

      {cell?.prompt && (
        <details className="text-[11px] text-gray-500">
          <summary className="cursor-pointer hover:text-gray-700">查看生成 prompt</summary>
          <pre className="mt-2 whitespace-pre-wrap leading-relaxed text-gray-600 max-h-60 overflow-y-auto rounded-lg bg-white border border-gray-200 p-3 font-mono text-[10px]">{cell.prompt}</pre>
        </details>
      )}
    </div>
  );
}

// ─── 库选择弹窗 ────────────────────────────────────────────────
interface PickerProps {
  mode: null | "fabric" | "style";
  knowledge?: KnowledgeDeps;
  onClose: () => void;
  onFabric: (p: FabricPick) => void;
  onStyle: (p: { kind: "style"; styleId: string; url: string; name: string }) => void;
}

function LibraryPickerModal({ mode, knowledge, onClose, onFabric, onStyle }: PickerProps) {
  const [q, setQ] = useState("");

  // 重置搜索词在每次打开时
  useEffect(() => { if (mode) setQ(""); }, [mode]);

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
          matId: m.id, matCategory: matCat, matName, colorIdx: i,
          url: c.url || "", hex: c.hex, colorName: c.name || undefined,
        });
      });
    } else if (m.image) {
      // 回退:面料参考图一张
      cards.push({ matId: m.id, matCategory: matCat, matName, colorIdx: -1, url: m.image || "", hex: undefined, colorName: undefined });
    } else {
      // 回退:colors 色值(仅 hex)
      const cols: any[] = Array.isArray(m.colors) ? m.colors : [];
      if (cols.length) {
        // 一张卡片代表整块面料(取首个 hex 上色)
        cards.push({ matId: m.id, matCategory: matCat, matName, colorIdx: -1, url: "", hex: typeof cols[0] === "string" ? cols[0] : undefined, colorName: undefined });
      }
    }
  }
  const cardFilter = cards.filter((c) => {
    if (!q.trim()) return true;
    const k = q.trim().toLowerCase();
    return [c.matName, c.matCategory, c.colorName || "", c.hex || ""].some((f) => f.toLowerCase().includes(k));
  });

  // 款式
  const styles = (knowledge?.styles || []) as any[];
  const styleFilter = styles.filter((s: any) => {
    if (!q.trim()) return true;
    const k = q.trim().toLowerCase();
    return [s?.name || "", s?.category || ""].some((f) => String(f).toLowerCase().includes(k));
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
        <input value={q} onChange={(e) => setQ(e.target.value)}
          placeholder={isFabric ? "搜索面料名 / 颜色 / 品类..." : "搜索款式名 / 品类..."}
          className="w-full text-[12px] border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-primary-500" autoFocus />
      </div>

      {!isFabric && styleFilter.length === 0 && (
        <div className="text-center text-[12px] text-gray-400 py-16">款式库里暂无款式,请先在「款式」页添加。</div>
      )}
      {isFabric && cardFilter.length === 0 && (
        <div className="text-center text-[12px] text-gray-400 py-16">
          {materials.length === 0 ? "面料库里暂无材料,请先在「材料」页添加。" : "没有匹配的面料色卡。"}
        </div>
      )}

      {isFabric ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 max-h-[60vh] overflow-y-auto pr-1">
          {cardFilter.map((c) => {
            const displayName = c.colorName || c.hex || c.matName;
            const fullName = c.colorName ? `${c.matName} · ${c.colorName}` : displayName;
            const hasImage = !!c.url;
            return (
              <button key={`${c.matId}-${c.colorIdx}`} onClick={() => handlePick({
                kind: "fabric", matId: c.matId, colorIdx: c.colorIdx, url: c.url,
                name: fullName, hex: c.hex,
              })}
                className="text-left rounded-xl border border-gray-200 bg-white hover:border-primary-400 hover:shadow-sm transition-all overflow-hidden">
                <div className="aspect-square w-full">
                  {hasImage ? (
                    <img src={c.url} alt={fullName} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-400"
                      style={{ backgroundColor: c.hex && /^#/.test(c.hex) ? c.hex : "#f3f4f6" }}>
                      {c.hex || "无图"}
                    </div>
                  )}
                </div>
                <div className="px-1.5 py-1">
                  <div className="text-[9px] text-gray-700 truncate" title={fullName}>{fullName}</div>
                  <div className="flex items-center gap-1 mt-0.5">
                    {c.hex && <span className="inline-flex items-center gap-0.5 text-[8px] text-gray-400">
                      <span className="inline-block w-2 h-2 rounded-full border border-gray-300" style={{ backgroundColor: /^#/.test(c.hex) ? c.hex : "#e5e7eb" }} />{c.hex}
                    </span>}
                    {c.matCategory && <span className="text-[8px] text-gray-400 truncate">{c.matCategory}</span>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 max-h-[60vh] overflow-y-auto pr-1">
          {styleFilter.map((s: any) => (
            <button key={s.id} onClick={() => handlePick({ kind: "style", styleId: s.id, url: s.image || "", name: s.name || "未命名款式" })}
              className="text-left rounded-xl border border-gray-200 bg-white hover:border-primary-400 hover:shadow-sm transition-all overflow-hidden">
              <div className="aspect-square w-full">
                {s.image ? (
                  <img src={s.image} alt={s.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-300">无图</div>
                )}
              </div>
              <div className="px-1.5 py-1">
                <div className="text-[9px] text-gray-700 truncate" title={s.name}>{s.name}</div>
                {s.category && <span className="inline-block mt-0.5 text-[8px] bg-gray-100 text-gray-500 px-1 rounded">{s.category}</span>}
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <button onClick={onClose} className="text-[12px] text-gray-500 hover:text-gray-700 px-3 py-1.5">取消</button>
      </div>
    </Modal>
  );
}

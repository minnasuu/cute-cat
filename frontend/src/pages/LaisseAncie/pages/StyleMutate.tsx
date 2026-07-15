// @ts-nocheck
/**
 * StyleMutate ——「款式裂变」工作台。
 *
 * 输入:1 张母款(上传/库) + 裂变轴勾选(廓形/领型/袖长/长短/细节) + 可选锁定面料
 *   → N 张「保留母款 DNA、仅改所选维度」的白底子款图。
 * 后端异步批次 + 前端轮询,交互对齐材料组合。
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { useCurrentTeam } from "../../../contexts/CurrentTeamContext";
import { teamApi } from "../lib/api";
import type { StyleMutateBatch } from "../lib/api";
import { useDesignStore } from "../store/design";
import type { KnowledgeDeps } from "../../DashboardPage/knowledge-injectors";
import { compressForUpload } from "../lib/images";
import { Modal } from "../components/ui";

const MAX_MUTATIONS = 12;
const POLL_MS = 3000;
const POLL_MAX_ATTEMPTS = 120;

/** 裂变轴定义(与后端 promptHint 对齐) */
export const MUTATION_AXES = [
  {
    id: "silhouette",
    label: "廓形",
    options: [
      { id: "a-line", label: "A 字廓形", promptHint: "change only the silhouette to a clear A-line / flared shape" },
      { id: "h-line", label: "H 直筒", promptHint: "change only the silhouette to a straight H-line / column shape" },
      { id: "x-line", label: "X 收腰", promptHint: "change only the silhouette to an X-line with a defined waist" },
      { id: "oversized", label: "宽松廓形", promptHint: "change only the silhouette to a relaxed oversized fit" },
      { id: "fitted", label: "修身贴身", promptHint: "change only the silhouette to a slim fitted bodycon cut" },
    ],
  },
  {
    id: "neckline",
    label: "领型",
    options: [
      { id: "round", label: "圆领", promptHint: "change only the neckline to a clean round crew neck" },
      { id: "v-neck", label: "V 领", promptHint: "change only the neckline to a V-neck" },
      { id: "square", label: "方领", promptHint: "change only the neckline to a square neckline" },
      { id: "boat", label: "船领", promptHint: "change only the neckline to a wide boat neck" },
      { id: "stand", label: "立领", promptHint: "change only the neckline to a stand / mandarin collar" },
      { id: "off-shoulder", label: "一字肩", promptHint: "change only the neckline to an off-shoulder / bardot neckline" },
    ],
  },
  {
    id: "sleeve",
    label: "袖长",
    options: [
      { id: "sleeveless", label: "无袖", promptHint: "change only the sleeves to sleeveless / tank" },
      { id: "short", label: "短袖", promptHint: "change only the sleeves to short sleeves" },
      { id: "three-quarter", label: "七分袖", promptHint: "change only the sleeves to three-quarter length" },
      { id: "long", label: "长袖", promptHint: "change only the sleeves to long sleeves" },
      { id: "puff", label: "泡泡袖", promptHint: "change only the sleeves to short puff sleeves" },
    ],
  },
  {
    id: "length",
    label: "长短",
    options: [
      { id: "crop", label: "短款露腰", promptHint: "change only the garment length to a cropped / shortened hem" },
      { id: "regular", label: "常规长度", promptHint: "change only the garment length to a regular standard hem" },
      { id: "midi", label: "中长", promptHint: "change only the garment length to midi length" },
      { id: "maxi", label: "及踝长款", promptHint: "change only the garment length to a floor-skimming maxi length" },
    ],
  },
  {
    id: "detail",
    label: "细节",
    options: [
      { id: "pockets", label: "加口袋", promptHint: "keep the base design but add visible functional patch pockets" },
      { id: "side-slits", label: "侧开叉", promptHint: "keep the base design but add side slits at the hem" },
      { id: "pleats", label: "褶裥", promptHint: "keep the base design but add soft knife pleats" },
      { id: "buttons", label: "前门扣", promptHint: "keep the base design but add a centered front button placket" },
      { id: "ruffles", label: "荷叶边", promptHint: "keep the base design but add delicate ruffle trim details" },
      { id: "belt", label: "腰带", promptHint: "keep the base design but add a matching self-fabric belt at the waist" },
    ],
  },
] as const;

type StyleRow =
  | { kind: "upload"; id: string; file: File; preview: string; name: string }
  | { kind: "library-style"; id: string; styleId: string; name: string; url: string };

type FabricRow =
  | { kind: "upload"; id: string; file: File; preview: string; name: string }
  | { kind: "library-fabric"; id: string; matId: string; colorIdx: number; name: string; url: string; hex?: string }
  | null;

type MutationKey = string; // `${axisId}::${optionId}`

interface Props {
  knowledge?: KnowledgeDeps;
  brandLoading?: boolean;
  knowledgeLoading?: boolean;
}

function mutKey(axisId: string, optionId: string): MutationKey {
  return `${axisId}::${optionId}`;
}

export default function StyleMutatePage({ knowledge, brandLoading, knowledgeLoading }: Props) {
  const { teamId, navigateTab } = useCurrentTeam();
  const store = useDesignStore();

  const [mother, setMother] = useState<StyleRow | null>(null);
  const [fabric, setFabric] = useState<FabricRow>(null);
  const [selected, setSelected] = useState<Set<MutationKey>>(new Set());
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [picker, setPicker] = useState<null | "style" | "fabric">(null);

  const [batch, setBatch] = useState<StyleMutateBatch | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const styleRef = useRef<HTMLInputElement>(null);
  const fabricRef = useRef<HTMLInputElement>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollAttempts = useRef(0);

  const selectedMutations = MUTATION_AXES.flatMap((axis) =>
    axis.options
      .filter((o) => selected.has(mutKey(axis.id, o.id)))
      .map((o) => ({
        axisId: axis.id,
        optionId: o.id,
        label: `${axis.label}·${o.label}`,
        promptHint: o.promptHint,
      })),
  );

  const batchRunning = !!batch && batch.status === "running";
  const canSubmit =
    !!name.trim() &&
    !!mother &&
    selectedMutations.length > 0 &&
    selectedMutations.length <= MAX_MUTATIONS &&
    !batchRunning &&
    !submitting &&
    !brandLoading &&
    !knowledgeLoading;

  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  const startPolling = useCallback(
    (batchId: string) => {
      stopPolling();
      pollAttempts.current = 0;
      pollTimer.current = setInterval(async () => {
        pollAttempts.current += 1;
        if (pollAttempts.current > POLL_MAX_ATTEMPTS) {
          setError((prev) => prev || "部分图片生成超时,可点击失败格重试");
          stopPolling();
          setBatch((b) => (b ? { ...b, status: "done" } : b));
          return;
        }
        try {
          const url = teamApi(teamId!).styleMutateBatchUrl(batchId);
          const res = await fetch(url, { credentials: "include" });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data: StyleMutateBatch = await res.json();
          setBatch(data);
          if (data.status === "done" || data.status === "error") stopPolling();
        } catch {
          /* 轮询偶发失败忽略 */
        }
      }, POLL_MS);
    },
    [stopPolling, teamId],
  );

  useEffect(() => () => stopPolling(), [stopPolling]);

  function toggleOption(axisId: string, optionId: string) {
    if (batchRunning) return;
    const key = mutKey(axisId, optionId);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else {
        if (next.size >= MAX_MUTATIONS) {
          setError(`最多勾选 ${MAX_MUTATIONS} 个裂变项`);
          return prev;
        }
        next.add(key);
        setError(null);
      }
      return next;
    });
  }

  async function addMotherUpload(list: FileList | null) {
    if (!list?.length) return;
    const raw = list[0];
    const compressed = await compressForUpload(raw);
    setMother({
      kind: "upload",
      id: crypto.randomUUID(),
      file: compressed,
      preview: URL.createObjectURL(compressed),
      name: raw.name || "母款",
    });
    if (styleRef.current) styleRef.current.value = "";
  }

  async function addFabricUpload(list: FileList | null) {
    if (!list?.length) return;
    const raw = list[0];
    const compressed = await compressForUpload(raw);
    setFabric({
      kind: "upload",
      id: crypto.randomUUID(),
      file: compressed,
      preview: URL.createObjectURL(compressed),
      name: raw.name || "面料",
    });
    if (fabricRef.current) fabricRef.current.value = "";
  }

  async function submit() {
    if (!teamId || !canSubmit || !mother) return;
    setSubmitting(true);
    setError(null);
    setBatch(null);
    stopPolling();
    try {
      const styleMeta =
        mother.kind === "upload"
          ? { kind: "upload", name: mother.name }
          : { kind: "library-style", styleId: mother.styleId };
      const fabricMeta = !fabric
        ? null
        : fabric.kind === "upload"
          ? { kind: "upload", name: fabric.name }
          : { kind: "library-fabric", matId: fabric.matId, colorIdx: fabric.colorIdx, hex: fabric.hex };

      const fd = new FormData();
      fd.append("name", name.trim());
      fd.append("description", description.trim());
      fd.append("styleMeta", JSON.stringify(styleMeta));
      fd.append("mutations", JSON.stringify(selectedMutations));
      if (fabricMeta) fd.append("fabricMeta", JSON.stringify(fabricMeta));
      if (mother.kind === "upload") fd.append("style", mother.file);
      if (fabric?.kind === "upload") fd.append("fabric", fabric.file);

      const url = teamApi(teamId).styleMutateUrl;
      const res = await fetch(url, { method: "POST", body: fd, credentials: "include" });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`请求失败 (HTTP ${res.status})${t ? `: ${t.slice(0, 120)}` : ""}`);
      }
      const data: StyleMutateBatch = await res.json();
      setBatch(data);
      if (data.status === "running" && data.batchId) startPolling(data.batchId);
    } catch (e: any) {
      setError(e?.message || "提交失败,请重试");
    } finally {
      setSubmitting(false);
    }
  }

  async function retryCell(mi: number) {
    if (!batch || !teamId) return;
    setBatch((b) => {
      if (!b) return b;
      return {
        ...b,
        status: "running",
        items: b.items.map((it) =>
          it.mi === mi ? { ...it, status: "pending", error: undefined, url: undefined } : it,
        ),
      };
    });
    try {
      const url = teamApi(teamId).styleMutateRegenerateUrl(batch.batchId);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ mi }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      startPolling(batch.batchId);
    } catch (e: any) {
      setError(e?.message || "重试失败");
      setBatch((b) => {
        if (!b) return b;
        return {
          ...b,
          items: b.items.map((it) =>
            it.mi === mi ? { ...it, status: "error", error: e?.message || "重试失败" } : it,
          ),
        };
      });
    }
  }

  async function saveToLookbook() {
    if (!batch) return;
    const doneItems = batch.items.filter((it) => it.status === "done" && it.url);
    if (!doneItems.length) {
      setError("暂无成功生成的图片");
      return;
    }
    const now = new Date().toISOString();
    const brandColors = (knowledge?.brand?.colors || []).map((c: any) => c?.bg || c).filter(Boolean);
    const sourceImages = doneItems.map(() => {
      const src: { style?: { url: string; name: string }; fabric?: { url: string; name: string } } = {};
      if (mother?.kind === "library-style") src.style = { url: mother.url, name: mother.name };
      if (fabric?.kind === "library-fabric") src.fabric = { url: fabric.url, name: fabric.name };
      return Object.keys(src).length ? src : undefined;
    });
    const product: any = {
      mode: "style-mutate",
      title: name || "未命名款式裂变",
      description: description.trim() || "",
      colors: brandColors,
      images: doneItems.map((it) => ({
        slot: "style-mutate",
        label: it.label,
        url: it.url!,
      })),
      sourceImages,
      aiDraftRaw: JSON.stringify({
        batchId: batch.batchId,
        name,
        description,
        mother: batch.mother,
        fabric: batch.fabric,
        mutations: batch.mutations,
        items: batch.items,
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

  const inputCls =
    "w-full text-[12px] border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-primary-500 bg-white";
  const labelCls = "text-[10px] uppercase tracking-wider text-gray-500 mb-1 block";
  const hasSuccess = !!batch && batch.completed > 0;
  const motherPreview =
    mother?.kind === "upload" ? mother.preview : mother?.kind === "library-style" ? mother.url : "";
  const fabricPreview =
    fabric?.kind === "upload"
      ? fabric.preview
      : fabric?.kind === "library-fabric"
        ? fabric.url
        : "";

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr] h-[calc(100vh-64px)] min-h-0">
      {/* 左:表单 */}
      <div className="overflow-y-auto bg-white">
        <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-gray-200 px-5 py-3">
          <div className="flex items-center justify-between">
            <h1 className="text-[15px] font-medium text-gray-800">款式裂变</h1>
          </div>
          <span className="text-[10px] text-gray-500">
            1 母款 × 裂变轴选项 → N 张子款白底图(≤{MAX_MUTATIONS})
          </span>
        </header>

        <div className="p-5 space-y-5 max-w-2xl">
          {/* 名称 */}
          <div>
            <label className={labelCls}>
              名称 <span className="text-red-500">*</span>
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="如:春日雏菊连衣裙·裂变"
              className={inputCls}
              disabled={batchRunning}
            />
          </div>

          {/* 母款 */}
          <div>
            <label className={labelCls}>
              母款 <span className="text-red-500">*</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {mother && (
                <div className="w-28 rounded-lg border border-gray-200 bg-gray-50 overflow-hidden relative group">
                  {motherPreview ? (
                    <img src={motherPreview} alt={mother.name} className="w-28 h-24 object-cover" />
                  ) : (
                    <div className="w-28 h-24 flex items-center justify-center text-[10px] text-gray-300">无图</div>
                  )}
                  {mother.kind === "library-style" && (
                    <span className="absolute top-0.5 left-0.5 text-[8px] bg-primary-500 text-white px-1 rounded">库</span>
                  )}
                  {!batchRunning && (
                    <button
                      onClick={() => setMother(null)}
                      className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/50 text-white text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      ×
                    </button>
                  )}
                  <div className="px-1 py-0.5 text-[8px] text-gray-400 truncate" title={mother.name}>
                    {mother.name}
                  </div>
                </div>
              )}
              {!mother && !batchRunning && (
                <>
                  <button
                    onClick={() => styleRef.current?.click()}
                    className="w-28 h-28 rounded-lg border border-dashed border-gray-300 bg-gray-50 flex flex-col items-center justify-center cursor-pointer hover:border-primary-400 transition-colors shrink-0"
                  >
                    <span className="text-lg text-gray-400">+</span>
                    <span className="text-[10px] text-gray-400">上传母款</span>
                  </button>
                  <button
                    onClick={() => setPicker("style")}
                    className="w-28 h-28 rounded-lg border border-dashed border-primary-200 bg-primary-50/40 flex flex-col items-center justify-center cursor-pointer hover:border-primary-400 transition-colors shrink-0"
                  >
                    <span className="text-base text-primary-500">▦</span>
                    <span className="text-[10px] text-primary-600 mt-0.5">从库选择</span>
                  </button>
                </>
              )}
            </div>
            <input
              ref={styleRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => addMotherUpload(e.target.files)}
            />
          </div>

          {/* 裂变轴 */}
          <div>
            <label className={labelCls}>
              裂变轴{" "}
              <span className="text-gray-400 normal-case tracking-normal">
                (已选 {selectedMutations.length}/{MAX_MUTATIONS})
              </span>
            </label>
            <div className="space-y-4">
              {MUTATION_AXES.map((axis) => (
                <div key={axis.id}>
                  <div className="text-[11px] font-medium text-gray-700 mb-1.5">{axis.label}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {axis.options.map((opt) => {
                      const key = mutKey(axis.id, opt.id);
                      const on = selected.has(key);
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          disabled={batchRunning}
                          onClick={() => toggleOption(axis.id, opt.id)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] border transition-colors ${
                            on
                              ? "bg-primary-50 border-primary-400 text-primary-700"
                              : "bg-white border-gray-200 text-gray-600 hover:border-gray-400"
                          } disabled:opacity-50`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 可选锁定面料 */}
          <div>
            <label className={labelCls}>
              锁定面料 <span className="text-gray-400 normal-case tracking-normal">(可选)</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {fabric && (
                <div className="w-24 rounded-lg border border-gray-200 bg-gray-50 overflow-hidden relative group">
                  {fabricPreview ? (
                    <img src={fabricPreview} alt={fabric.name} className="w-24 h-20 object-cover" />
                  ) : fabric.kind === "library-fabric" && fabric.hex ? (
                    <div className="w-24 h-20" style={{ backgroundColor: fabric.hex }} />
                  ) : (
                    <div className="w-24 h-20 bg-gray-200" />
                  )}
                  {fabric.kind === "library-fabric" && (
                    <span className="absolute top-0.5 left-0.5 text-[8px] bg-primary-500 text-white px-1 rounded">库</span>
                  )}
                  {!batchRunning && (
                    <button
                      onClick={() => setFabric(null)}
                      className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/50 text-white text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      ×
                    </button>
                  )}
                  <div className="px-1 py-0.5 text-[8px] text-gray-400 truncate" title={fabric.name}>
                    {fabric.name}
                  </div>
                </div>
              )}
              {!fabric && !batchRunning && (
                <>
                  <button
                    onClick={() => fabricRef.current?.click()}
                    className="w-24 h-24 rounded-lg border border-dashed border-gray-300 bg-gray-50 flex flex-col items-center justify-center cursor-pointer hover:border-primary-400 transition-colors shrink-0"
                  >
                    <span className="text-lg text-gray-400">+</span>
                    <span className="text-[10px] text-gray-400">上传面料</span>
                  </button>
                  <button
                    onClick={() => setPicker("fabric")}
                    className="w-24 h-24 rounded-lg border border-dashed border-primary-200 bg-primary-50/40 flex flex-col items-center justify-center cursor-pointer hover:border-primary-400 transition-colors shrink-0"
                  >
                    <span className="text-base text-primary-500">▦</span>
                    <span className="text-[10px] text-primary-600 mt-0.5">从库选择</span>
                  </button>
                </>
              )}
            </div>
            <input
              ref={fabricRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => addFabricUpload(e.target.files)}
            />
            <span className="text-[10px] text-gray-400">子款默认继承母款面料花色；锁定后面料保持不变</span>
          </div>

          {/* 描述 */}
          <div>
            <label className={labelCls}>其他描述</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="补充希望保留的母款 DNA、禁忌改动等(可选)"
              className={`${inputCls} resize-none`}
              disabled={batchRunning}
            />
          </div>

          {selectedMutations.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-[11px] text-gray-600">
              将生成{" "}
              <span className="font-medium text-primary-600">{selectedMutations.length}</span>{" "}
              张子款白底图
              {selectedMutations.length > MAX_MUTATIONS && (
                <span className="text-red-500 ml-2">超过上限 {MAX_MUTATIONS}</span>
              )}
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-[12px] text-red-600">
              ⚠ {error}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={submit}
              disabled={!canSubmit}
              className="px-6 py-3 rounded-2xl bg-primary-500 hover:bg-primary-600 disabled:opacity-40 text-white font-medium text-sm shadow-lg transition-colors"
            >
              {submitting ? "上传中…" : batchRunning ? "生成中…" : "生成裂变款"}
            </button>
            {batchRunning && batch && (
              <span className="text-[11px] text-gray-500">
                {batch.completed + batch.failed}/{batch.total}
                {batch.failed > 0 && (
                  <span className="text-amber-600 ml-1">({batch.failed} 张失败)</span>
                )}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 右:结果网格 */}
      <aside className="border-l border-gray-200 bg-gray-50 overflow-y-auto min-h-0 p-5 space-y-5">
        {!batch && !submitting && (
          <div className="flex items-center justify-center h-full">
            <div className="rounded-xl border border-dashed border-gray-300 bg-white text-center text-[12px] text-gray-400 px-8 py-10 max-w-[280px]">
              选择母款并勾选裂变轴后
              <br />
              点击「生成裂变款」
            </div>
          </div>
        )}

        {submitting && (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-primary-200 border-t-primary-500 rounded-full animate-spin" />
              <span className="text-[12px] text-gray-500">正在上传并启动批次…</span>
            </div>
          </div>
        )}

        {batch && (
          <>
            <div className="flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-wider text-gray-500">
                裂变结果 · {batch.items.length} 张
              </div>
              {hasSuccess && (
                <button
                  onClick={saveToLookbook}
                  className="text-[12px] bg-primary-500 hover:bg-primary-600 text-white px-3 py-1.5 rounded-lg font-medium transition-colors"
                >
                  保存到 Lookbook ({batch.completed}/{batch.total})
                </button>
              )}
            </div>

            {/* 母款锚点 */}
            <div className="flex items-center gap-3 text-[11px] text-gray-600">
              <span className="text-gray-400 shrink-0">母款:</span>
              {batch.mother?.url ? (
                <img
                  src={batch.mother.url}
                  alt=""
                  className="w-12 h-12 rounded-lg object-cover border border-gray-200"
                />
              ) : (
                <div className="w-12 h-12 rounded-lg bg-gray-100" />
              )}
              <span className="truncate">{batch.mother?.name || "(无)"}</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {batch.items.map((cell) => (
                <div
                  key={`m-${cell.mi}`}
                  className="rounded-xl border border-gray-200 bg-white overflow-hidden"
                >
                  <div className="aspect-square relative bg-white">
                    {cell.status === "pending" && (
                      <div className="w-full h-full flex items-center justify-center flex-col gap-1">
                        <div className="w-6 h-6 border-2 border-primary-200 border-t-primary-500 rounded-full animate-spin" />
                        <span className="text-[9px] text-gray-400">生成中…</span>
                      </div>
                    )}
                    {cell.status === "done" && (
                      <img src={cell.url} alt={cell.label} className="w-full h-full object-contain" />
                    )}
                    {cell.status === "error" && (
                      <div className="w-full h-full flex items-center justify-center flex-col gap-1 px-2 text-center">
                        <span className="text-[10px] text-red-500">{cell.error || "生成失败"}</span>
                        <button
                          onClick={() => retryCell(cell.mi)}
                          className="text-[10px] text-primary-600 underline hover:text-primary-700"
                        >
                          重试
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="px-2 py-1.5 text-[10px] text-gray-600 border-t border-gray-100 truncate" title={cell.label}>
                    {cell.label}
                  </div>
                </div>
              ))}
            </div>

            {batch.items.find((it) => it.prompt) && (
              <details className="text-[11px] text-gray-500">
                <summary className="cursor-pointer hover:text-gray-700">查看生成 prompt</summary>
                <pre className="mt-2 whitespace-pre-wrap leading-relaxed text-gray-600 max-h-60 overflow-y-auto rounded-lg bg-white border border-gray-200 p-3 font-mono text-[10px]">
                  {batch.items
                    .filter((it) => it.prompt)
                    .slice(0, 2)
                    .map((it) => `# ${it.label}\n${it.prompt}`)
                    .join("\n\n")}
                </pre>
              </details>
            )}
          </>
        )}
      </aside>

      <StyleLibraryPicker
        mode={picker}
        knowledge={knowledge}
        onClose={() => setPicker(null)}
        onStyle={(p) => {
          setMother({
            kind: "library-style",
            id: crypto.randomUUID(),
            styleId: p.styleId,
            name: p.name,
            url: p.url,
          });
          setPicker(null);
        }}
        onFabric={(p) => {
          setFabric({
            kind: "library-fabric",
            id: crypto.randomUUID(),
            matId: p.matId,
            colorIdx: p.colorIdx,
            name: p.name,
            url: p.url,
            hex: p.hex,
          });
          setPicker(null);
        }}
      />
    </div>
  );
}

// ─── 库选择弹窗(款式 / 面料) ─────────────────────────────────
function StyleLibraryPicker({
  mode,
  knowledge,
  onClose,
  onStyle,
  onFabric,
}: {
  mode: null | "style" | "fabric";
  knowledge?: KnowledgeDeps;
  onClose: () => void;
  onStyle: (p: { styleId: string; url: string; name: string }) => void;
  onFabric: (p: { matId: string; colorIdx: number; url: string; name: string; hex?: string }) => void;
}) {
  const [q, setQ] = useState("");
  useEffect(() => {
    if (mode) setQ("");
  }, [mode]);
  if (!mode) return null;

  const isFabric = mode === "fabric";
  const materials = (knowledge?.materials || []) as any[];
  const cards: {
    matId: string;
    matCategory: string;
    matName: string;
    colorIdx: number;
    url: string;
    hex?: string;
    colorName?: string;
  }[] = [];
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
        });
      });
    } else if (m.image) {
      cards.push({
        matId: m.id,
        matCategory: matCat,
        matName,
        colorIdx: -1,
        url: m.image || "",
      });
    }
  }
  const cardFilter = cards.filter((c) => {
    if (!q.trim()) return true;
    const k = q.trim().toLowerCase();
    return [c.matName, c.matCategory, c.colorName || "", c.hex || ""].some((f) =>
      f.toLowerCase().includes(k),
    );
  });

  const styles = (knowledge?.styles || []) as any[];
  const styleFilter = styles.filter((s: any) => {
    if (!q.trim()) return true;
    const k = q.trim().toLowerCase();
    return [s?.name || "", s?.category || ""].some((f) => String(f).toLowerCase().includes(k));
  });

  return (
    <Modal open onClose={onClose} title={isFabric ? "选择面料色卡" : "选择母款"} maxWidth="max-w-5xl">
      <div className="mb-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={isFabric ? "搜索面料名 / 颜色 / 品类..." : "搜索款式名 / 品类..."}
          className="w-full text-[12px] border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-primary-500"
          autoFocus
        />
      </div>

      {isFabric ? (
        cardFilter.length === 0 ? (
          <div className="text-center text-[12px] text-gray-400 py-16">面料库暂无材料。</div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 max-h-[60vh] overflow-y-auto pr-1">
            {cardFilter.map((c) => {
              const fullName = c.colorName ? `${c.matName} · ${c.colorName}` : c.colorName || c.hex || c.matName;
              return (
                <button
                  key={`${c.matId}-${c.colorIdx}`}
                  onClick={() =>
                    onFabric({
                      matId: c.matId,
                      colorIdx: c.colorIdx,
                      url: c.url,
                      name: fullName,
                      hex: c.hex,
                    })
                  }
                  className="text-left rounded-xl border border-gray-200 bg-white hover:border-primary-400 hover:shadow-sm transition-all overflow-hidden"
                >
                  <div className="aspect-square w-full">
                    {c.url ? (
                      <img src={c.url} alt={fullName} className="w-full h-full object-cover" />
                    ) : (
                      <div
                        className="w-full h-full flex items-center justify-center text-[10px] text-gray-400"
                        style={{ backgroundColor: c.hex && /^#/.test(c.hex) ? c.hex : "#f3f4f6" }}
                      >
                        {c.hex || "无图"}
                      </div>
                    )}
                  </div>
                  <div className="px-1.5 py-1 text-[9px] text-gray-700 truncate" title={fullName}>
                    {fullName}
                  </div>
                </button>
              );
            })}
          </div>
        )
      ) : styleFilter.length === 0 ? (
        <div className="text-center text-[12px] text-gray-400 py-16">款式库暂无款式。</div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 max-h-[60vh] overflow-y-auto pr-1">
          {styleFilter.map((s: any) => (
            <button
              key={s.id}
              onClick={() => onStyle({ styleId: s.id, url: s.image || "", name: s.name || "未命名款式" })}
              className="text-left rounded-xl border border-gray-200 bg-white hover:border-primary-400 hover:shadow-sm transition-all overflow-hidden"
            >
              <div className="aspect-square w-full">
                {s.image ? (
                  <img src={s.image} alt={s.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-300">无图</div>
                )}
              </div>
              <div className="px-1.5 py-1 text-[9px] text-gray-700 truncate">{s.name}</div>
            </button>
          ))}
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <button onClick={onClose} className="text-[12px] text-gray-500 hover:text-gray-700 px-3 py-1.5">
          取消
        </button>
      </div>
    </Modal>
  );
}

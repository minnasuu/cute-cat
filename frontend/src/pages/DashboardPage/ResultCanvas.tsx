import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Lock } from "lucide-react";
import html2canvas from "html2canvas";
import DashboardWorkflowPipeline from "../../components/DashboardWorkflowPipeline";
import ReactSandboxPreview from "./ReactSandboxPreview";
import type { PlanStep, TeamCat, WorkflowRun, WorkflowRunStep } from "./workbenchTypes";
import {
  normalizeRunSteps,
  sortedRunSteps,
  stepDisplayTextForRunStep,
} from "./RunExecutionProcess";

export type { PlanStep } from "./workbenchTypes";

type HtmlBundle = {
  candidates: Array<{
    id: string;
    title?: string;
    html: string;
  }>;
};

function tryParseHtmlBundle(raw: unknown): HtmlBundle | null {
  if (typeof raw !== "string" || raw.trim().length === 0) return null;
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== "object") return null;
    const cands = (v as any).candidates;
    if (!Array.isArray(cands) || cands.length === 0) return null;
    const normalized = cands
      .map((c: any, i: number) => ({
        id: typeof c?.id === "string" ? c.id : String(i + 1),
        title: typeof c?.title === "string" ? c.title : undefined,
        html: typeof c?.html === "string" ? c.html : "",
      }))
      .filter((c: any) => c.html.trim().length > 0);
    if (normalized.length === 0) return null;
    return { candidates: normalized };
  } catch {
    return null;
  }
}

export default function ResultCanvas({
  workflowName,
  userPrompt,
  displayRun,
  streamingRunId,
  streamingStatus,
  streamingSteps,
  isSubmitting,
  waitingForRunRecord,
  planSteps,
  catNameById,
  cats,
}: {
  workflowName: string;
  userPrompt: string;
  displayRun: WorkflowRun | null;
  /** SSE 流式执行中：后端创建的 runId */
  streamingRunId?: string | null;
  /** SSE 流式执行中：当前状态（running/failed/success） */
  streamingStatus?: string | null;
  /** SSE 流式执行中：实时 steps（含 partial 文本） */
  streamingSteps?: WorkflowRunStep[] | null;
  isSubmitting: boolean;
  /** 已提交但尚未在列表里匹配到本轮 run */
  waitingForRunRecord: boolean;
  planSteps: PlanStep[];
  catNameById: Record<string, string>;
  cats: TeamCat[];
}) {
  // NOTE: keep these local to avoid module export resolution flakiness in tooling.
  const updateWorkflowRunLocal = useCallback(
    async (runId: string, payload: { steps: unknown }) => {
      const response = await fetch(`/api/workflows/runs/${encodeURIComponent(runId)}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(
          `Failed to update workflow run: HTTP ${response.status} ${text.slice(0, 200)}`,
        );
      }
      return response.json().catch(() => ({}));
    },
    [],
  );

  const uploadImageLocal = useCallback(async (args: { file: File; runId?: string }) => {
    const form = new FormData();
    form.append("image", args.file);
    if (args.runId) form.append("runId", args.runId);
    const response = await fetch("/api/uploads/image", {
      method: "POST",
      credentials: "include",
      body: form,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Failed to upload image: HTTP ${response.status} ${text.slice(0, 200)}`);
    }
    return (await response.json()) as { url: string };
  }, []);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [frameReady, setFrameReady] = useState(false);
  const [exportingPng, setExportingPng] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editedHtml, setEditedHtml] = useState<string | null>(null);
  const [pendingImageToken, setPendingImageToken] = useState<string | null>(null);
  const imgFileInputRef = useRef<HTMLInputElement | null>(null);
  const [showExecutionBack, setShowExecutionBack] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);

  const serverSteps = useMemo(
    () => sortedRunSteps(normalizeRunSteps(displayRun?.steps)),
    [displayRun?.steps],
  );
  const streamSteps = useMemo(
    () => sortedRunSteps(normalizeRunSteps(streamingSteps ?? [])),
    [streamingSteps],
  );
  /** SSE 已与 run 结束：优先用服务端快照；执行中优先用流式 steps（与后台进度一致） */
  const streamTerminal =
    streamingStatus === "success" || streamingStatus === "failed";
  const effectiveSteps = useMemo(() => {
    const live =
      !!streamingRunId &&
      !streamTerminal &&
      (streamingStatus === "running" || streamSteps.length > 0);
    if (live) return streamSteps.length > 0 ? streamSteps : serverSteps;
    if (serverSteps.length > 0) return serverSteps;
    return streamSteps;
  }, [
    streamingRunId,
    streamTerminal,
    streamingStatus,
    streamSteps,
    serverSteps,
  ]);

  /** waitingForRunRecord 由上方专用流水线块展示，避免重复渲染两条流水线 */
  const showPipeline =
    !streamTerminal &&
    !waitingForRunRecord &&
    (!!streamingRunId || displayRun?.status === "running");

  const failed =
    streamTerminal && streamingStatus === "failed"
      ? true
      : displayRun?.status === "failed";
  const lastStep = effectiveSteps.length
    ? effectiveSteps[effectiveSteps.length - 1]
    : null;
  const failedStep = useMemo(
    () => effectiveSteps.find((s) => s.success === false || s.status === "error"),
    [effectiveSteps],
  );

  const showResultPanel =
    !isSubmitting &&
    !waitingForRunRecord &&
    (streamTerminal ||
      (displayRun != null && displayRun.status !== "running"));

  /** 执行失败：也展示流水线，标出失败步骤 */
  const showFailedPipeline =
    !isSubmitting &&
    !waitingForRunRecord &&
    !showPipeline &&
    failed &&
    effectiveSteps.length > 0;

  const showBrowseHint =
    !isSubmitting &&
    !waitingForRunRecord &&
    !displayRun &&
    !streamingRunId &&
    streamSteps.length === 0;

  const resultHeadline = failed
    ? stepDisplayTextForRunStep(failedStep) || "执行未全部成功"
    : stepDisplayTextForRunStep(lastStep) ||
      (effectiveSteps.length ? "已完成全部步骤" : "");

  const [selectedHtmlCandidateId, setSelectedHtmlCandidateId] = useState<string | null>(null);

  /** 检测最后一步是否为 HTML 页面类型（历史记录） */
  const htmlBundle = useMemo(() => {
    if (!lastStep || failed) return null;
    if (lastStep.resultType === "html-page-bundle" && lastStep.resultData) {
      return tryParseHtmlBundle(lastStep.resultData);
    }
    return null;
  }, [lastStep, failed]);

  const htmlPageData = useMemo(() => {
    if (!lastStep || failed) return null;
    if (htmlBundle?.candidates?.length) {
      const preferred =
        (selectedHtmlCandidateId
          ? htmlBundle.candidates.find((c) => c.id === selectedHtmlCandidateId)
          : null) ?? htmlBundle.candidates[0];
      return preferred?.html ?? null;
    }
    if (lastStep.resultType === "html-page" && lastStep.resultData) {
      return lastStep.resultData;
    }
    // 兼容：summary 以 <!DOCTYPE 或 <html 开头
    const s = (lastStep.summary || "").trim();
    if (s.startsWith("<!DOCTYPE") || s.startsWith("<html")) return s;
    return null;
  }, [htmlBundle, lastStep, failed, selectedHtmlCandidateId]);

  const effectiveHtml = editedHtml ?? htmlPageData;

  /** React 沙箱源码（shadcn 风格 + Tailwind，由前端工程师步骤产出） */
  const reactSandboxCode = useMemo(() => {
    if (!lastStep || failed) return null;
    if (lastStep.resultType === "react-sandbox" && lastStep.resultData) {
      return lastStep.resultData;
    }
    return null;
  }, [lastStep, failed]);

  const previewKind = reactSandboxCode
    ? "react"
    : effectiveHtml
      ? "html"
      : null;

  const actionBtnClass =
    "inline-flex items-center gap-1.5 rounded-md bg-white/80 hover:bg-white disabled:hover:bg-white/80 disabled:opacity-60 px-2.5 py-1 text-[11px] font-semibold text-neutral-700 ring-1 ring-black/[0.08] shadow-sm transition-colors";
  const hasExecutionSteps = effectiveSteps.length > 0;

  const downloadBlob = useCallback((blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }, []);

  const onDownloadHtml = useCallback(() => {
    if (!effectiveHtml) return;
    const blob = new Blob([effectiveHtml], { type: "text/html;charset=utf-8" });
    const safe = (workflowName || "document")
      .trim()
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, " ");
    downloadBlob(blob, `${safe || "document"}.html`);
  }, [downloadBlob, effectiveHtml, workflowName]);

  const onExportPdf = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe || !frameReady) return;
    const win = iframe.contentWindow;
    if (!win) return;
    try {
      win.focus();
      win.print();
    } catch {
      // ignore
    }
  }, [frameReady]);

  const onExportPng = useCallback(async () => {
    const iframe = iframeRef.current;
    if (!iframe || !frameReady) return;
    const doc = iframe.contentDocument;
    const el = doc?.documentElement || doc?.body;
    if (!el) return;

    setExportingPng(true);
    try {
      const canvas = await html2canvas(el as unknown as HTMLElement, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: false,
        windowWidth: el.scrollWidth,
        windowHeight: el.scrollHeight,
      });

      await new Promise<void>((resolve, reject) => {
        canvas.toBlob((blob: Blob | null) => {
          if (!blob) return reject(new Error("toBlob failed"));
          const safe = (workflowName || "document")
            .trim()
            .replace(/[\\/:*?"<>|]+/g, "-")
            .replace(/\s+/g, " ");
          downloadBlob(blob, `${safe || "document"}.png`);
          resolve();
        }, "image/png");
      });
    } finally {
      setExportingPng(false);
    }
  }, [downloadBlob, frameReady, workflowName]);

  // 切换到其它 run 时重置编辑态，避免串 run
  useEffect(() => {
    setSaving(false);
    setEditedHtml(null);
    setPendingImageToken(null);
    setShowExecutionBack(false);
    setSelectedHtmlCandidateId(null);
  }, [displayRun?.id]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const el = exportMenuRef.current;
      if (el && !el.contains(e.target as Node)) setExportMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const injectEditCapabilities = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe || !frameReady) return;
    const doc = iframe.contentDocument;
    const win = iframe.contentWindow;
    if (!doc || !win) return;

    // 注入轻量样式（不影响布局）
    const styleId = "cuca-editor-style";
    if (!doc.getElementById(styleId)) {
      const styleEl = doc.createElement("style");
      styleEl.id = styleId;
      styleEl.textContent = `
        [data-cuca-editable="1"][contenteditable="true"]:focus {
          outline: 2px solid rgba(59, 130, 246, 0.7);
          outline-offset: 2px;
        }
        img[data-cuca-img-token] {
          cursor: pointer;
        }
        img[data-cuca-img-token]:hover {
          outline: 2px dashed rgba(59, 130, 246, 0.55);
          outline-offset: 2px;
        }
      `;
      doc.head.appendChild(styleEl);
    }

    // 让常见文本承载元素可编辑（不改 class/style）
    const editableSelector = [
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "p",
      "span",
      "a",
      "li",
      "blockquote",
      "figcaption",
      "label",
      "button",
      "small",
      "strong",
      "em",
      "dt",
      "dd",
    ].join(",");

    doc.querySelectorAll<HTMLElement>(editableSelector).forEach((el) => {
      if (el.closest("[contenteditable]")) return;
      // 不编辑脚本/样式标签
      const tag = el.tagName.toLowerCase();
      if (tag === "script" || tag === "style") return;
      el.setAttribute("contenteditable", "true");
      el.setAttribute("data-cuca-editable", "1");
    });

    // 为所有图片打 token，并通过 postMessage 通知父级打开文件选择
    const imgs = Array.from(doc.querySelectorAll<HTMLImageElement>("img"));
    imgs.forEach((img, idx) => {
      if (!img.getAttribute("data-cuca-img-token")) {
        img.setAttribute("data-cuca-img-token", String(idx + 1));
      }
    });

    const msgHandler = (ev: MessageEvent) => {
      if (ev.source !== win) return;
      const data = ev.data as any;
      if (!data || data.__cuca_editor__ !== true) return;
      if (data.type === "pickImage" && typeof data.token === "string") {
        setPendingImageToken(data.token);
        imgFileInputRef.current?.click();
      }
    };

    // 避免重复注册：先清理再注册
    window.removeEventListener("message", msgHandler);
    window.addEventListener("message", msgHandler);

    // 在 iframe 内注册 click 监听（用捕获，尽量早点拦截）
    const clickKey = "__cuca_img_click_bound__";
    if (!(win as any)[clickKey]) {
      (win as any)[clickKey] = true;
      doc.addEventListener(
        "click",
        (e) => {
          const t = e.target as HTMLElement | null;
          if (!t) return;
          if (t.tagName?.toLowerCase() !== "img") return;
          const img = t as HTMLImageElement;
          const token = img.getAttribute("data-cuca-img-token");
          if (!token) return;
          e.preventDefault();
          e.stopPropagation();
          win.parent.postMessage(
            { __cuca_editor__: true, type: "pickImage", token },
            "*",
          );
        },
        true,
      );
    }
  }, [frameReady]);

  const removeEditCapabilities = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument;
    if (!doc) return;
    doc
      .querySelectorAll<HTMLElement>('[data-cuca-editable="1"][contenteditable="true"]')
      .forEach((el) => {
        el.removeAttribute("contenteditable");
      });
  }, []);

  // 默认：HTML 预览即为可编辑态；非 HTML 时移除编辑能力
  useEffect(() => {
    if (previewKind !== "html") {
      removeEditCapabilities();
      return;
    }
    injectEditCapabilities();
  }, [injectEditCapabilities, previewKind, removeEditCapabilities]);

  const serializeIframeHtml = useCallback((): string | null => {
    const iframe = iframeRef.current;
    const doc = iframe?.contentDocument;
    if (!doc) return null;
    const doctype = doc.doctype
      ? `<!DOCTYPE ${doc.doctype.name}${
          doc.doctype.publicId ? ` PUBLIC "${doc.doctype.publicId}"` : ""
        }${doc.doctype.systemId ? ` "${doc.doctype.systemId}"` : ""}>`
      : "<!DOCTYPE html>";
    const html = doc.documentElement?.outerHTML;
    if (!html) return null;
    return `${doctype}\n${html}`;
  }, []);

  const onSaveEdits = useCallback(async () => {
    if (previewKind !== "html") return;
    if (!displayRun?.id) return;
    if (!displayRun.steps || displayRun.steps.length === 0) return;
    const newHtml = serializeIframeHtml();
    if (!newHtml) return;

    // 找到要写回的 step（优先 lastStep.index；fallback：最后一个 html-page）
    const targetIndex =
      typeof lastStep?.index === "number"
        ? lastStep.index
        : [...displayRun.steps]
            .reverse()
            .find((s) => s.resultType === "html-page")?.index ?? null;
    if (targetIndex == null) return;

    const nextSteps = displayRun.steps.map((s) => {
      if (s.index !== targetIndex) return s;
      return {
        ...s,
        resultType: "html-page",
        resultData: newHtml,
        // summary 保持原值（summary 更像给列表/步骤展示的短文本）
      };
    });

    setSaving(true);
    try {
      await updateWorkflowRunLocal(displayRun.id, { steps: nextSteps });
      setEditedHtml(newHtml);
    } finally {
      setSaving(false);
    }
  }, [
    displayRun?.id,
    displayRun?.steps,
    lastStep?.index,
    previewKind,
    serializeIframeHtml,
    updateWorkflowRunLocal,
  ]);

  const onImageFilePicked = useCallback(
    async (file: File | null) => {
      if (!file) return;
      if (!pendingImageToken) return;
      const iframe = iframeRef.current;
      const doc = iframe?.contentDocument;
      if (!doc) return;

      const { url } = await uploadImageLocal({
        file,
        runId: displayRun?.id ?? undefined,
      });
      const img = doc.querySelector<HTMLImageElement>(
        `img[data-cuca-img-token="${CSS.escape(pendingImageToken)}"]`,
      );
      if (img) img.src = url;
      setPendingImageToken(null);
      if (imgFileInputRef.current) imgFileInputRef.current.value = "";
    },
    [displayRun?.id, pendingImageToken, uploadImageLocal],
  );

  return (
    <div
      className="relative flex flex-col h-full min-h-[min(70vh,560px)] bg-surface overflow-hidden"
      aria-label="创作画布"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(15, 23, 42, 0.07) 1px, transparent 1px)",
          backgroundSize: "18px 18px",
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-br from-primary-50/40 via-transparent to-accent-50/30 pointer-events-none" />

      <div className="relative z-10 flex-1 overflow-y-auto space-y-4 flex flex-col justify-center items-center">
        {isSubmitting ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <Loader2
              className="w-9 h-9 text-primary-500 animate-spin"
              strokeWidth={2}
            />
            <p className="text-sm font-bold text-text-secondary">
              正在提交任务…
            </p>
          </div>
        ) : null}

        {!isSubmitting && waitingForRunRecord && !displayRun ? (
          <DashboardWorkflowPipeline
            workflowName={workflowName}
            planSteps={planSteps}
            catNameById={catNameById}
            cats={cats}
            running
            runSteps={[]}
            footerHint="正在创建运行记录…"
          />
        ) : null}

        {showBrowseHint ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-surface-secondary/35 py-14 px-6 text-center">
            <p className="text-sm font-semibold text-text-secondary">
              在左侧点选一条历史任务可查看详情与预览
            </p>
            <p className="text-xs text-text-tertiary font-medium max-w-sm">
              或在本页输入新的创作需求后点击「开始创作」；执行开始后输入框会清空，可随时填写下一条。
            </p>
          </div>
        ) : null}

        {/* 执行中：流水线与流式 steps 对齐，无需等 workbench 轮询 */}
        {showPipeline ? (
          <DashboardWorkflowPipeline
            workflowName={workflowName || displayRun?.workflowName || "执行中"}
            planSteps={planSteps}
            catNameById={catNameById}
            cats={cats}
            running
            runSteps={effectiveSteps}
            disableTypewriter
          />
        ) : null}

        {/* 执行失败：依然展示流水线，并标出失败步骤 */}
        {showFailedPipeline ? (
          <DashboardWorkflowPipeline
            workflowName={workflowName || displayRun?.workflowName || "执行失败"}
            planSteps={planSteps}
            catNameById={catNameById}
            cats={cats}
            running={false}
            runSteps={effectiveSteps}
            disableTypewriter
          />
        ) : null}

        {/* 已结束：结果为主；步骤明细在左侧历史卡片「查看执行过程」 */}
        {showResultPanel ? (
          <section className={`space-y-3 ${previewKind ? "w-full" : ""}`}>
            {/* HTML 页面预览 */}
            {previewKind ? (
              <div className="overflow-hidden">
                {/* macOS 风格窗口标题栏 + Safari 式地址栏 */}
                <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 border-b border-black/[0.07] bg-gradient-to-b from-[#ececec] to-[#dededf]">
                  <div
                    className="flex items-center gap-1.5 shrink-0 pl-0.5"
                    aria-hidden="true"
                  >
                    <span className="size-[11px] rounded-full bg-[#ff5f57] shadow-[inset_0_-1px_1px_rgba(0,0,0,0.15)] ring-1 ring-black/[0.12]" />
                    <span className="size-[11px] rounded-full bg-[#febc2e] shadow-[inset_0_-1px_1px_rgba(0,0,0,0.12)] ring-1 ring-black/[0.08]" />
                    <span className="size-[11px] rounded-full bg-[#28c840] shadow-[inset_0_-1px_1px_rgba(0,0,0,0.12)] ring-1 ring-black/[0.1]" />
                  </div>
                  <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md bg-white/95 px-2.5 sm:px-3 py-1 shadow-[inset_0_1px_1px_rgba(0,0,0,0.05)] ring-1 ring-black/[0.08]">
                    <Lock
                      className="size-3 shrink-0 text-emerald-600/85"
                      strokeWidth={2}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate text-center text-[11px] font-medium text-neutral-600 font-mono">
                      {previewKind === "react" ? "preview.tsx" : "preview.html"}
                    </span>
                    <span className="shrink-0 text-[10px] font-medium tabular-nums text-neutral-400">
                      {(previewKind === "react"
                        ? reactSandboxCode!
                        : effectiveHtml!
                      ).length.toLocaleString()}{" "}
                      字符
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {previewKind === "html" && htmlBundle?.candidates?.length ? (
                      <div className="flex items-center gap-1.5 pr-1">
                        {htmlBundle.candidates.slice(0, 3).map((c) => {
                          const active =
                            (selectedHtmlCandidateId ?? htmlBundle.candidates[0]?.id) ===
                            c.id;
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => setSelectedHtmlCandidateId(c.id)}
                              className={`inline-flex items-center rounded-md px-2 py-1 text-[11px] font-semibold ring-1 ring-black/[0.08] shadow-sm transition-colors ${
                                active
                                  ? "bg-primary-600 text-white"
                                  : "bg-white/80 hover:bg-white text-neutral-700"
                              }`}
                              title={c.title || `方案 ${c.id}`}
                            >
                              {c.title || `方案 ${c.id}`}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                    {hasExecutionSteps ? (
                      <button
                        type="button"
                        onClick={() => setShowExecutionBack((v) => !v)}
                        className={actionBtnClass}
                        title={
                          showExecutionBack ? "返回结果预览" : "查看执行过程"
                        }
                        aria-pressed={showExecutionBack}
                      >
                        {showExecutionBack ? "返回预览" : "查看执行过程"}
                      </button>
                    ) : null}
                    {previewKind === "html" ? (
                      <>
                        <button
                          type="button"
                          onClick={onSaveEdits}
                          disabled={saving || !displayRun?.id}
                          className={actionBtnClass}
                          title={
                            saving ? "保存中…" : "保存并回写到当前任务"
                          }
                        >
                          {saving ? (
                            <Loader2
                              className="size-3.5 animate-spin"
                              aria-hidden
                            />
                          ) : null}
                          保存
                        </button>
                      </>
                    ) : null}

                    <div ref={exportMenuRef} className="relative">
                      <button
                        type="button"
                        onClick={() => setExportMenuOpen((v) => !v)}
                        className={`${actionBtnClass} pr-7 relative`}
                        title="导出"
                        aria-haspopup="menu"
                        aria-expanded={exportMenuOpen}
                      >
                        导出
                        <svg
                          className={`absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-500 transition-transform ${exportMenuOpen ? "rotate-180" : ""}`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2.5}
                          aria-hidden="true"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M19 9l-7 7-7-7"
                          />
                        </svg>
                      </button>

                      {exportMenuOpen ? (
                        <div
                          role="menu"
                          className="absolute right-0 top-full mt-2 w-44 rounded-xl border border-border bg-surface shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150"
                        >
                          <button
                            type="button"
                            role="menuitem"
                            disabled={!frameReady || exportingPng}
                            onClick={() => {
                              setExportMenuOpen(false);
                              void onExportPng();
                            }}
                            className="w-full px-3 py-2.5 text-xs font-semibold text-text-secondary hover:bg-surface-secondary text-left disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed cursor-pointer transition-colors"
                          >
                            {exportingPng ? "PNG（导出中…）" : "导出 PNG"}
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            disabled={!frameReady}
                            onClick={() => {
                              setExportMenuOpen(false);
                              onExportPdf();
                            }}
                            className="w-full px-3 py-2.5 text-xs font-semibold text-text-secondary hover:bg-surface-secondary text-left disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed cursor-pointer transition-colors"
                          >
                            导出 PDF
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            disabled={!effectiveHtml}
                            onClick={() => {
                              setExportMenuOpen(false);
                              onDownloadHtml();
                            }}
                            className="w-full px-3 py-2.5 text-xs font-semibold text-text-secondary hover:bg-surface-secondary text-left disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed cursor-pointer transition-colors"
                          >
                            导出 HTML
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="relative w-full" style={{ perspective: 1400 }}>
                  <div
                    className="relative w-full transition-transform duration-500 ease-[cubic-bezier(.2,.8,.2,1)]"
                    style={{
                      transformStyle: "preserve-3d",
                      transform: showExecutionBack
                        ? "rotateY(180deg)"
                        : "rotateY(0deg)",
                    }}
                  >
                    <div
                      className="w-full"
                      style={{ backfaceVisibility: "hidden" as any }}
                    >
                      {previewKind === "react" ? (
                        <ReactSandboxPreview
                          code={reactSandboxCode!}
                          iframeRef={(el) => {
                            iframeRef.current = el;
                            if (el) setFrameReady(false);
                          }}
                          onLoad={() => setFrameReady(true)}
                        />
                      ) : (
                        <iframe
                          srcDoc={effectiveHtml!}
                          sandbox="allow-scripts allow-same-origin"
                          ref={(el) => {
                            iframeRef.current = el;
                          }}
                          onLoad={() => setFrameReady(true)}
                          className="w-full border-0"
                          style={{
                            minHeight: "min(60vh, 520px)",
                            height: "calc(100vh - 109px)",
                          }}
                          title="生成的网页预览"
                        />
                      )}
                    </div>

                    <div
                      className="absolute inset-0 w-full"
                      style={{
                        backfaceVisibility: "hidden" as any,
                        transform: "rotateY(180deg)",
                      }}
                    >
                      <div
                        className="w-full border-0 bg-surface"
                        style={{
                          minHeight: "min(60vh, 520px)",
                          height: "calc(100vh - 109px)",
                        }}
                      >
                        <div className="h-full overflow-y-auto">
                          {hasExecutionSteps ? (
                            <DashboardWorkflowPipeline
                              workflowName={
                                workflowName ||
                                displayRun?.workflowName ||
                                "执行过程"
                              }
                              planSteps={planSteps}
                              catNameById={catNameById}
                              cats={cats}
                              running={false}
                              runSteps={effectiveSteps}
                              disableTypewriter
                            />
                          ) : (
                            <p className="text-xs font-medium text-text-tertiary">
                              暂无执行过程数据
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              // 失败态已在上方渲染 DashboardWorkflowPipeline（含失败步骤），避免重复展示“失败结果卡片”
              !showFailedPipeline ? (
                <div
                  className={`rounded-2xl border px-4 py-4 ${
                    failed
                      ? "border-danger-200 bg-danger-50/50"
                      : "border-primary-200/80 bg-white/90 shadow-sm"
                  }`}
                >
                  <p className="text-[10px] font-black uppercase tracking-wide text-text-tertiary mb-2">
                    {failed ? "执行结果" : "生成结果"}
                  </p>
                  {effectiveSteps.length === 0 ? (
                    <p className="text-sm font-medium text-text-secondary">
                      本轮已结束（后端未写入步骤明细）。可前往历史记录查看状态。
                    </p>
                  ) : resultHeadline ? (
                    <p className="text-sm font-bold text-text-primary leading-relaxed whitespace-pre-wrap">
                      {resultHeadline}
                    </p>
                  ) : (
                    <p className="text-sm font-medium text-text-secondary">
                      本轮已结束，可在左侧对应历史卡片中展开「查看执行过程」。
                    </p>
                  )}
                </div>
              ) : null
            )}
          </section>
        ) : null}
      </div>

      {/* 隐藏的图片上传 input：由 iframe 内点击 img 触发 */}
      <input
        ref={imgFileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          void onImageFilePicked(f);
        }}
      />
    </div>
  );
}

import { useCallback, useMemo, useRef, useState } from "react";
import { Download, ImageDown, Loader2, Lock } from "lucide-react";
import html2canvas from "html2canvas";
import DashboardWorkflowPipeline from "../../components/DashboardWorkflowPipeline";
import ReactSandboxPreview from "./ReactSandboxPreview";
import type { PlanStep, TeamCat, WorkflowRun } from "./workbenchTypes";
import {
  normalizeRunSteps,
  sortedRunSteps,
  stepDisplayTextForRunStep,
} from "./RunExecutionProcess";

export type { PlanStep } from "./workbenchTypes";

export default function ResultCanvas({
  workflowName,
  userPrompt,
  displayRun,
  isSubmitting,
  waitingForRunRecord,
  planSteps,
  catNameById,
  cats,
}: {
  workflowName: string;
  userPrompt: string;
  displayRun: WorkflowRun | null;
  isSubmitting: boolean;
  /** 已提交但尚未在列表里匹配到本轮 run */
  waitingForRunRecord: boolean;
  planSteps: PlanStep[];
  catNameById: Record<string, string>;
  cats: TeamCat[];
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [frameReady, setFrameReady] = useState(false);
  const [exportingPng, setExportingPng] = useState(false);

  const steps = useMemo(
    () => sortedRunSteps(normalizeRunSteps(displayRun?.steps)),
    [displayRun?.steps],
  );
  const inProgress = displayRun?.status === "running";
  const failed = displayRun?.status === "failed";
  const lastStep = steps.length ? steps[steps.length - 1] : null;
  const failedStep = useMemo(
    () => steps.find((s) => s.success === false || s.status === "error"),
    [steps],
  );

  const resultHeadline = failed
    ? stepDisplayTextForRunStep(failedStep) || "执行未全部成功"
    : stepDisplayTextForRunStep(lastStep) ||
      (steps.length ? "已完成全部步骤" : "");

  /** 检测最后一步是否为 HTML 页面类型（历史记录） */
  const htmlPageData = useMemo(() => {
    if (!lastStep || failed) return null;
    if (lastStep.resultType === "html-page" && lastStep.resultData) {
      return lastStep.resultData;
    }
    // 兼容：summary 以 <!DOCTYPE 或 <html 开头
    const s = (lastStep.summary || "").trim();
    if (s.startsWith("<!DOCTYPE") || s.startsWith("<html")) return s;
    return null;
  }, [lastStep, failed]);

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
    : htmlPageData
      ? "html"
      : null;

  const downloadBlob = useCallback((blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }, []);

  const onDownloadHtml = useCallback(() => {
    if (!htmlPageData) return;
    const blob = new Blob([htmlPageData], { type: "text/html;charset=utf-8" });
    downloadBlob(blob, "landing.html");
  }, [downloadBlob, htmlPageData]);

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
          downloadBlob(blob, "landing.png");
          resolve();
        }, "image/png");
      });
    } finally {
      setExportingPng(false);
    }
  }, [downloadBlob, frameReady]);

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

      <div className="relative z-10 flex-1 overflow-y-auto space-y-4">
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

        {!isSubmitting && !waitingForRunRecord && !displayRun ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-surface-secondary/35 py-14 px-6 text-center">
            <p className="text-sm font-semibold text-text-secondary">
              在左侧点选一条历史任务可查看详情与预览
            </p>
            <p className="text-xs text-text-tertiary font-medium max-w-sm">
              或在本页输入新的创作需求后点击「开始创作」；执行开始后输入框会清空，可随时填写下一条。
            </p>
          </div>
        ) : null}

        {/* 执行中：主区域只展示 WorkflowPanel 同款流水线动画 */}
        {!isSubmitting && displayRun && inProgress ? (
          <DashboardWorkflowPipeline
            workflowName={workflowName || displayRun.workflowName}
            planSteps={planSteps}
            catNameById={catNameById}
            cats={cats}
            running
            runSteps={steps}
          />
        ) : null}

        {/* 已结束：结果为主；步骤明细在左侧历史卡片「查看执行过程」 */}
        {!isSubmitting && displayRun && !inProgress ? (
          <section className="space-y-3">
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
                        : htmlPageData!
                      ).length.toLocaleString()}{" "}
                      字符
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {previewKind === "html" ? (
                      <button
                        type="button"
                        onClick={onDownloadHtml}
                        className="inline-flex items-center gap-1.5 rounded-md bg-white/80 hover:bg-white px-2.5 py-1 text-[11px] font-semibold text-neutral-700 ring-1 ring-black/[0.08] shadow-sm transition-colors"
                        title="下载 HTML"
                      >
                        <Download className="size-3.5" aria-hidden />
                        HTML
                      </button>
                    ) : null}

                    <button
                      type="button"
                      onClick={onExportPng}
                      disabled={!frameReady || exportingPng}
                      className="inline-flex items-center gap-1.5 rounded-md bg-white/80 hover:bg-white disabled:hover:bg-white/80 disabled:opacity-60 px-2.5 py-1 text-[11px] font-semibold text-neutral-700 ring-1 ring-black/[0.08] shadow-sm transition-colors"
                      title={!frameReady ? "预览加载完成后可导出图片" : "导出整页 PNG"}
                    >
                      {exportingPng ? (
                        <Loader2 className="size-3.5 animate-spin" aria-hidden />
                      ) : (
                        <ImageDown className="size-3.5" aria-hidden />
                      )}
                      PNG
                    </button>
                  </div>
                </div>
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
                    srcDoc={htmlPageData!}
                    sandbox="allow-scripts allow-same-origin"
                    ref={(el) => {
                      iframeRef.current = el;
                    }}
                    onLoad={() => setFrameReady(true)}
                    className="w-full border-0"
                    style={{ minHeight: "min(60vh, 520px)", height: "calc(100vh - 109px)" }}
                    title="生成的网页预览"
                  />
                )}
              </div>
            ) : (
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
                {steps.length === 0 ? (
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
            )}

          </section>
        ) : null}
      </div>
    </div>
  );
}

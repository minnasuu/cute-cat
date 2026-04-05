import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { PlanStep, WorkflowRunStep } from "../pages/DashboardPage/workbenchTypes";
import { assistants } from "../data/cats";
import CatSVG from "./CatSVG";
import { AppIcon } from "./icons";
import "../styles/WorkflowPanel.scss";

const STEP_DURATION = 3000;

const FALLBACK_WORKING_DIALOGS = ["执行中...", "努力处理中~", "快好了!"];

const getAgent = (agentId: string) => assistants.find((a) => a.id === agentId);

/** 使用猫咪数据里的 messages（招呼语/状态文案）作为执行气泡 */
function dialogsForAgent(agentId: string): string[] {
  const agent = getAgent(agentId);
  const lines =
    agent?.messages?.map((s) => s.trim()).filter(Boolean) ?? [];
  return lines.length > 0 ? lines : FALLBACK_WORKING_DIALOGS;
}

function sortedRunSteps(steps: WorkflowRunStep[]): WorkflowRunStep[] {
  return [...steps].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
}

function derivePipelineState(
  planLen: number,
  runSteps: WorkflowRunStep[],
  running: boolean,
) {
  const sorted = sortedRunSteps(runSteps);
  const completedOk: number[] = [];
  let currentIndex = -1;

  for (let i = 0; i < planLen; i++) {
    const s = sorted.find((x) => (x.index ?? 0) === i);
    if (!s) {
      if (running && currentIndex < 0) currentIndex = i;
      break;
    }
    const failed = s.success === false || s.status === "error";
    if (failed) {
      if (running && currentIndex < 0) currentIndex = i;
      break;
    }
    const ok = s.success !== false && s.status !== "error";
    if (ok) completedOk.push(i);
    else {
      if (running && currentIndex < 0) currentIndex = i;
      break;
    }
  }

  if (running && currentIndex < 0 && planLen > 0) {
    currentIndex = planLen - 1;
  }

  return { completedOk, currentIndex };
}

/* ─── 流式打字组件：把 summary 文本逐字打出并自动滚动 ─── */
function StreamingText({
  text,
  speed = 18,
  onDone,
}: {
  text: string;
  speed?: number;
  onDone?: () => void;
}) {
  const [displayed, setDisplayed] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const idxRef = useRef(0);

  useEffect(() => {
    setDisplayed("");
    idxRef.current = 0;

    if (!text) return;

    const t = window.setInterval(() => {
      idxRef.current += 1;
      const nextLen = idxRef.current;
      if (nextLen >= text.length) {
        setDisplayed(text);
        window.clearInterval(t);
        onDone?.();
      } else {
        setDisplayed(text.slice(0, nextLen));
      }
    }, speed);

    return () => window.clearInterval(t);
  }, [text, speed]);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [displayed]);

  return (
    <div ref={containerRef} className="streaming-text-container">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {displayed}
      </ReactMarkdown>
      {displayed.length < text.length && (
        <span className="streaming-cursor" />
      )}
    </div>
  );
}

export default function DashboardWorkflowPipeline({
  workflowName,
  planSteps,
  catNameById,
  running,
  runSteps,
  footerHint,
}: {
  workflowName: string;
  planSteps: PlanStep[];
  catNameById: Record<string, string>;
  running: boolean;
  runSteps: WorkflowRunStep[];
  /** 等待 run 记录时的副文案 */
  footerHint?: string;
}) {
  const [currentDialog, setCurrentDialog] = useState("");
  /** 跟踪哪些步骤的打字已完成，直接展示全文 */
  const [typedDone, setTypedDone] = useState<Set<number>>(new Set());

  const { completedOk, currentIndex } = useMemo(
    () => derivePipelineState(planSteps.length, runSteps, running),
    [planSteps.length, runSteps, running],
  );

  const stepByIndex = useMemo(() => {
    const m = new Map<number, WorkflowRunStep>();
    for (const s of runSteps) {
      m.set(s.index ?? 0, s);
    }
    return m;
  }, [runSteps]);

  const activeAgentId = planSteps[currentIndex]?.agentId ?? "";

  useEffect(() => {
    if (!running || currentIndex < 0) {
      setCurrentDialog("");
      return;
    }
    const dialogs = dialogsForAgent(activeAgentId);
    let i = 0;
    setCurrentDialog(dialogs[0] ?? "执行中...");
    const t = window.setInterval(() => {
      i = (i + 1) % dialogs.length;
      setCurrentDialog(dialogs[i] ?? "执行中...");
    }, 1500);
    return () => window.clearInterval(t);
  }, [running, currentIndex, activeAgentId]);

  if (planSteps.length === 0) {
    return (
      <div className="execution-stage dashboard-workflow-pipeline-embed overflow-hidden">
        <div className="stage-body flex flex-col items-center justify-center gap-4 min-h-[200px] py-10">
          加载中...
          <p className="text-sm font-bold text-text-secondary text-center px-4">
            {footerHint || "猫猫正在执行任务，请稍候…"}
          </p>
        </div>
      </div>
    );
  }

  const showWaitingFooter = runSteps.length === 0 && running;

  return (
    <div className="execution-stage dashboard-workflow-pipeline-embed">
      <div className="stage-header">
        <div className="stage-title">
          <span className="stage-name">
            {workflowName?.trim() || "工作流执行"}
          </span>
        </div>
      </div>

      <div className="stage-body">
        <div className="pipeline">
          {planSteps.map((step, i) => {
            const agent = step.agentId ? getAgent(step.agentId) : undefined;
            const row = stepByIndex.get(i);
            const failed = !!(
              row &&
              (row.success === false || row.status === "error")
            );
            const okDone = !!(row && !failed);
            const isCurrent = running && i === currentIndex && !failed;
            const isPending = !okDone && !isCurrent && !failed;

            const displayName =
              (step.agentId && catNameById[step.agentId]) ||
              agent?.name ||
              (step.agentId
                ? step.agentId.replace(/-/g, " ")
                : `步骤 ${i + 1}`);

            const statusClass = failed
              ? "done"
              : okDone
                ? "done"
                : isCurrent
                  ? "active"
                  : "waiting";

            const resultStatus = failed ? "error" : "success";
            const showResult = (okDone || failed) && row?.summary;
            const isAlreadyTyped = typedDone.has(i);

            return (
              <React.Fragment
                key={`${step.stepId ?? step.agentId ?? "s"}-${i}`}
              >
                <div className={`pipeline-node ${statusClass}`}>
                  {isCurrent && !failed && (
                    <div className="cat-bubble show">
                      <span className="bubble-text">{currentDialog}</span>
                    </div>
                  )}

                  <div
                    className={`cat-avatar ${isCurrent && !failed ? "working" : ""}`}
                  >
                    {agent ? (
                      <CatSVG
                        colors={agent.catColors}
                        className="pipeline-cat"
                      />
                    ) : (
                      <div
                        className="pipeline-cat flex items-center justify-center text-4xl opacity-80"
                        aria-hidden
                      >
                        🐱
                      </div>
                    )}
                  </div>

                  <div className="node-info">
                    <span
                      className="node-name"
                      style={{ color: agent?.accent ?? "#5D4037" }}
                    >
                      {displayName}
                    </span>
                    {agent?.role ? (
                      <span className="node-skill inline-flex items-center gap-1">
                        {agent.role}
                      </span>
                    ) : null}
                  </div>

                  {isCurrent && !failed && (
                    <div className="node-progress">
                      <div
                        className="node-progress-bar"
                        style={{ animationDuration: `${STEP_DURATION}ms` }}
                      />
                    </div>
                  )}

                  {showResult ? (
                    <div className={`node-result status-${resultStatus}`}>
                      <div className="node-result-header inline-flex items-center gap-1">
                        {resultStatus === "success" ? (
                          <AppIcon symbol="CheckCircle" size={14} />
                        ) : (
                          <AppIcon symbol="XCircle" size={14} />
                        )}
                        <span className="node-result-status">
                          {resultStatus === "success" ? "完成" : "失败"}
                        </span>
                      </div>
                      <div className="node-result-summary markdown-body">
                        {isAlreadyTyped ? (
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {row.summary ?? ""}
                          </ReactMarkdown>
                        ) : (
                          <StreamingText
                            text={row.summary ?? ""}
                            speed={16}
                            onDone={() =>
                              setTypedDone((prev) => new Set(prev).add(i))
                            }
                          />
                        )}
                      </div>
                    </div>
                  ) : null}

                  {!okDone && !failed && agent ? (
                    <div className="node-io">
                      <span className="io-tag io-in">text</span>
                      <span className="io-arrow">→</span>
                      <span className="io-tag io-out">text</span>
                    </div>
                  ) : null}

                  {isPending ? <div className="node-dim" /> : null}
                </div>

                {i < planSteps.length - 1 ? (
                  <div
                    className={`pipeline-arrow ${completedOk.includes(i) ? "done" : ""}`}
                  >
                    <div className="arrow-line" />
                    <div className="arrow-head">
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                    {completedOk.includes(i) ? (
                      <div className="arrow-data-tag">
                        <span className="data-type">text</span>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      <div className="stage-footer">
        {running ? (
          <div className="exec-status">
            <div className="exec-dots">
              <span />
              <span />
              <span />
            </div>
            <span className="exec-label">
              {showWaitingFooter
                ? footerHint || "正在创建运行记录…"
                : `步骤 ${Math.min(currentIndex + 1, planSteps.length)} / ${planSteps.length} 执行中…`}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

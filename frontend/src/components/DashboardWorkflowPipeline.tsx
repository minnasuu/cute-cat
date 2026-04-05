import React, { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Skill } from "../data/types";
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

const getAgentSkill = (agentId: string, skillId: string): Skill | undefined => {
  const agent = getAgent(agentId);
  if (!agent?.skills) return undefined;
  return (agent.skills as Skill[]).find((s) => s.id === skillId);
};

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
      <div className="execution-stage dashboard-workflow-pipeline-embed rounded-2xl border border-primary-200/80 overflow-hidden shadow-sm">
        <div className="stage-body flex flex-col items-center justify-center gap-4 min-h-[200px] py-10">
          <div className="flex gap-3 text-3xl" aria-hidden>
            <span className="animate-bounce" style={{ animationDelay: "0ms" }}>
              🐱
            </span>
            <span className="animate-bounce" style={{ animationDelay: "150ms" }}>
              🐱
            </span>
            <span className="animate-bounce" style={{ animationDelay: "300ms" }}>
              🐱
            </span>
          </div>
          <p className="text-sm font-bold text-text-secondary text-center px-4">
            {footerHint || "猫猫正在执行任务，请稍候…"}
          </p>
        </div>
      </div>
    );
  }

  const showWaitingFooter = runSteps.length === 0 && running;

  return (
    <div className="execution-stage dashboard-workflow-pipeline-embed rounded-2xl border border-primary-200/80 overflow-hidden shadow-sm">
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
            const skill = step.agentId && step.skillId
              ? getAgentSkill(step.agentId, step.skillId)
              : undefined;
            const row = stepByIndex.get(i);
            const failed = !!(row && (row.success === false || row.status === "error"));
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
                      <CatSVG colors={agent.catColors} className="pipeline-cat" />
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
                    {skill ? (
                      <span className="node-skill inline-flex items-center gap-1">
                        <AppIcon symbol={skill.icon} size={12} />
                        {skill.name}
                      </span>
                    ) : step.skillId ? (
                      <span className="node-skill inline-flex items-center gap-1">
                        <AppIcon symbol="Settings" size={12} />
                        {step.skillId}
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
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {row.summary ?? ""}
                        </ReactMarkdown>
                      </div>
                    </div>
                  ) : null}

                  {!okDone && !failed && skill ? (
                    <div className="node-io">
                      <span className="io-tag io-in">{skill.input}</span>
                      <span className="io-arrow">→</span>
                      <span className="io-tag io-out">{skill.output}</span>
                    </div>
                  ) : null}

                  {!okDone && !failed && skill?.provider ? (
                    <span className="node-provider">via {skill.provider}</span>
                  ) : null}

                  {isPending ? <div className="node-dim" /> : null}
                </div>

                {i < planSteps.length - 1 ? (
                  <div
                    className={`pipeline-arrow ${completedOk.includes(i) ? "done" : ""}`}
                  >
                    <div className="arrow-line" />
                    <div className="arrow-head">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                    {completedOk.includes(i) ? (
                      <div className="arrow-data-tag">
                        <span className="data-type">
                          {getAgentSkill(
                            planSteps[i].agentId ?? "",
                            planSteps[i].skillId ?? "",
                          )?.output ?? ""}
                        </span>
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

// @ts-nocheck
/**
 * ComposerPipeline —— 灵感扩散右栏「生成流程」(纯展示)。
 *
 * 把原来的 chat 流输出 + PlanSideBar 窄缩略,改成纵向分步面板:
 *   企划方案 → 设计线稿 → 材质推荐 → 终稿成图
 * 每一步一个固定卡片(结构稳定不跳动);未到达的步骤显示占位,正在生成的步骤显示 spinner + 计时。
 *
 * 本组件只负责展示结构与内容,所有操作按钮(确认方案 / 确认线稿 / 确认材质 / 保存)
 * 统一收纳到左栏底部 GenerateButton(按 stage 切换动作)。
 * 数据来自现有状态(images/recommendation/stage),状态机本身不动。
 */
import { Markdown } from "../lib/markdown";
import { ImageCard, LiveElapsed, type GeneratedImage } from "./image-card";
import { RecForm } from "./rec-form";
import type { MaterialRecommendation } from "../types/design";

type Stage =
  | "greeting" | "references" | "proposal" | "brainstorming" | "planning"
  | "generating" | "presenting" | "presenting-html"
  | "generating-lineart" | "presenting-lineart"
  | "material-recommend" | "generating-final";

interface Props {
  stage: Stage;
  planText: string;
  images: GeneratedImage[];
  recommendation: MaterialRecommendation | null;
  generating: boolean;
  expressMode: boolean;
  // 动作(仅保留展示所需:修图 + 材质表单编辑/刷新;流程推进按钮已统一到左栏底部)
  onRegenerateOne: (slot: string, label: string, instruction: string) => void;
  onRecommendationChange: (r: MaterialRecommendation) => void;
  onRefreshRecommendation: () => void;
}

const STEPS = [
  { key: "proposal", label: "企划方案" },
  { key: "lineart", label: "设计线稿" },
  { key: "material", label: "材质推荐" },
  { key: "final", label: "终稿成图" },
] as const;

/** 根据当前 stage 判定激活到哪一步(0-based),未开始返回 -1 */
function activeStep(stage: Stage): number {
  switch (stage) {
    case "greeting": case "references": case "brainstorming": case "planning": return -1;
    case "proposal": return 0;
    case "generating-lineart": case "presenting-lineart": return 1;
    case "material-recommend": case "generating-final": return 2;
    case "presenting": case "presenting-html": case "generating": return 3;
    default: return -1;
  }
}

export default function ComposerPipeline(props: Props) {
  const { stage, planText, images, recommendation, generating, expressMode } = props;
  const step = activeStep(stage);

  const lineart = images.filter((im) => im.slot === "lineart" && im.url && !im.error);
  const finals = images.filter((im) => im.slot === "final" && im.url && !im.error);
  const hasLineart = lineart.length > 0;
  const hasFinal = finals.length > 0;

  return (
    <aside className="border-l border-gray-200 bg-gray-50 overflow-y-auto min-h-0 px-5 pb-5 space-y-5">
      {/* 步骤指示 */}
      <ol data-tour="tour-pipeline" className="flex items-center gap-1 text-[10px] sticky top-0 z-10 bg-white py-5 mb-0">
        {STEPS.map((s, i) => {
          const done = step > i;
          const active = step === i;
          return (
            <li key={s.key} className="flex items-center gap-1 flex-1 min-w-0">
              <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[9px] font-medium ${done ? "bg-primary-500 text-white" : active ? "bg-primary-100 text-primary-700 ring-2 ring-primary-500" : "bg-gray-200 text-gray-500"}`}>
                {done ? "✓" : i + 1}
              </span>
              <span className={`truncate ${active ? "text-primary-700 font-medium" : done ? "text-gray-700" : "text-gray-400"}`}>{s.label}</span>
              {i < STEPS.length - 1 && <span className="text-gray-300 shrink-0">→</span>}
            </li>
          );
        })}
      </ol>

      {/* 空态:简报未提交 */}
      {step === -1 && !generating && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white text-center text-[12px] text-gray-400 px-6 py-12">
          填写左侧简报并点击<br />底部「生成设计方案」
        </div>
      )}

      {/* Step 1: 企划方案 */}
      {(step >= 0 || generating) && (
        <StepCard data-tour="tour-step-proposal" title="企划方案" done={step > 0} active={step === 0}>
          {step === 0 && !planText && !generating && (
            <div className="text-[12px] text-gray-500">等待方案生成…</div>
          )}
          {planText ? (
            <div className="text-[12.5px] text-gray-700 leading-relaxed space-y-2"><Markdown source={planText.slice(0, 1200)} /></div>
          ) : generating && step === 0 ? (
            <StepSpinner label="正在生成企划方案" />
          ) : null}
        </StepCard>
      )}

      {/* Step 2: 设计线稿 */}
      {step >= 1 && (
        <StepCard data-tour="tour-step-lineart" title="设计线稿" done={step > 1} active={step === 1}>
          {hasLineart ? (
            <div className={lineart.length === 1 ? "max-w-xs mx-auto" : "grid grid-cols-2 gap-2"}>
              {lineart.map((im) => <ImageCard key={im.slot + im.label} image={im} onRegenerate={(inst) => props.onRegenerateOne(im.slot, im.label, inst)} />)}
            </div>
          ) : step === 1 && generating ? (
            <StepSpinner label="正在生成线稿" />
          ) : (
            <div className="text-[12px] text-gray-500">线稿生成后在此预览</div>
          )}
        </StepCard>
      )}

      {/* Step 3: 材质推荐 */}
      {step >= 2 && (
        <StepCard data-tour="tour-step-material" title="材质推荐" done={step > 2} active={step === 2}>
          <RecForm
            recommendation={recommendation}
            onChange={props.onRecommendationChange}
            onRefresh={props.onRefreshRecommendation}
            loading={!recommendation}
            disabled={generating}
          />
        </StepCard>
      )}

      {/* Step 4: 终稿成图 */}
      {step >= 3 && (
        <StepCard data-tour="tour-step-final" title="终稿成图" done={false} active={step === 3}>
          {hasFinal ? (
            <div className={finals.length === 1 ? "max-w-xs mx-auto" : "grid grid-cols-2 gap-2"}>
              {finals.map((im) => <ImageCard key={im.slot + im.label} image={im} onRegenerate={(inst) => props.onRegenerateOne(im.slot, im.label, inst)} />)}
            </div>
          ) : step === 3 && generating ? (
            <StepSpinner label="正在生成最终设计图" />
          ) : expressMode && !hasFinal && !generating ? (
            <div className="text-[12px] text-gray-500">极速模式成图生成中…</div>
          ) : (
            <div className="text-[12px] text-gray-500">确认材质后在此预览终稿</div>
          )}
        </StepCard>
      )}
    </aside>
  );
}

/** 步骤卡片容器 */
function StepCard({ title, done, active, children, "data-tour": dataTour }: { title: string; done: boolean; active: boolean; children: React.ReactNode; "data-tour"?: string }) {
  return (
    <div data-tour={dataTour} className={`rounded-2xl border bg-white overflow-hidden ${active ? "border-primary-300 shadow-sm" : done ? "border-gray-200" : "border-gray-200"}`}>
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 bg-gray-50/60">
        <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] ${done ? "bg-primary-500 text-white" : active ? "bg-primary-100 text-primary-700" : "bg-gray-200 text-gray-400"}`}>
          {done ? "✓" : ""}
        </span>
        <span className={`text-[11px] font-medium ${active ? "text-primary-700" : "text-gray-600"}`}>{title}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

/** 生成进行中占位 + 计时 */
function StepSpinner({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 text-[12px] text-gray-500 py-4 justify-center">
      <div className="w-6 h-6 border-2 border-primary-200 border-t-primary-500 rounded-full animate-spin" />
      <span>{label}…</span>
    </div>
  );
}

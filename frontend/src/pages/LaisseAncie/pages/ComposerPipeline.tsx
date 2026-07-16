// @ts-nocheck
/**
 * ComposerPipeline —— 灵感扩散右栏「生成流程」。
 *
 * 把原来的 chat 流输出 + PlanSideBar 窄缩略,改成纵向分步面板:
 *   企划方案 → 设计线稿 → 材质推荐 → 终稿成图
 * 每一步一个固定卡片(结构稳定不跳动);未到达的步骤显示占位,正在生成的步骤显示 spinner + 计时。
 *
 * 修改功能绑定到右侧对应步骤,步骤生成成功后即可修改;步骤确认后隐藏该步骤修改 UI。
 * 修图走预览模式:先生成预览图,用户确认后再替换。
 */
import { useState } from "react";
import { Markdown } from "../lib/markdown";
import { ImageCell, LiveElapsed, type GeneratedImage } from "./image-card";
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
  // 修图:走预览模式(返回新图 URL 待用户确认后替换)
  onRegeneratePreview: (slot: string, label: string, instruction: string, onResult: (url: string) => void) => void;
  // 确认替换预览图
  onConfirmReplace: (slot: string, url: string) => void;
  // 材质表单
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
  const currentStep = activeStep(stage);
  const [, setTick] = useState(0);

  const lineart = images.filter((im) => im.slot === "lineart" && im.url && !im.error);
  const finals = images.filter((im) => im.slot === "final" && im.url && !im.error);
  const hasLineart = lineart.length > 0;
  const hasFinal = finals.length > 0;

  /** 修图:走预览模式,返回新图 URL */
  const handleRegeneratePreview = (slot: string, label: string) => (instruction: string, onResult: (url: string) => void) => {
    props.onRegeneratePreview(slot, label, instruction, onResult);
  };

  /** 预览模式下用户确认替换 */
  const handleConfirmReplace = (slot: string) => (url: string) => {
    props.onConfirmReplace(slot, url);
  };

  return (
    <aside className="border-l border-gray-200 bg-gray-50 min-h-0 pb-5 space-y-5 overflow-y-auto">
      {/* 步骤指示 */}
      <ol data-tour="tour-pipeline" className="w-full flex items-center gap-1 text-[10px] sticky top-0 z-10 bg-gray-50 p-5 mb-0 -ml-5 border-box">
        {STEPS.map((s, i) => {
          const done = currentStep > i;
          const active = currentStep === i;
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

      <div className="space-y-5 px-5">
        {/* 空态:简报未提交 */}
        {currentStep === -1 && !generating && (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white text-center text-[12px] text-gray-400 px-6 py-12">
            填写左侧简报并点击<br />底部「生成设计方案」
          </div>
        )}

        {/* Step 1: 企划方案 */}
        {(currentStep >= 0 || generating) && (
          <StepCard data-tour="tour-step-proposal" title="企划方案" done={currentStep > 0} active={currentStep === 0}>
            {currentStep === 0 && !planText && !generating ? (
              <div className="text-[12px] text-gray-500">等待方案生成…</div>
            ) : planText ? (
              <div className="text-[12.5px] text-gray-700 leading-relaxed space-y-2">
                <Markdown source={planText.slice(0, 1200)} />
                {/* 步骤未确认时显示修改提示 */}
                {currentStep === 0 && (
                  <p className="text-[10px] text-gray-400 italic pt-2 border-t border-gray-100">
                    💡 底部可修改方案，确认后将进入下一步。
                  </p>
                )}
              </div>
            ) : generating && currentStep === 0 ? (
              <StepSpinner label="正在生成企划方案" />
            ) : null}
          </StepCard>
        )}

        {/* Step 2: 设计线稿(绑修改功能,确认后隐藏) */}
        {currentStep >= 1 && (
          <StepCard data-tour="tour-step-lineart" title="设计线稿" done={currentStep > 1} active={currentStep === 1}>
            {hasLineart ? (
              <div className={lineart.length === 1 ? "max-w-xs mx-auto" : "grid grid-cols-2 gap-2"}>
                {lineart.map((im) => (
                  <ImageCell
                    key={im.slot + im.label}
                    image={im}
                    onRegenerate={handleRegeneratePreview(im.slot, im.label)}
                    confirmed={currentStep > 1}
                    onConfirmReplace={handleConfirmReplace(im.slot)}
                  />
                ))}
              </div>
            ) : currentStep === 1 && generating ? (
              <StepSpinner label="正在生成线稿" />
            ) : (
              <div className="text-[12px] text-gray-500">线稿生成后在此预览</div>
            )}
          </StepCard>
        )}

        {/* Step 3: 材质推荐(绑修改功能,确认后隐藏) */}
        {currentStep >= 2 && (
          <StepCard data-tour="tour-step-material" title="材质推荐" done={currentStep > 2} active={currentStep === 2}>
            <RecForm
              recommendation={recommendation}
              onChange={props.onRecommendationChange}
              onRefresh={props.onRefreshRecommendation}
              loading={!recommendation}
              disabled={generating}
              readOnly={currentStep > 2}
            />
          </StepCard>
        )}

        {/* Step 4: 终稿成图(绑修改功能,确认后隐藏) */}
        {currentStep >= 3 && (
          <StepCard data-tour="tour-step-final" title="终稿成图" done={false} active={currentStep === 3}>
            {hasFinal ? (
              <div className={finals.length === 1 ? "max-w-xs mx-auto" : "grid grid-cols-2 gap-2"}>
                {finals.map((im) => (
                  <ImageCell
                    key={im.slot + im.label}
                    image={im}
                    onRegenerate={handleRegeneratePreview(im.slot, im.label)}
                    confirmed={false}
                    onConfirmReplace={handleConfirmReplace(im.slot)}
                  />
                ))}
              </div>
            ) : currentStep === 3 && generating ? (
              <StepSpinner label="正在生成最终设计图" />
            ) : expressMode && !hasFinal && !generating ? (
              <div className="text-[12px] text-gray-500">极速模式成图生成中…</div>
            ) : (
              <div className="text-[12px] text-gray-500">确认材质后在此预览终稿</div>
            )}
          </StepCard>
        )}
      </div>
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

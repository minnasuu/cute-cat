import clsx from "clsx";
import { type Dispatch, type SetStateAction } from "react";
import { ui } from "./ui";

/** 详情弹窗内：编辑卡片文案与通用视觉方向（designPrompt） */
export function DetailEditForm({
  draft,
  setDraft,
  disabled,
}: {
  draft: { summary: string; styleDescription: string; designPrompt: string };
  setDraft: Dispatch<
    SetStateAction<{
      summary: string;
      styleDescription: string;
      designPrompt: string;
    } | null>
  >;
  disabled?: boolean;
}) {
  return (
    <div className="scrollbar-hide flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
      <section className={clsx(ui.card, ui.cardPad)}>
        <h3 className={clsx(ui.sectionTitle, "mb-2")}>卡片摘要</h3>
        <p className={clsx(ui.body, "mb-2")}>
          显示在灵感库缩略卡片上的短文案（libraryBlurb / summary）。
        </p>
        <textarea
          value={draft.summary}
          disabled={disabled}
          onChange={(e) =>
            setDraft((prev) =>
              prev ? { ...prev, summary: e.target.value } : prev,
            )
          }
          rows={3}
          className="w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:opacity-50"
        />
      </section>
      <section className={clsx(ui.card, ui.cardPad)}>
        <h3 className={clsx(ui.sectionTitle, "mb-2")}>设计风格简述</h3>
        <p className={clsx(ui.body, "mb-2")}>
          designSummary.styleDescription，建议保持品类中立的气质描述。
        </p>
        <textarea
          value={draft.styleDescription}
          disabled={disabled}
          onChange={(e) =>
            setDraft((prev) =>
              prev ? { ...prev, styleDescription: e.target.value } : prev,
            )
          }
          rows={4}
          className="w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:opacity-50"
        />
      </section>
      <section className={clsx(ui.card, ui.cardPad)}>
        <h3 className={clsx(ui.sectionTitle, "mb-2")}>设计提示词（通用视觉方向）</h3>
        <p className={clsx(ui.body, "mb-2")}>
          供下游模型套用的外观与版式约束；宜写可迁移的视觉语言，避免绑死某一行业。
        </p>
        <textarea
          value={draft.designPrompt}
          disabled={disabled}
          onChange={(e) =>
            setDraft((prev) =>
              prev ? { ...prev, designPrompt: e.target.value } : prev,
            )
          }
          rows={14}
          className="w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 font-mono text-xs leading-relaxed text-text-primary placeholder:text-text-tertiary focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:opacity-50"
        />
      </section>
    </div>
  );
}

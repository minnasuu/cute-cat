import clsx from "clsx";
import type { VibeStyleLibExtractResult } from "./vibeStyleLibApi";
import { RESULT_TAB_DEF, VISUAL_ATTR_KEYS } from "./index";
import type { ResultTab } from "./index";
import { ui, IconCopy, copyText } from "./ui";

export function ResultPanel({
  data,
  tab,
  setTab,
}: {
  data: VibeStyleLibExtractResult;
  tab: ResultTab;
  setTab: (t: ResultTab) => void;
}) {
  const summaryJson = JSON.stringify(data.designSummary, null, 2);
  const va = data.designSummary.visualAttributes;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-4 flex shrink-0 overflow-hidden rounded-lg border border-primary-200/80 bg-primary-50/30">
        {RESULT_TAB_DEF.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={clsx(
              "flex-1 py-2.5 text-sm font-medium transition-colors",
              tab === key
                ? "bg-primary-600 text-white"
                : "text-primary-800/80 hover:bg-primary-100/80",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "summary" ? (
        <div className="scrollbar-hide flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
          <section className={clsx(ui.card, ui.cardPad)}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <h3 className={ui.sectionTitle}>设计风格</h3>
              <button
                type="button"
                className={clsx(ui.btnPrimary)}
                onClick={() => void copyText(summaryJson)}
              >
                复制 JSON
              </button>
            </div>
            <p className={clsx(ui.body, "mb-3")}>
              {data.designSummary.styleDescription}
            </p>
            <div className="flex flex-wrap gap-2">
              {data.designSummary.styleTags.map((t) => (
                <span key={t} className={ui.tag}>
                  {t}
                </span>
              ))}
            </div>
          </section>

          <section className={clsx(ui.card, ui.cardPad)}>
            <h3 className={clsx(ui.sectionTitle, "mb-4")}>核心色板</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {data.designSummary.colors.map((c) => (
                <div
                  key={c.hex + c.name}
                  className="flex gap-3 border border-border p-3 rounded-lg"
                >
                  <div
                    className="h-14 w-14 shrink-0 border border-border-strong rounded-md"
                    style={{ backgroundColor: c.hex }}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text-primary">
                      {c.name}
                    </p>
                    <p className={ui.mono}>{c.hex}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-text-tertiary">
                      {c.usage}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className={clsx(ui.card, ui.cardPad)}>
            <h3 className={clsx(ui.sectionTitle, "mb-3")}>字体排版</h3>
            <ul className="space-y-2">
              {data.designSummary.typography.map((f) => (
                <li
                  key={f.family}
                  className="flex items-center justify-between gap-2 border border-border px-3 py-2 text-sm text-text-secondary rounded-lg"
                >
                  <span className="font-medium">{f.family}</span>
                  <button
                    type="button"
                    aria-label={`复制 ${f.family}`}
                    onClick={() => void copyText(f.family)}
                    className="p-1 text-text-tertiary hover:text-text-primary"
                  >
                    <IconCopy />
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className={clsx(ui.card, ui.cardPad)}>
            <h3 className={clsx(ui.sectionTitle, "mb-4")}>视觉属性</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {VISUAL_ATTR_KEYS.map(([label, k]) => (
                <div key={k} className="border border-border p-4 rounded-lg">
                  <p className="mb-2 text-xs font-semibold text-text-tertiary">
                    {label}
                  </p>
                  <p className="whitespace-pre-wrap text-sm text-text-secondary leading-relaxed">
                    {va[k]}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-primary-800/50 bg-primary-900">
          <div className="flex shrink-0 items-center justify-between border-b border-primary-700/60 bg-primary-800 px-4 py-3">
            <span className="text-sm font-medium text-primary-50">
              设计提示词
            </span>
            <button
              type="button"
              onClick={() => void copyText(data.designPrompt)}
              className="text-xs font-medium px-3 py-1.5 rounded-lg bg-primary-50 text-primary-900 hover:bg-white disabled:opacity-45 disabled:pointer-events-none"
            >
              <span className="inline-flex items-center gap-1.5">
                <IconCopy className="h-3.5 w-3.5" />
                复制提示词
              </span>
            </button>
          </div>
          <pre className="scrollbar-hide flex-1 overflow-auto p-4 font-sans text-sm leading-relaxed text-primary-50/95 whitespace-pre-wrap">
            {data.designPrompt}
          </pre>
        </div>
      )}
    </div>
  );
}

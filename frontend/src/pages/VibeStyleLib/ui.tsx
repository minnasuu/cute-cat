import clsx from "clsx";
import type { ReactNode } from "react";

/** CuCaTopia 品牌主色为 primary（绿），与 Dashboard / 团队页一致 */
export const ui = {
  page: "h-screen flex flex-col bg-surface text-text-primary selection:bg-primary-100 selection:text-primary-900",
  header: "shrink-0 border-b border-border bg-surface",
  navBtn:
    "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium border border-transparent transition-colors",
  navActive: "text-primary-600 bg-primary-100 border-primary-600",
  navIdle:
    "text-text-secondary hover:bg-primary-50/80 hover:text-primary-800 border-border",
  card: "border border-border bg-surface",
  cardPad: "p-5",
  sectionTitle:
    "text-xs font-semibold uppercase tracking-wider text-primary-700",
  body: "text-sm text-text-secondary leading-relaxed",
  mono: "text-xs font-mono text-primary-900",
  tag: "text-xs px-2 py-0.5 rounded-md border border-primary-200 bg-primary-50/90 text-primary-800",
  btnGhost:
    "text-sm text-text-secondary hover:text-primary-700 hover:bg-primary-50 px-2 py-1 rounded-md",
  btnPrimary:
    "text-xs font-medium px-3 py-1.5 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-45 disabled:pointer-events-none",
  fab: "flex items-center justify-center rounded-full border-2 border-primary-500 bg-primary-50 text-primary-700 hover:bg-primary-600 hover:text-white hover:border-primary-600 transition-colors",
  modalBackdrop:
    "fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50",
  modalPanel:
    "bg-surface border border-border max-w-[70vw] w-full p-6 relative",
  inputZone:
    "border border-dashed border-border-strong bg-surface-secondary flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-primary-400 hover:bg-primary-50/60 transition-colors",
} as const;

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
}

export function IconCopy({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
      />
    </svg>
  );
}

export function IconUpload({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      width="32"
      height="32"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
      />
    </svg>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-primary-100 border-t-primary-600"
        aria-hidden
      />
      <span className="text-xs text-text-tertiary">{label}</span>
    </div>
  );
}

export function ModalChrome({
  children,
  onClose,
  wide,
  ariaLabelledBy,
}: {
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  ariaLabelledBy?: string;
}) {
  return (
    <div className={ui.modalBackdrop} role="presentation" onClick={onClose}>
      <div
        className={clsx(
          ui.modalPanel,
          wide && "max-h-[90vh] max-w-[70vw] flex flex-col overflow-hidden p-0",
        )}
        role="dialog"
        aria-modal
        aria-labelledby={ariaLabelledBy}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

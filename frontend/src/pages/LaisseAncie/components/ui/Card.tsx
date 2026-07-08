// @ts-nocheck
import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  interactive?: boolean;
}

export function Card({ children, className = "", onClick, interactive = !!onClick }: Props) {
  return (
    <div
      onClick={onClick}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick?.(); } } : undefined}
      className={`rounded-2xl border border-gray-200 bg-white p-5 transition-all duration-150 ${interactive ? "cursor-pointer hover:border-primary-500/50 hover:shadow-md" : "shadow-sm"} ${className}`}
    >
      {children}
    </div>
  );
}

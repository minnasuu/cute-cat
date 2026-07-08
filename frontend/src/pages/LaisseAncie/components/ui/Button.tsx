// @ts-nocheck
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "ghost" | "outline" | "subtle";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-primary-500 hover:bg-primary-600 text-white shadow-sm",
  subtle: "bg-gray-100 hover:bg-gray-200 text-gray-800",
  ghost: "bg-transparent hover:bg-gray-100 text-gray-700",
  outline: "bg-transparent border border-gray-200 hover:border-gray-800 text-gray-800",
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
}

export function Button({ variant = "primary", className = "", children, ...rest }: Props) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 h-11 font-medium transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed text-sm px-4 py-2 rounded-lg ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

import React, { useState, useEffect, useRef } from 'react';

export type TeamOption = { id: string; label: string };

/**
 * 通用团队切换下拉组件。
 *
 * 从原 DashboardPage 抽出,作为「页面左上团队切换入口」被 /dashboard 与其它团队页面复用。
 * 支持两种变体:default(页面标题级) / compact(工具栏级)。
 */
export function TeamSelect({
  value,
  options,
  onChange,
  ariaLabel,
  variant = 'default',
}: {
  value: string;
  options: readonly TeamOption[];
  onChange: (next: string) => void;
  ariaLabel: string;
  variant?: 'default' | 'compact';
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const activeLabel = options.find((o) => o.id === value)?.label ?? value;

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const buttonClass =
    variant === 'compact'
      ? 'cursor-pointer rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-bold text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/35'
      : 'inline-flex max-w-full cursor-pointer rounded-2xl border border-border bg-surface px-4 py-2 text-sm md:text-base font-black tracking-tight text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/35';

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-2 ${buttonClass}`}
      >
        <span className="truncate">{activeLabel}</span>
        <svg
          className={`w-3.5 h-3.5 text-text-tertiary transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open ? (
        <div
          role="menu"
          aria-label={ariaLabel}
          className={`absolute z-50 mt-2 overflow-hidden rounded-[18px] border border-border bg-surface shadow-xl left-0 top-full ${
            variant === 'compact' ? 'w-44' : 'w-56'
          }`}
        >
          <div className="p-1">
            {options.map((o) => {
              const active = o.id === value;
              return (
                <button
                  key={o.id}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onChange(o.id);
                    setOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-xl text-sm font-semibold transition-colors cursor-pointer ${
                    active
                      ? 'bg-primary-50 text-primary-700'
                      : 'text-text-secondary hover:bg-surface-secondary hover:text-text-primary'
                  }`}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

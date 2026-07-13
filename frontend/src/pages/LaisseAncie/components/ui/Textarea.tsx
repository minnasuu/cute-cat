import { forwardRef, type TextareaHTMLAttributes } from "react";

interface Props extends TextareaHTMLAttributes<HTMLTextAreaElement> { }

export const Textarea = forwardRef<HTMLTextAreaElement, Props>(({ className = "", onKeyDown, ...rest }, ref) => {
  function autoGrow(e: React.SyntheticEvent<HTMLTextAreaElement>) {
    const el = e.currentTarget;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }
  return (
    <textarea
      ref={ref}
      spellCheck={false}
      rows={1}
      onInput={autoGrow}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          const form = e.currentTarget.closest("form");
          if (form && !e.nativeEvent.isComposing) { e.preventDefault(); form.requestSubmit(); }
        }
        onKeyDown?.(e);
      }}
      className={`w-full resize-none bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-primary-500/60 focus:ring-2 focus:ring-primary-500/20 transition-colors disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed ${className}`}
      {...rest}
    />
  );
});

Textarea.displayName = "Textarea";

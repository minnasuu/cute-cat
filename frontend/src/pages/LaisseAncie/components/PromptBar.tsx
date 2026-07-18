import { useState, useEffect } from "react";
import { Textarea, Button } from "./ui";
import { useComposerPrompt } from "../contexts/composer-prompt";

interface Props {
  placeholder?: string;
  submitLabel?: string;
  context?: string;
  disabled?: boolean;
  onSubmit: (prompt: string) => Promise<void> | void;
}

export function PromptBar({
  placeholder = "Ask LongCat anything…",
  submitLabel = "Generate",
  disabled = false,
  onSubmit,
}: Props) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const { draftPrompt, clearDraftPrompt } = useComposerPrompt();

  // 「制作相似」草稿:填入一次后立刻清空,避免切回 tab 时重复注入
  useEffect(() => {
    if (draftPrompt && draftPrompt.trim()) {
      setValue(draftPrompt);
      clearDraftPrompt();
    }
  }, [draftPrompt, clearDraftPrompt]);

  async function go() {
    const v = value.trim();
    if (!v || busy || disabled) return;
    setBusy(true);
    try {
      await onSubmit(v);
      setValue("");
    } catch (err) {
      console.error(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-t border-gray-200 bg-white/90 backdrop-blur p-4 sticky bottom-0 z-30">
      <form
        className="flex gap-2 items-end max-w-4xl mx-auto"
        onSubmit={(e) => { e.preventDefault(); void go(); }}
      >
        <Textarea
          value={value}
          onChange={(e) => setValue(e.currentTarget.value)}
          placeholder={placeholder}
          disabled={disabled}
        />
        <Button type="submit" disabled={busy || !value.trim() || disabled} className="shrink-0">
          {busy ? "…" : submitLabel}
        </Button>
      </form>
      <div className="text-[11px] text-gray-500 mt-2 max-w-4xl mx-auto">
        ⏎ send · ⇧⏎ newline · powered by 豆包Seed · 生图 豆包Seedream
      </div>
    </div>
  );
}

// @ts-nocheck
/**
 * ComposerPromptContext —— 跨 tab 传递「制作相似」的初始文案草稿。
 *
 * 灵感页点击「制作相似」→ setDraftPrompt(整理后文案) + navigateTab('single')
 * → Composer/PromptBar mount 时读取 draftPrompt 填入输入框
 * → 消费后置空(clearDraftPrompt),避免重复注入。
 */
import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface ComposerPromptValue {
  draftPrompt: string | null;
  setDraftPrompt: (p: string | null) => void;
  clearDraftPrompt: () => void;
}

const Ctx = createContext<ComposerPromptValue | null>(null);

export function ComposerPromptProvider({ children }: { children: ReactNode }) {
  const [draftPrompt, setDraftPromptState] = useState<string | null>(null);
  const setDraftPrompt = useCallback((p: string | null) => {
    setDraftPromptState(p);
  }, []);
  const clearDraftPrompt = useCallback(() => {
    setDraftPromptState(null);
  }, []);
  return (
    <Ctx.Provider value={{ draftPrompt, setDraftPrompt, clearDraftPrompt }}>
      {children}
    </Ctx.Provider>
  );
}

export function useComposerPrompt(): ComposerPromptValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useComposerPrompt must be used within ComposerPromptProvider");
  return v;
}

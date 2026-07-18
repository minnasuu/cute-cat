/**
 * ComposerPromptContext —— 跨 tab 传递「制作相似」的初始文案草稿 + 新会话信号。
 *
 * 灵感页点击「制作相似」→ requestReset()(清空工作台) + setDraftPrompt(整理后文案) + navigateTab('single')
 * → Composer 监听到 resetNonce 变化 → forceResetSession()
 * → PromptBar 读取 draftPrompt 填入输入框 → 消费后置空(clearDraftPrompt)。
 */
import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface ComposerPromptValue {
  draftPrompt: string | null;
  setDraftPrompt: (p: string | null) => void;
  clearDraftPrompt: () => void;
  /** 请求清空工作台(+新会话效果),nonce 每次 +1 */
  requestReset: () => void;
  /** 当前 reset nonce(Composer 订阅它的变化触发 forceResetSession) */
  resetNonce: number;
}

const Ctx = createContext<ComposerPromptValue | null>(null);

export function ComposerPromptProvider({ children }: { children: ReactNode }) {
  const [draftPrompt, setDraftPromptState] = useState<string | null>(null);
  const [resetNonce, setResetNonce] = useState(0);
  const setDraftPrompt = useCallback((p: string | null) => {
    setDraftPromptState(p);
  }, []);
  const clearDraftPrompt = useCallback(() => {
    setDraftPromptState(null);
  }, []);
  const requestReset = useCallback(() => {
    setResetNonce((n) => n + 1);
  }, []);
  return (
    <Ctx.Provider value={{ draftPrompt, setDraftPrompt, clearDraftPrompt, requestReset, resetNonce }}>
      {children}
    </Ctx.Provider>
  );
}

export function useComposerPrompt(): ComposerPromptValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useComposerPrompt must be used within ComposerPromptProvider");
  return v;
}

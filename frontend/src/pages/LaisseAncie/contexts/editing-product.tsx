/**
 * EditingProductContext —— 跨 tab 传递"正在编辑的产品"信号。
 *
 * Lookbook 点击「编辑」→ setEditingProduct(product) + navigateTab('single')
 * → Composer mount 时读取 editingProduct 初始化 chat(注入方案 + 图片 + 结构)
 * → 消费后置空(clearEditingProduct),避免重复注入。
 */
import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import type { Product } from "../types/design";

interface EditingProductValue {
  editingProduct: Product | null;
  setEditingProduct: (p: Product | null) => void;
  clearEditingProduct: () => void;
}

const Ctx = createContext<EditingProductValue | null>(null);

export function EditingProductProvider({ children }: { children: ReactNode }) {
  const [editingProduct, setEditingProductState] = useState<Product | null>(null);
  const setEditingProduct = useCallback((p: Product | null) => {
    setEditingProductState(p);
  }, []);
  const clearEditingProduct = useCallback(() => {
    setEditingProductState(null);
  }, []);
  return (
    <Ctx.Provider value={{ editingProduct, setEditingProduct, clearEditingProduct }}>
      {children}
    </Ctx.Provider>
  );
}

export function useEditingProduct(): EditingProductValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useEditingProduct must be used within EditingProductProvider");
  return v;
}

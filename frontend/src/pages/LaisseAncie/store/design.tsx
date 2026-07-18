/**
 * HTTP-backed DesignStore — 团队作用域。
 * 路径:/api/teams/:teamId/products & /collections,teamId 来自 CurrentTeamContext。
 */
import { createContext, useContext, useEffect, useMemo, useState, useCallback, type ReactNode } from "react";
import { teamApi } from "../lib/api";
import { useCurrentTeam } from "../../../contexts/CurrentTeamContext";
import type { Collection, Product, ProductOutfitEntry } from "../types/design";

interface ContextValue {
  products: Product[];
  collections: Collection[];
  upsertProduct: (p: Product) => Promise<void>;
  removeProduct: (id: string) => Promise<void>;
  /** 将一条穿搭效果图追加到多个参与单品的 outfits 字段 */
  addOutfitToProducts: (productIds: string[], outfit: ProductOutfitEntry) => Promise<void>;
  upsertCollection: (c: Collection) => Promise<void>;
  removeCollection: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
  loading: boolean;
}

const Ctx = createContext<ContextValue | null>(null);

export function DesignStoreProvider({ children }: { children: ReactNode }) {
  const { teamId } = useCurrentTeam();
  const [products, setProducts] = useState<Product[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    try {
      const api = teamApi(teamId);
      const [p, c] = await Promise.all([api.listProducts(), api.listCollections()]);
      setProducts(p);
      setCollections(c);
    } catch (err) {
      console.error("[design] refresh failed", err);
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => { void refresh(); }, [refresh, teamId]);

  const upsertProduct = useCallback(async (p: Product) => {
    if (!teamId) return;
    const api = teamApi(teamId);
    if (p.id && products.some((x) => x.id === p.id)) {
      await api.updateProduct(p.id, p);
    } else {
      await api.createProduct(p);
    }
    await refresh();
  }, [teamId, products, refresh]);

  const removeProduct = useCallback(async (id: string) => {
    if (!teamId) return;
    await teamApi(teamId).deleteProduct(id);
    await refresh();
  }, [teamId, refresh]);

  // 将一条穿搭效果图追加到多个参与单品的 outfits 字段(一次请求写入所有产品,再刷新列表)
  const addOutfitToProducts = useCallback(async (productIds: string[], outfit: ProductOutfitEntry) => {
    if (!teamId || !productIds.length) return;
    // 后端按 teamId 校验所有权,仅写入本 team 拥有的产品
    await teamApi(teamId).addOutfits(productIds, outfit);
    await refresh();
  }, [teamId, refresh]);

  const upsertCollection = useCallback(async (c: Collection) => {
    if (!teamId) return;
    const api = teamApi(teamId);
    if (c.id && collections.some((x) => x.id === c.id)) {
      await api.updateCollection(c.id, c);
    } else {
      await api.createCollection(c);
    }
    await refresh();
  }, [teamId, collections, refresh]);

  const removeCollection = useCallback(async (id: string) => {
    if (!teamId) return;
    await teamApi(teamId).deleteCollection(id);
    await refresh();
  }, [teamId, refresh]);

  const value = useMemo<ContextValue>(() => ({
    products, collections, upsertProduct, removeProduct, addOutfitToProducts,
    upsertCollection, removeCollection, refresh, loading,
  }), [products, collections, upsertProduct, removeProduct, addOutfitToProducts, upsertCollection, removeCollection, refresh, loading]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDesignStore(): ContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useDesignStore must be used within DesignStoreProvider");
  return v;
}

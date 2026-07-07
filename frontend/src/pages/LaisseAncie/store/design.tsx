// @ts-nocheck
/**
 * HTTP-backed DesignStore — talks /api/laisse-ancie/products & /collections.
 * Drop-in replacement for the localStorage store used by the original Laisse Ancie SPA.
 */
import { createContext, useContext, useEffect, useMemo, useState, useCallback, type ReactNode } from "react";
import { apiClient } from "../../../../utils/apiClient";
import type { Collection, Product } from "../types/design";

interface ContextValue {
  products: Product[];
  collections: Collection[];
  upsertProduct: (p: Product) => Promise<void>;
  removeProduct: (id: string) => Promise<void>;
  upsertCollection: (c: Collection) => Promise<void>;
  removeCollection: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
  loading: boolean;
}

const Ctx = createContext<ContextValue | null>(null);

export function DesignStoreProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [p, c] = await Promise.all([
        apiClient.get<Product[]>("/api/laisse-ancie/products"),
        apiClient.get<Collection[]>("/api/laisse-ancie/collections"),
      ]);
      setProducts(p);
      setCollections(c);
    } catch (err) {
      console.error("[design] refresh failed", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const upsertProduct = useCallback(async (p: Product) => {
    if (p.id && products.some((x) => x.id === p.id)) {
      await apiClient.patch<Product>(`/api/laisse-ancie/products/${p.id}`, p);
    } else {
      await apiClient.post<Product>("/api/laisse-ancie/products", p);
    }
    await refresh();
  }, [products, refresh]);

  const removeProduct = useCallback(async (id: string) => {
    await apiClient.delete(`/api/laisse-ancie/products/${id}`);
    await refresh();
  }, [refresh]);

  const upsertCollection = useCallback(async (c: Collection) => {
    if (c.id && collections.some((x) => x.id === c.id)) {
      await apiClient.patch<Collection>(`/api/laisse-ancie/collections/${c.id}`, c);
    } else {
      await apiClient.post<Collection>("/api/laisse-ancie/collections", c);
    }
    await refresh();
  }, [collections, refresh]);

  const removeCollection = useCallback(async (id: string) => {
    await apiClient.delete(`/api/laisse-ancie/collections/${id}`);
    await refresh();
  }, [refresh]);

  const value = useMemo<ContextValue>(() => ({
    products, collections, upsertProduct, removeProduct,
    upsertCollection, removeCollection, refresh, loading,
  }), [products, collections, upsertProduct, removeProduct, upsertCollection, removeCollection, refresh, loading]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDesignStore(): ContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useDesignStore must be used within DesignStoreProvider");
  return v;
}

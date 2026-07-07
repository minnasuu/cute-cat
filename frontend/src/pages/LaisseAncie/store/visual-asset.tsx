// @ts-nocheck
/**
 * HTTP-backed visual asset registry.
 * Stores metadata via /api/laisse-ancie/visual-assets; src = data URI or URL.
 */
import { createContext, useContext, useEffect, useMemo, useState, useCallback, type ReactNode } from "react";
import { apiClient } from "../lib/api";
import type { VisualAsset } from "../types/visual-asset";

interface ContextValue {
  assets: VisualAsset[];
  upsert: (a: VisualAsset) => Promise<void>;
  remove: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
  loading: boolean;
}

const Ctx = createContext<ContextValue | null>(null);

export function VisualAssetStoreProvider({ children }: { children: ReactNode }) {
  const [assets, setAssets] = useState<VisualAsset[]>([]);
  const [loading, setLoading] = useState(true);
  let didInit = false;

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await apiClient.get<VisualAsset[]>("/api/laisse-ancie/visual-assets");
      // migrate old schema: {title, description, src, kind, tags?, seasons?, pinned?, created_at}
      const normalized = rows.map((r: any) => ({
        id: r.id,
        kind: r.kind || "illustration",
        title: r.title || "untitled",
        description: r.description,
        src: r.src || r.url || "",
        thumb: r.thumb || r.src || r.url || "",
        tags: r.tags || [],
        seasons: r.seasons || [],
        pinned: !!r.pinned,
        createdAt: r.created_at || r.createdAt || new Date().toISOString(),
      }));
      setAssets(normalized);
    } catch (err) {
      console.error("[visual-asset] refresh failed", err);
      setAssets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!didInit) { didInit = true; void refresh(); }
  }, [refresh]);

  const upsert = useCallback(async (a: VisualAsset) => {
    if (assets.some((x) => x.id === a.id)) {
      await apiClient.patch<VisualAsset>(`/api/laisse-ancie/visual-assets/${a.id}`, a);
    } else {
      await apiClient.post<VisualAsset>("/api/laisse-ancie/visual-assets", a);
    }
    await refresh();
  }, [assets, refresh]);

  const remove = useCallback(async (id: string) => {
    await apiClient.delete(`/api/laisse-ancie/visual-assets/${id}`);
    await refresh();
  }, [refresh]);

  const value = useMemo<ContextValue>(() => ({ assets, upsert, remove, refresh, loading }), [assets, upsert, remove, refresh, loading]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useVisualAssetStore(): ContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useVisualAssetStore must be used within VisualAssetStoreProvider");
  return v;
}

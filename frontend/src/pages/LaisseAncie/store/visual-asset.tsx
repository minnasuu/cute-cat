// @ts-nocheck
/**
 * HTTP-backed visual asset registry — 团队作用域。
 * 路径:/api/teams/:teamId/assets,teamId 来自 CurrentTeamContext。
 * src = data URI 或 URL。
 */
import { createContext, useContext, useEffect, useMemo, useState, useCallback, type ReactNode } from "react";
import { teamApi } from "../lib/api";
import { useCurrentTeam } from "../../../contexts/CurrentTeamContext";
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
  const { teamId } = useCurrentTeam();
  const [assets, setAssets] = useState<VisualAsset[]>([]);
  const [loading, setLoading] = useState(true);
  let didInit = false;

  const refresh = useCallback(async (tid: string) => {
    setLoading(true);
    try {
      const rows = await teamApi(tid).listAssets();
      // normalize old schema: {title, description, src, kind, tags?, seasons?, pinned?, created_at}
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
    if (!didInit && teamId) { didInit = true; void refresh(teamId); }
  }, [refresh, teamId]);

  const upsert = useCallback(async (a: VisualAsset) => {
    if (!teamId) return;
    const api = teamApi(teamId);
    if (assets.some((x) => x.id === a.id)) {
      await api.updateAsset(a.id, a);
    } else {
      await api.createAsset(a);
    }
    await refresh(teamId);
  }, [teamId, assets, refresh]);

  const remove = useCallback(async (id: string) => {
    if (!teamId) return;
    await teamApi(teamId).deleteAsset(id);
    await refresh(teamId);
  }, [teamId, refresh]);

  const value = useMemo<ContextValue>(() => ({ assets, upsert, remove, refresh, loading }), [assets, upsert, remove, refresh, loading]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useVisualAssetStore(): ContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useVisualAssetStore must be used within VisualAssetStoreProvider");
  return v;
}

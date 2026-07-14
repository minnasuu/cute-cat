// @ts-nocheck
/**
 * ResourceStore —— 团队作用域「资源」(灵感 + 材料)。
 * 路径:/api/teams/:teamId/inspirations 与 /api/teams/:teamId/materials,
 * teamId 来自 CurrentTeamContext。
 */
import { createContext, useContext, useEffect, useMemo, useState, useCallback, type ReactNode } from "react";
import { teamApi } from "../lib/api";
import { useCurrentTeam } from "../../../contexts/CurrentTeamContext";
import type { StyleRow } from "../types/design";

export interface InspirationItem {
  id: string;
  url: string;
  thumbUrl?: string;
  mime?: string;
  bytes?: number;
  category?: string | null;
  silhouette?: string | null;
  colors?: string[];
  brandAnalysis?: string | null;
  designHighlights?: string[];
  styleFeatures?: string[];
  // AI 视觉分析新增字段(后端 lAInspirationAsset 已落库,用于灵感 injector 相关性匹配)
  visualStyle?: string | null;
  designApproach?: string | null;
  inspiration?: string[];
  analysisStatus?: "pending" | "success" | "failed" | null;
  useCount?: number;
  createdAt: string;
}

export interface MaterialRow {
  id: string;
  slug: string;
  category: string;
  name: string;
  code?: string | null;
  supplier?: string | null;
  origin?: string | null;
  colors?: any;
  composition?: string | null;
  weight?: string | null;
  texture?: string | null;
  finish?: string | null;
  width?: string | null;
  thickness?: string | null;
  diameter?: string | null;
  size?: string | null;
  tex?: string | null;
  shape?: string | null;
  originNote?: string | null;
  care?: any;
  uses?: any;
  seasons?: any;
  notes?: string | null;
  priceAmount?: number | null;
  priceCur?: string | null;
  priceUnit?: string | null;
  priceNote?: string | null;
  /** 材料参考图 URL */
  image?: string | null;
  createdAt: string;
  updatedAt?: string;
}

interface ResourceValue {
  inspirations: InspirationItem[];
  materials: MaterialRow[];
  styles: StyleRow[];
  loading: boolean;
  refreshInspirations: () => Promise<void>;
  refreshMaterials: () => Promise<void>;
  refreshStyles: () => Promise<void>;
  refreshAll: () => Promise<void>;
}

const Ctx = createContext<ResourceValue | null>(null);

export function ResourceStoreProvider({ children }: { children: ReactNode }) {
  const { teamId } = useCurrentTeam();
  const [inspirations, setInspirations] = useState<InspirationItem[]>([]);
  const [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [styles, setStyles] = useState<StyleRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshInspirations = useCallback(async (tid: string) => {
    try {
      const data = await teamApi(tid).listInspirations({ take: 96 });
      setInspirations(data.items ?? []);
    } catch (err) {
      console.error("[resource] refresh inspirations failed", err);
      setInspirations([]);
    }
  }, []);

  const refreshMaterials = useCallback(async (tid: string) => {
    try {
      const rows = await teamApi(tid).listMaterials();
      setMaterials(rows);
    } catch (err) {
      console.error("[resource] refresh materials failed", err);
      setMaterials([]);
    }
  }, []);

  const refreshStyles = useCallback(async (tid: string) => {
    try {
      const rows = await teamApi(tid).listStyles();
      setStyles(rows);
    } catch (err) {
      console.error("[resource] refresh styles failed", err);
      setStyles([]);
    }
  }, []);

  const refreshAll = useCallback(async (tid: string) => {
    setLoading(true);
    try {
      await Promise.all([refreshInspirations(tid), refreshMaterials(tid), refreshStyles(tid)]);
    } finally {
      setLoading(false);
    }
  }, [refreshInspirations, refreshMaterials, refreshStyles]);

  useEffect(() => {
    if (teamId) void refreshAll(teamId);
  }, [refreshAll, teamId]);

  const value = useMemo<ResourceValue>(
    () => ({
      inspirations, materials, styles, loading,
      refreshInspirations: () => (teamId ? refreshInspirations(teamId) : Promise.resolve()),
      refreshMaterials: () => (teamId ? refreshMaterials(teamId) : Promise.resolve()),
      refreshStyles: () => (teamId ? refreshStyles(teamId) : Promise.resolve()),
      refreshAll: () => (teamId ? refreshAll(teamId) : Promise.resolve()),
    }),
    [inspirations, materials, styles, loading, teamId, refreshInspirations, refreshMaterials, refreshStyles, refreshAll],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useResourceStore(): ResourceValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useResourceStore must be used within ResourceStoreProvider");
  return v;
}

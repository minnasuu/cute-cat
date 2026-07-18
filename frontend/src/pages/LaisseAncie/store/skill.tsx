/**
 * HTTP-backed SkillStore — 团队作用域技能知识库。
 * 路径:/api/teams/:teamId/skills,teamId 来自 CurrentTeamContext。
 *
 * 不再预置任何示例/占位文章；知识库由用户从空开始沉淀。
 * 旧 seed（skill-seed-1 … skill-seed-8）若仍残留在 DB,refresh 时自动清除(自愈式迁移)。
 */
import { createContext, useContext, useEffect, useMemo, useState, useCallback, type ReactNode } from "react";
import { teamApi } from "../lib/api";
import { useCurrentTeam } from "../../../contexts/CurrentTeamContext";
import type { SkillArticle } from "../types/skill";

interface ContextValue {
  articles: SkillArticle[];
  upsert: (a: SkillArticle) => Promise<void>;
  remove: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
  loading: boolean;
}

const Ctx = createContext<ContextValue | null>(null);

/** 旧 seed 文章 id 集合。SEED 已清空;这些行若残留则 refresh 时自动删除。 */
const LEGACY_SEED_IDS = new Set([
  "skill-seed-1", "skill-seed-2", "skill-seed-3", "skill-seed-4",
  "skill-seed-5", "skill-seed-6", "skill-seed-7", "skill-seed-8",
]);

const SEED: SkillArticle[] = [];

export function SkillStoreProvider({ children }: { children: ReactNode }) {
  const { teamId } = useCurrentTeam();
  const [articles, setArticles] = useState<SkillArticle[]>([]);
  const [loading, setLoading] = useState(true);
  let didInit = false;

  const refresh = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    try {
      const api = teamApi(teamId);
      let rows: SkillArticle[] = await api.listSkills();
      // 自愈式迁移：清除残留的旧 seed 行（skill-seed-1 … skill-seed-8），仅删除这些 id，不动用户自建文章。
      const stale = rows.filter((r) => LEGACY_SEED_IDS.has(r.id));
      if (stale.length > 0) {
        await Promise.all(stale.map((r) => api.deleteSkill(r.id).catch(() => { /* ignore */ })));
        rows = rows.filter((r) => !LEGACY_SEED_IDS.has(r.id));
      }
      if (rows.length === 0) {
        // seed（当前 SEED 为空 → 知识库保持空白，由用户从空沉淀）
        for (const a of SEED) {
          try { await api.createSkill(a); } catch { /* ignore */ }
        }
        const seeded = await api.listSkills();
        setArticles(seeded);
      } else {
        setArticles(rows);
      }
    } catch (err) {
      console.error("[skill] refresh failed", err);
      setArticles(SEED);
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    if (!didInit && teamId) { didInit = true; void refresh(); }
  }, [refresh, teamId]);

  const upsert = useCallback(async (a: SkillArticle) => {
    if (!teamId) return;
    const api = teamApi(teamId);
    if (articles.some((x) => x.id === a.id)) {
      await api.updateSkill(a.id, a);
    } else {
      await api.createSkill(a);
    }
    await refresh();
  }, [teamId, articles, refresh]);

  const remove = useCallback(async (id: string) => {
    if (!teamId) return;
    await teamApi(teamId).deleteSkill(id);
    await refresh();
  }, [teamId, refresh]);

  const value = useMemo<ContextValue>(() => ({ articles, upsert, remove, refresh, loading }), [articles, upsert, remove, refresh, loading]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSkillStore(): ContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSkillStore must be used within SkillStoreProvider");
  return v;
}

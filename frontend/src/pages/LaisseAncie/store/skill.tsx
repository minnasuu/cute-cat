// @ts-nocheck
/**
 * HTTP-backed SkillStore — 团队作用域技能知识库。
 * 路径:/api/teams/:teamId/skills,teamId 来自 CurrentTeamContext。
 * 首次进入空集合时自动 seed 6 篇示例文章(与旧 Laisse Ancie 行为一致)。
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

const SEED: SkillArticle[] = [
  { id: "skill-seed-1", category: "phase-06-development", zhTitle: "French Seam 工艺检查清单",
    title: "Quality checklist - French seams on 19 mm silk",
    body: "## Why French\n\n- 19 momme silks fray immediately on raw edge\n- H fell / flat fell gathers leave a ridge under the arm\n\n## Steps\n\n1. **Wrong sides together**, first pass 3 mm\n2. Trim to 1.5 mm\n3. Press open, fold again encasing - second pass 5 mm\n4. Press toward front\n\n## QC checklist\n- [ ] No raw edge visible\n- [ ] Seam sits flat when garment is turned\n- [ ] Tug 5N to ensure no pop",
    tags: ["french-seam", "silk", "19-momme", "qc"], relatedProducts: [], relatedMaterials: [],
    systemHint: "Use French seams on all silk pieces ≥ 19 momme; the standard 5 mm second pass is non-negotiable for SS26 Tide.",
    pinned: true, createdAt: "2025-02-01T00:00:00Z", updatedAt: "2025-02-01T00:00:00Z" },

  { id: "skill-seed-2", category: "phase-04-textile", zhTitle: "水洗真丝工艺缩水率经验谈",
    title: "Washable silk - what the shrinkage curve looks like",
    body: "## Data (three seasons)\n\n| Momme | Wash 1 len | Wash 1 wid | Wash 10 len |\n|-------|-----------|-----------|----------------|\n| 19    | -2.1 %    | -1.0 %    | -3.8 % |\n| 16    | -2.8 %    | -1.2 %    | -4.4 % |\n\n## Take-away\n- Always block on the first wash\n- Bias pieces: use bias-stretch measurement, not horizontal\n- Add 4 % ease to grading on washable silk by default",
    tags: ["washable-silk", "shrinkage", "blocking"], relatedProducts: [], relatedMaterials: [],
    systemHint: "Washable silk shrinks predictably — add 4 % ease to grading on bias-cut pieces.",
    pinned: true, createdAt: "2025-01-01T00:00:00Z", updatedAt: "2025-01-01T00:00:00Z" },

  { id: "skill-seed-3", category: "phase-03-design", zhTitle: "One-seam slip dress 原型",
    title: "Bias one-seam - the building block of the SS26 tide line",
    body: "## Construction\n\n- 1-front panel (on bias)\n- 2 straps folded into 1 twice\n- Single shoulder-joined; opens over-the-shoulder\n\n## Blocks used\n- Block 102 (Scye Bias)\n- Grading: Bias = use block-grade x 1.04 on vertical, +2 / size horizontally",
    tags: ["bias", "block-102", "silk-dress"], relatedProducts: [], relatedMaterials: [],
    pinned: true, createdAt: "2025-03-01T00:00:00Z", updatedAt: "2025-03-01T00:00:00Z" },

  { id: "skill-seed-4", category: "phase-06-development", zhTitle: "Biella Textile 系列 · 订货规范",
    title: "Biella Textile - lead times and MOQs (FW26 refresh)",
    body: "## Contact\n- Elena Vannucci - ev@biellatex.it\n- Tel +39 031 873 118\n\n## MOQ\n- 140 cm width: 200 m per colour\n- Lead time: 28 days ex-PO\n- Payment: 50 % up-front, balance against BL",
    tags: ["biella-textile", "silk", "lead-time", "moq"], relatedProducts: [], relatedMaterials: [],
    systemHint: "For double-face merino wool: MOQ 200 m / colour, 28-day lead time via Biella.",
    pinned: true, createdAt: "2024-10-01T00:00:00Z", updatedAt: "2024-10-01T00:00:00Z" },

  { id: "skill-seed-5", category: "phase-08-brand", zhTitle: "Lookbook 文案 - Spring Tide 落地",
    title: "Copy-deck seed - SS26 Spring Tide + Valentine crossover",
    body: "## Hero line\nTide is the moment between the first plunge and the last wash.\n\n## Voice checks\n- No must-have — use reaches for\n- No chic in Chinese\n- No disembodied adjectives — show the garment being worn",
    tags: ["lookbook", "copy", "springtide", "voice"], relatedProducts: [], relatedMaterials: [],
    systemHint: "Brand voice: 优雅 (graceful), 松弛 (unforced), 乐趣 (playful). Never formalwear / streetwear language.",
    pinned: true, createdAt: "2025-04-01T00:00:00Z", updatedAt: "2025-04-01T00:00:00Z" },

  { id: "skill-seed-6", category: "phase-07-qa", zhTitle: "FQC 进仓检验清单",
    title: "FQC checklist - what goes green before a piece hits the WH",
    body: "## Visual\n- Stains / chalk marks / foreign fibres\n- Colour match against fabric swatch (D65 lightbox)\n\n## Dimensional\n- Chest, waist, shoulder, hem, sleeve\n- Allowance: +/-1.5 cm (silk) / +/-2.0 cm (wool)\n\n## Pull test\n- Seams: 60 N / 5 s no pop\n- Zipper: 500 open / close no snag",
    tags: ["fqc", "quality", "packaging", "wh"], relatedProducts: [], relatedMaterials: [],
    pinned: true, createdAt: "2024-06-01T00:00:00Z", updatedAt: "2024-06-01T00:00:00Z" },

  // 占位骨架种子（新体系、旧体系里暂无对应。pinned:false，仅作占位）
  { id: "skill-seed-7", category: "phase-01-research", zhTitle: "市场研究 · 待沉淀",
    title: "Research seed — trends / competitors / audience",
    body: "本阶段知识待沉淀：竞品、秀场、趋势报告、客群洞察等研究知识。",
    tags: ["research", "placeholder"], relatedProducts: [], relatedMaterials: [],
    pinned: false, createdAt: "2025-05-01T00:00:00Z", updatedAt: "2025-05-01T00:00:00Z" },

  { id: "skill-seed-8", category: "phase-05-visual", zhTitle: "视觉表现 · 待沉淀",
    title: "Visualization seed — lookbook / photography / render",
    body: "本阶段知识待沉淀：主视觉、Lookbook、拍摄方案、配色与排版等视觉表现知识。",
    tags: ["visual", "placeholder"], relatedProducts: [], relatedMaterials: [],
    pinned: false, createdAt: "2025-06-01T00:00:00Z", updatedAt: "2025-06-01T00:00:00Z" },
];

export function SkillStoreProvider({ children }: { children: ReactNode }) {
  const { teamId } = useCurrentTeam();
  const [articles, setArticles] = useState<SkillArticle[]>([]);
  const [loading, setLoading] = useState(true);
  let didInit = false;

  const refresh = useCallback(async (tid: string) => {
    setLoading(true);
    try {
      const api = teamApi(tid);
      const rows = await api.listSkills();
      if (rows.length === 0) {
        // seed
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
  }, []);

  useEffect(() => {
    if (!didInit && teamId) { didInit = true; void refresh(teamId); }
  }, [refresh, teamId]);

  const upsert = useCallback(async (a: SkillArticle) => {
    if (!teamId) return;
    const api = teamApi(teamId);
    if (articles.some((x) => x.id === a.id)) {
      await api.updateSkill(a.id, a);
    } else {
      await api.createSkill(a);
    }
    await refresh(teamId);
  }, [teamId, articles, refresh]);

  const remove = useCallback(async (id: string) => {
    if (!teamId) return;
    await teamApi(teamId).deleteSkill(id);
    await refresh(teamId);
  }, [teamId, refresh]);

  const value = useMemo<ContextValue>(() => ({ articles, upsert, remove, refresh, loading }), [articles, upsert, remove, refresh, loading]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSkillStore(): ContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSkillStore must be used within SkillStoreProvider");
  return v;
}

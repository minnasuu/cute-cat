import React, { createContext, useContext, useEffect, useMemo, useState, useCallback, type ReactNode } from 'react';
import { apiClient } from '../utils/apiClient';

/**
 * CurrentTeamContext —— 当前选中的团队。
 *
 * 通用团队工作台(/dashboard)之下的"teamId 源":
 *   - 默认取当前用户的第一个团队(兼容期即 Laisse Ancie / workbench 团队);
 *   - 用户通过 TeamSelect 切换时,setTeamId 更新,所有消费端(store/页面)自动用新 teamId 拉数据。
 *
 * 首次进入时若用户还没有任何团队,后端 resolveTeam 中间件会自动创建默认 Laisse Ancie 团队;
 * 前端做一次"团队就绪前 loading"守卫,避免 store 打出 `/api/teams/undefined/...`。
 */

export interface TeamShape {
  id: string;
  name: string;
  description?: string | null;
}

interface CurrentTeamValue {
  teamId: string | null;
  team: TeamShape | null;
  teams: TeamShape[];
  loading: boolean;
  setTeamId: (id: string) => void;
  refreshTeams: () => Promise<void>;
  /** 在通用工作台主内容区切换到指定 tab(扩展/知识底座 id),无需 react-router。 */
  navigateTab: (tabId: string) => void;
  /** 当前 active tab id(由 TeamWorkbench 驱动)。 */
  activeTab: string;
}

const Ctx = createContext<CurrentTeamValue | null>(null);

function normalizeTeam(raw: any): TeamShape {
  return { id: raw.id, name: raw.name, description: raw.description ?? null };
}

export function CurrentTeamProvider({ children }: { children: ReactNode }) {
  const [teamId, setTeamIdState] = useState<string | null>(null);
  const [teams, setTeams] = useState<TeamShape[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>('__design__');

  const refreshTeams = useCallback(async () => {
    setLoading(true);
    try {
      const list = await apiClient.get<any[]>('/api/teams');
      const normalized: TeamShape[] = Array.isArray(list) ? list.map(normalizeTeam) : [];
      setTeams(normalized);
      // 尚无选中团队 → 默认选第一个(兼容期即 Laisse Ancie / workbench 团队)
      setTeamIdState((prev) => prev ?? normalized[0]?.id ?? null);
    } catch (err) {
      console.error('[CurrentTeamContext] load teams failed', err);
      setTeams([]);
      setTeamIdState(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshTeams();
  }, [refreshTeams]);

  const setTeamId = useCallback((id: string) => {
    setTeamIdState(id);
  }, []);

  const navigateTab = useCallback((tabId: string) => {
    setActiveTab(tabId);
  }, []);

  const team = useMemo(() => teams.find((t) => t.id === teamId) ?? null, [teams, teamId]);

  const value = useMemo<CurrentTeamValue>(
    () => ({ teamId, team, teams, loading, setTeamId, refreshTeams, navigateTab, activeTab }),
    [teamId, team, teams, loading, setTeamId, refreshTeams, navigateTab, activeTab],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCurrentTeam(): CurrentTeamValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useCurrentTeam must be used within CurrentTeamProvider');
  return v;
}

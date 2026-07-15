import React, { createContext, useContext, useEffect, useMemo, useState, useCallback, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiClient } from '../utils/apiClient';
import { resolveTabFromSearch, DEFAULT_TAB_ID } from '../pages/DashboardPage/teamNav';

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
  // URL ?tab= 同步:初始化读 URL,后续通过 navigateTab 写 URL
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<string>(() => resolveTabFromSearch(searchParams.toString()));

  const refreshTeams = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiClient.get<{ workspaces: any[]; coins: number }>('/api/workspaces');
      const list = Array.isArray(data.workspaces) ? data.workspaces : [];
      const normalized: TeamShape[] = list.map(normalizeTeam);
      setTeams(normalized);
      // 尚无选中团队 → 默认选第一个官方工作台(服装工作台)
      setTeamIdState((prev) => prev ?? normalized[0]?.id ?? null);
    } catch (err) {
      console.error('[CurrentTeamContext] load workspaces failed', err);
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
    // 同步到 URL ?tab=,用 replace 避免每个 tab 切换都产生历史记录
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (tabId === DEFAULT_TAB_ID) next.delete("tab");
      else next.set("tab", tabId);
      return next;
    }, { replace: true });
  }, [setSearchParams]);

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

// @ts-nocheck
import React, { useState, lazy, Suspense } from 'react';
import Navbar from '../../components/Navbar';
import { TeamSelect } from '../../components/TeamSelect';
import { useCurrentTeam } from '../../contexts/CurrentTeamContext';
import { EXTENSION_REGISTRY, KNOWLEDGE_REGISTRY } from './teamNav';

/** 设计 Composer —— 团队主页/主流程(默认展示)。 */
import ComposerPage from '../LaisseAncie/pages/Composer';

/** 扩展 tab 懒加载(避免首屏过大)。 */
const InspirationsPage = lazy(() => import('../LaisseAncie/pages/Inspirations'));
const LookbookPage = lazy(() => import('../LaisseAncie/pages/Lookbook'));
const MaterialsPage = lazy(() => import('../LaisseAncie/pages/Materials'));
const SkillsPage = lazy(() => import('../LaisseAncie/pages/Skills'));
const AssetsPage = lazy(() => import('../LaisseAncie/pages/Assets'));

const EXTENSION_COMPONENTS: Record<string, React.LazyExoticComponent<ComponentType<any>>> = {
  inspirations: InspirationsPage,
  lookbook: LookbookPage,
  materials: MaterialsPage,
  skills: SkillsPage,
  assets: AssetsPage,
};

/** 团队主页默认展示设计 Composer(主流程)。 */
const HOME_EXTENSION_ID = '__design__';

/** 设计模式(单件/插画/系列),可在左侧导航下方切换。 */
type DesignMode = 'single' | 'illustration' | 'collection';
const DESIGN_MODES: { id: DesignMode; label: string }[] = [
  { id: 'single', label: '单品' },
  { id: 'illustration', label: '插画' },
  { id: 'collection', label: '系列' },
];

export default function TeamWorkbench() {
  const { teamId, team, teams, loading: teamLoading, setTeamId, activeTab, navigateTab } = useCurrentTeam();
  const [designMode, setDesignMode] = useState<DesignMode>('single');

  if (teamLoading || !teamId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fafafa] text-gray-500">
        加载团队中…
      </div>
    );
  }

  const extensionTabs = Object.entries(EXTENSION_REGISTRY).map(([id, meta]) => ({
    id, label: meta.label, icon: meta.icon,
  }));
  const knowledgeTabs = Object.entries(KNOWLEDGE_REGISTRY).map(([id, meta]) => ({
    id, label: meta.label, icon: meta.icon,
  }));

  function renderActive() {
    if (activeTab === HOME_EXTENSION_ID) {
      return <ComposerPage mode={designMode} />;
    }
    const Comp = EXTENSION_COMPONENTS[activeTab];
    if (!Comp) return <div className="p-8 text-gray-500">未找到该扩展</div>;
    return (
      <Suspense fallback={<div className="p-8 text-gray-500">加载中…</div>}>
        <Comp />
      </Suspense>
    );
  }

  return (
    <div className="min-h-screen bg-[#fafafa] text-gray-900">
      <Navbar
        afterLogo={
          <div className="flex items-center gap-3">
            <TeamSelect
              value={teamId}
              options={teams.map((t) => ({ id: t.id, label: t.name }))}
              onChange={(id) => {
                navigateTab(HOME_EXTENSION_ID);
                setTeamId(id);
              }}
              ariaLabel="选择团队"
              variant="compact"
            />
          </div>
        }
      />

      <div className="flex h-[calc(100vh-64px)] min-h-0">
        {/* 左侧团队导航 */}
        <aside className="w-56 shrink-0 border-r border-gray-200 bg-white px-3 py-4 flex flex-col overflow-y-auto">
          <div className="px-2 mb-2 text-[10px] uppercase tracking-wider text-gray-500">工作台</div>
          <nav className="flex flex-col gap-0.5">
            <NavBtn
              current={activeTab === HOME_EXTENSION_ID}
              onClick={() => navigateTab(HOME_EXTENSION_ID)}
              icon="★"
              label="设计"
            />
            {/* 设计模式子菜单(选中"设计"时显示) */}
            {activeTab === HOME_EXTENSION_ID && (
              <div className="ml-4 flex flex-col gap-0.5 mt-0.5">
                {DESIGN_MODES.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setDesignMode(m.id)}
                    className={`w-full text-left px-2 py-1 rounded text-[12px] transition-colors ${
                      designMode === m.id
                        ? 'bg-blue-100 text-blue-700 font-medium'
                        : 'text-gray-500 hover:text-blue-600'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            )}
            {extensionTabs.map((t) => (
              <NavBtn
                key={t.id}
                current={activeTab === t.id}
                onClick={() => navigateTab(t.id)}
                icon={t.icon}
                label={t.label}
              />
            ))}
          </nav>

          <div className="my-3 border-t border-gray-200" />

          <div className="px-2 mb-2 text-[10px] uppercase tracking-wider text-gray-500">知识底座</div>
          <nav className="flex flex-col gap-0.5">
            {knowledgeTabs.map((t) => (
              <NavBtn
                key={t.id}
                current={activeTab === t.id}
                onClick={() => navigateTab(t.id)}
                icon={t.icon}
                label={t.label}
              />
            ))}
          </nav>
        </aside>

        {/* 主内容区 */}
        <main className="flex-1 min-w-0 overflow-y-auto">
          {renderActive()}
        </main>
      </div>
    </div>
  );
}

function NavBtn({
  current, onClick, icon, label,
}: {
  current: boolean;
  onClick: () => void;
  icon?: string;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 ${
        current
          ? 'bg-blue-600 text-white font-medium'
          : 'text-gray-600 hover:bg-blue-50 hover:text-blue-700'
      }`}
    >
      {icon && <span className="text-xs">{icon}</span>}
      <span>{label}</span>
    </button>
  );
}

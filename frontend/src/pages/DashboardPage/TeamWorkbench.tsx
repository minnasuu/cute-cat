// @ts-nocheck
/**
 * TeamWorkbench —— 通用团队工作台主组件。
 *
 * 左栏结构:
 *   ★ 设计(主工作台,带 单品/插画/系列 模式切换子菜单)
 *   ─────
 *   资源  ▾ (灵感 / Lookbook / 材料)     ← 合并为一组,作为设计调用的素材库
 *   ─────
 *   知识底座 ▾ (技能 / 资产)             ← 团队通用知识,注入 AI 的 system prompt
 *
 * 设计主工作台会自动读取「资源」和「知识底座」的内容,按相关性注入 chat 的
 * system prompt,让 AI 在生成成品时参考团队的素材与知识。
 */
import React, { useState, lazy, Suspense } from 'react';
import Navbar from '../../components/Navbar';
import { TeamSelect } from '../../components/TeamSelect';
import { useCurrentTeam } from '../../contexts/CurrentTeamContext';
import { useSkillStore } from '../LaisseAncie/store/skill';
import { useVisualAssetStore } from '../LaisseAncie/store/visual-asset';
import { useDesignStore } from '../LaisseAncie/store/design';
import { useResourceStore } from '../LaisseAncie/store/resource';
import { DESIGN_MODES, RESOURCE_SECTIONS, KNOWLEDGE_SECTIONS, ALL_DATA_TABS, type DesignMode } from './teamNav';

/** 设计 Composer —— 团队主页/主流程(默认展示)。 */
import ComposerPage from '../LaisseAncie/pages/Composer';

/** 数据 tab 懒加载(避免首屏过大)。 */
const InspirationsPage = lazy(() => import('../LaisseAncie/pages/Inspirations'));
const LookbookPage = lazy(() => import('../LaisseAncie/pages/Lookbook'));
const MaterialsPage = lazy(() => import('../LaisseAncie/pages/Materials'));
const SkillsPage = lazy(() => import('../LaisseAncie/pages/Skills'));
const AssetsPage = lazy(() => import('../LaisseAncie/pages/Assets'));

const DATA_COMPONENTS: Record<string, React.LazyExoticComponent<ComponentType<any>>> = {
  inspirations: InspirationsPage,
  lookbook: LookbookPage,
  materials: MaterialsPage,
  skills: SkillsPage,
  assets: AssetsPage,
};

/** 团队主页默认展示设计 Composer(主流程)。 */
const HOME_ID = '__design__';

export default function TeamWorkbench() {
  const { teamId, team, teams, loading: teamLoading, setTeamId, activeTab, navigateTab } = useCurrentTeam();
  const [designMode, setDesignMode] = useState<DesignMode>('single');

  // 预加载资源 + 知识底座数据,传给 Composer 用于自动注入 system prompt
  const skillStore = useSkillStore();
  const visualAssetStore = useVisualAssetStore();
  const designStore = useDesignStore();
  const resourceStore = useResourceStore();

  if (teamLoading || !teamId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fafafa] text-gray-500">
        加载团队中…
      </div>
    );
  }

  function renderActive() {
    if (activeTab === HOME_ID) {
      return (
        <ComposerPage
          mode={designMode}
          knowledge={{
            skills: skillStore.articles,
            assets: visualAssetStore.assets,
            inspirations: resourceStore.inspirations,
            materials: resourceStore.materials,
            products: designStore.products,
          }}
        />
      );
    }
    const Comp = DATA_COMPONENTS[activeTab];
    if (!Comp) return <div className="p-8 text-gray-500">未找到该 tab</div>;
    return (
      <Suspense fallback={<div className="p-8 text-gray-500">加载中…</div>}>
        <Comp />
      </Suspense>
    );
  }

  function switchTab(tabId: string) {
    navigateTab(tabId);
  }

  function renderNavSections() {
    const sections = [
      { key: 'resources' as const, data: RESOURCE_SECTIONS },
      { key: 'knowledge' as const, data: KNOWLEDGE_SECTIONS },
    ];
    return sections.map(({ key, data }) => (
      <React.Fragment key={key}>
        {data.map((section) => (
          <NavSection
            key={section.id}
            section={section}
            activeTab={activeTab}
            onSwitch={switchTab}
          />
        ))}
        <div className="my-3 border-t border-gray-200" />
      </React.Fragment>
    ));
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
                navigateTab(HOME_ID);
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
              current={activeTab === HOME_ID}
              onClick={() => navigateTab(HOME_ID)}
              icon="★"
              label="设计"
            />
            {/* 设计模式子菜单(选中"设计"时显示) */}
            {activeTab === HOME_ID && (
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
          </nav>

          <div className="my-3 border-t border-gray-200" />

          {renderNavSections()}
        </aside>

        {/* 主内容区 */}
        <main className="flex-1 min-w-0 overflow-y-auto">
          {renderActive()}
        </main>
      </div>
    </div>
  );
}

/** 一个导航分类(资源 / 知识底座)及其子 tab 列表。 */
function NavSection({
  section,
  activeTab,
  onSwitch,
}: {
  section: { id: string; label: string; icon?: string; tabs: { id: string; label: string; icon?: string }[] };
  activeTab: string;
  onSwitch: (id: string) => void;
}) {
  const hasActive = section.tabs.some((t) => t.id === activeTab);
  return (
    <div>
      <div className="px-2 mb-2 text-[10px] uppercase tracking-wider text-gray-500 flex items-center gap-1">
        {section.icon && <span>{section.icon}</span>}
        {section.label}
      </div>
      <nav className="flex flex-col gap-0.5">
        {section.tabs.map((t) => (
          <NavBtn
            key={t.id}
            current={activeTab === t.id}
            onClick={() => onSwitch(t.id)}
            icon={t.icon}
            label={t.label}
          />
        ))}
      </nav>
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

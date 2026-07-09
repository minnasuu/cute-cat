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
import React, { useState, lazy, Suspense, useEffect, useCallback, type ComponentType } from 'react';
import Navbar from '../../components/Navbar';
import { TeamSelect } from '../../components/TeamSelect';
import { apiClient } from '../../utils/apiClient';
import { useCurrentTeam } from '../../contexts/CurrentTeamContext';
import { useSkillStore } from '../LaisseAncie/store/skill';
import { useVisualAssetStore } from '../LaisseAncie/store/visual-asset';
import { useDesignStore } from '../LaisseAncie/store/design';
import { useResourceStore } from '../LaisseAncie/store/resource';
import { useIsMobile } from '../../hooks/use-media-query';
import { DESIGN_TABS, RESOURCE_SECTIONS, KNOWLEDGE_SECTIONS, ALL_DATA_TABS, isDesignTab } from './teamNav';
import type { DesignMode } from './teamNav';
import type { KnowledgeDeps } from './knowledge-injectors';

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

/**
 * Composer 挂载:访问过的 tab 常驻(display:none),切回来时 DOM/解码后的图片还在。
 * 初始只挂载第一个设计 tab(单品),其余按需访问;用 mode 做单个 Composer key,
 * 保证每个 design tab 各自的 chat 状态彼此隔离、不会被复用。
 */
export default function TeamWorkbench() {
  const { teamId, team, teams, loading: teamLoading, setTeamId, activeTab, navigateTab } = useCurrentTeam();
  const [brand, setBrand] = useState<KnowledgeDeps["brand"]>(undefined);
  const [brandLoading, setBrandLoading] = useState(true);
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  // 3 个 design tab(单品/插画/系列)预挂载 → 各自 chat 路径完全独立且常驻
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(
    () => new Set(DESIGN_TABS.map((t) => t.id)),
  );

  // 预加载资源 + 知识底座数据,传给 Composer 用于自动注入 system prompt
  const skillStore = useSkillStore();
  const visualAssetStore = useVisualAssetStore();
  const designStore = useDesignStore();
  const resourceStore = useResourceStore();

  // 所有知识源首次加载完成前,禁用发送(避免拿到空知识库)
  const knowledgeLoading = brandLoading || skillStore.loading || visualAssetStore.loading || designStore.loading || resourceStore.loading;

  // 预加载品牌资产
  useEffect(() => {
    if (!teamId) { setBrandLoading(false); return; }
    apiClient.get(`/api/teams/${teamId}/brand`).then((r) => {
      if (r.profile) setBrand({
        ...r.profile,
        colors: r.colors || [],
      });
    }).catch(() => { /* ignore */ }).finally(() => setBrandLoading(false));
  }, [teamId]);

  if (teamLoading || !teamId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fafafa] text-gray-500">
        加载团队中…
      </div>
    );
  }

  /**
   * 渲染主内容区。
   * 3 个 design tab 各自挂在独立的 ComposerPage 实例上(用 mode 做 key 隔离 chat 状态),
   * 已访问的 tab 常驻(display:none 隐藏非活跃)。
   */
  function renderActive() {
    return (
      <>
        {/* 3 个一级设计 tab —— 各自独立的 Composer 实例 */}
        {DESIGN_TABS.map((t) => visitedTabs.has(t.id) && (
          <div key={t.id} className={activeTab === t.id ? '' : 'hidden'}>
            <ComposerPage
              mode={t.id}
              brandLoading={brandLoading}
              knowledgeLoading={knowledgeLoading}
              knowledge={{
                skills: skillStore.articles,
                assets: visualAssetStore.assets,
                inspirations: resourceStore.inspirations,
                materials: resourceStore.materials,
                products: designStore.products,
                brand,
              }}
            />
          </div>
        ))}
        {/* 数据 tab(惰性加载过就常驻挂载) */}
        {Object.entries(DATA_COMPONENTS).map(([id, Comp]) => (
          visitedTabs.has(id) && (
            <div key={id} className={activeTab === id ? '' : 'hidden'}>
              <Suspense fallback={<div className="p-8 text-gray-500">加载中…</div>}>
                <Comp />
              </Suspense>
            </div>
          )
        ))}
      </>
    );
  }

  function switchTab(tabId: string) {
    setVisitedTabs((prev) => new Set(prev).add(tabId)); // 标记为已访问 → 常驻挂载
    navigateTab(tabId);
    if (isMobile) setDrawerOpen(false); // 移动端点完自动收起抽屉
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

  /** 侧边栏内容 —— 桌面端直出、移动端塞进抽屉,复用同一份。 */
  function renderSidebar() {
    return (
      <>
        <div className="px-2 mb-2 text-[10px] uppercase tracking-wider text-gray-500">工作台</div>
        <nav className="flex flex-col gap-0.5">
          {/* 三个一级设计 tab:平级,模式分离 */}
          {DESIGN_TABS.map((t) => (
            <NavBtn
              key={t.id}
              current={activeTab === t.id}
              onClick={() => switchTab(t.id)}
              icon={t.icon}
              label={t.label}
            />
          ))}
        </nav>

        <div className="my-3 border-t border-gray-200" />

        {renderNavSections()}
      </>
    );
  }

  return (
    <div className="min-h-screen bg-[#fafafa] text-gray-900">
      <Navbar
        afterLogo={
          <div className="flex items-center gap-3">
            {/* 移动端:汉堡按钮展开侧边栏导航 */}
            {isMobile && (
              <button
                onClick={() => setDrawerOpen(true)}
                aria-label="打开导航"
                title="导航"
                className="md:hidden w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50 active:bg-gray-100"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
              </button>
            )}
            <TeamSelect
              value={teamId}
              options={teams.map((t) => ({ id: t.id, label: t.name }))}
              onChange={(id) => {
                // 切换团队后回到当前 design tab(保持用户所在模式)
                setTeamId(id);
              }}
              ariaLabel="选择团队"
              variant="compact"
            />
          </div>
        }
      />

      <div className="flex h-[calc(100vh-64px)] min-h-0">
        {/* 桌面端左侧团队导航(≥md 直出) */}
        <aside className="hidden md:flex w-40 shrink-0 border-r border-gray-200 bg-white px-3 py-4 flex-col overflow-y-auto">
          {renderSidebar()}
        </aside>

        {/* 主内容区 */}
        <main className="flex-1 min-w-0 overflow-y-auto">
          {renderActive()}
        </main>
      </div>

      {/* 移动端抽屉式侧边栏(<md 才渲染) */}
      {isMobile && (
        <>
          {/* 遮罩 */}
          {drawerOpen && (
            <div
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
              onClick={() => setDrawerOpen(false)}
            />
          )}
          {/* 抽屉 */}
          <aside
            className={`fixed top-0 left-0 z-50 h-full w-64 bg-white border-r border-gray-200 shadow-xl px-3 py-4 flex flex-col overflow-y-auto transition-transform duration-200 ${drawerOpen ? 'translate-x-0' : '-translate-x-full'}`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-gray-700">导航</span>
              <button
                onClick={() => setDrawerOpen(false)}
                aria-label="关闭导航"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            {renderSidebar()}
          </aside>
        </>
      )}
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
        {/* {section.icon && <span>{section.icon}</span>} */}
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
      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 ${current
        ? 'bg-primary-500 text-white font-medium'
        : 'text-gray-600 hover:bg-primary-50 hover:text-primary-600'
        }`}
    >
      {icon && <span className="text-xs">{icon}</span>}
      <span>{label}</span>
    </button>
  );
}

import type { ComponentType } from 'react';

/**
 * 团队导航配置。
 *
 * 每个团队工作台由两类 tab 组成:
 *   - extensions(扩展内容):如设计/灵感/Lookbook/材料 —— 不同团队可有不同的扩展;
 *   - knowledgeBase(知识底座):技能/资产 —— 团队级通用概念,与技能平级。
 *
 * 首版团队 = Laisse Ancie(时尚工作室)。未来新团队可覆写此配置。
 */

export interface NavItem {
  id: string;
  label: string;
  icon?: string;
  type: 'extension' | 'knowledge';
  component: ComponentType;
}

export const TEAM_NAV_ITEMS: NavItem[] = [
  // 扩展内容(设计主流程 + 灵感/Lookbook/材料)
  // 注意:「设计」作为主页默认展示,由 TeamWorkbench 直接渲染,不在此列表中;
  //       这里列的是除主页之外的扩展 tab。
  // 未来新团队可在此数组中增删/重排扩展 tab。
];

/**
 * 团队知识底座 tab(技能/资产)—— 团队级通用,与技能平级。
 * 放在导航下方,与扩展内容之间用分隔线隔开。
 */
export const TEAM_KNOWLEDGE_ITEMS: NavItem[] = [
  // 具体组件在 TeamWorkbench 中通过动态 import 注入,避免循环依赖。
  // 这里只保留 id/label/icon,TeamWorkbench 用 id 匹配组件。
];

/** 团队扩展 tab 注册表(TeamWorkbench 用 id 查找组件)。 */
export const EXTENSION_REGISTRY: Record<string, { label: string; icon: string }> = {
  inspirations: { label: '灵感', icon: '◐' },
  lookbook:     { label: 'Lookbook', icon: '✦' },
  materials:    { label: '材料', icon: '◫' },
};

/** 团队知识底座 tab 注册表(团队级通用)。 */
export const KNOWLEDGE_REGISTRY: Record<string, { label: string; icon: string }> = {
  skills: { label: '技能', icon: '✎' },
  assets: { label: '资产', icon: '◻' },
};

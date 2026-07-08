/**
 * 团队导航元数据。
 *
 * 左栏结构:
 *   ★ 设计(主工作台,带 单品/插画/系列 模式切换子菜单)
 *   ─────
 *   资源  ▾ (灵感 / Lookbook / 材料)     ← 合并为一组,作为设计调用的素材库
 *   ─────
 *   知识底座 ▾ (技能 / 资产)             ← 团队通用知识,注入 AI 的 system prompt
 *
 * 未来新团队可覆写此配置:在「资源」或「知识底座」下增删子 tab。
 */

/** 设计模式 */
export type DesignMode = "single" | "illustration" | "collection";

export interface NavSubTab {
  id: string;
  label: string;
  icon?: string;
}

export interface NavSection {
  id: string;
  label: string;
  icon?: string;
  defaultExpanded: boolean;
  tabs: NavSubTab[];
}

/** 设计主工作台的「模式切换」子菜单(不属于数据 tab,直接切 Composer mode) */
export const DESIGN_MODES: { id: DesignMode; label: string }[] = [
  { id: "single", label: "单品" },
  { id: "illustration", label: "插画" },
  { id: "collection", label: "系列" },
];

/** 「资源」分类下的子 tab(数据浏览 tab) */
export const RESOURCE_SECTIONS: NavSection[] = [
  {
    id: "resources",
    label: "资源",
    icon: "◐",
    defaultExpanded: true,
    tabs: [
      { id: "inspirations", label: "灵感", icon: "◐" },
      { id: "lookbook", label: "Lookbook", icon: "✦" },
      { id: "materials", label: "材料", icon: "◫" },
    ],
  },
];

/** 「知识底座」分类下的子 tab(数据浏览 tab) */
export const KNOWLEDGE_SECTIONS: NavSection[] = [
  {
    id: "knowledge",
    label: "知识底座",
    icon: "✎",
    defaultExpanded: true,
    tabs: [
      { id: "skills", label: "技能", icon: "✎" },
      { id: "assets", label: "资产", icon: "◻" },
    ],
  },
];

/** 所有数据 tab 的统一注册表(TeamWorkbench 用 id 查找 meta)。 */
export const ALL_DATA_TABS: Record<string, NavSubTab & { section: "resources" | "knowledge" }> = {};
for (const s of RESOURCE_SECTIONS) for (const t of s.tabs) ALL_DATA_TABS[t.id] = { ...t, section: "resources" };
for (const s of KNOWLEDGE_SECTIONS) for (const t of s.tabs) ALL_DATA_TABS[t.id] = { ...t, section: "knowledge" };

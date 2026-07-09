/**
 * 团队导航元数据。
 *
 * 左栏结构:
 *   ★ 单品 / 插画 / 系列                 ← 三个平级一级设计 tab,点击进入各自创作
 *   ─────
 *   资源  ▾ (灵感 / Lookbook / 材料)     ← 合并为一组,作为设计调用的素材库
 *   ─────
 *   知识底座 ▾ (知识库 / 资产)           ← 团队通用知识(10 phase),注入 AI 的 system prompt
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

/**
 * 一级设计 tab(平级)。点击后右侧进入对应模式的创作(chat+preview):
 *   - 单品/系列: 走现有图片生成(/design/generate)
 *   - 插画: chat 输出 HTML,右侧用画布渲染
 */
export const DESIGN_TABS: { id: DesignMode; label: string; icon: string }[] = [
  { id: "single", label: "单品", icon: "◧" },
  { id: "illustration", label: "插画", icon: "◨" },
  { id: "collection", label: "系列", icon: "◫" },
];

/** 检测一个 tab id 是否为一级设计 tab */
export function isDesignTab(id: string): id is DesignMode {
  return (DESIGN_TABS as { id: DesignMode }[]).some((t) => t.id === id);
}

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
      { id: "skills", label: "知识库", icon: "✎" },
      { id: "assets", label: "资产", icon: "◻" },
    ],
  },
];

/** 所有数据 tab 的统一注册表(TeamWorkbench 用 id 查找 meta)。 */
export const ALL_DATA_TABS: Record<string, NavSubTab & { section: "resources" | "knowledge" }> = {};
for (const s of RESOURCE_SECTIONS) for (const t of s.tabs) ALL_DATA_TABS[t.id] = { ...t, section: "resources" };
for (const s of KNOWLEDGE_SECTIONS) for (const t of s.tabs) ALL_DATA_TABS[t.id] = { ...t, section: "knowledge" };

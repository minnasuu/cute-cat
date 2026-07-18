/**
 * 团队导航元数据。
 *
 * 左栏结构:
 *   ★ 灵感扩散 / 材料组合                 ← 平级一级设计 tab,点击进入各自创作(插画暂时隐藏)
 *   ─────
 *   资源  ▾ (灵感 / Lookbook / 材料)     ← 合并为一组,作为设计调用的素材库
 *   ─────
 *   知识底座 ▾ (知识库 / 资产)           ← 团队通用知识(4 阶段),注入 AI 的 system prompt
 *
 * 未来新团队可覆写此配置:在「资源」或「知识底座」下增删子 tab。
 */

/** 设计模式 */
export type DesignMode = "single" | "illustration" | "material-combo" | "style-mutate";

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
 * 一级设计 tab(平级)。点击后右侧进入对应模式的创作:
 *   - 灵感扩散(single): chat → 灵感 → 方案 → 线稿 → 选材料 → 成图
 *   - 材料组合(material-combo): 固定表单(名称+面料图+款式参考图+描述) → 白底效果图
 *   - 款式裂变(style-mutate): 钉死母款 → 沿廓形/领型/袖长等轴裂变子款网格
 *
 * 插画(illustration)模式暂时隐藏(仍可通过代码访问,不影响既有管线)。
 */
export const DESIGN_TABS: { id: DesignMode; label: string; icon: string }[] = [
  { id: "single", label: "灵感扩散", icon: "◧" },
  { id: "material-combo", label: "材料组合", icon: "◫" },
  { id: "style-mutate", label: "款式裂变", icon: "◈" },
];

/** 检测一个 tab id 是否为一级设计 tab */
export function isDesignTab(id: string): id is DesignMode {
  return (DESIGN_TABS as { id: DesignMode }[]).some((t) => t.id === id);
}

/** 默认 landing tab(灵感扩散) */
export const DEFAULT_TAB_ID = "single";

/** 「资源」分类下的子 tab(数据浏览 tab) */
export const RESOURCE_SECTIONS: NavSection[] = [
  {
    id: "resources",
    label: "资源",
    icon: "◐",
    defaultExpanded: true,
    tabs: [
      { id: "inspirations", label: "灵感", icon: "◐" },
      { id: "materials", label: "面料", icon: "◫" },
      { id: "styles", label: "款式", icon: "◑" },
      { id: "illustrations", label: "插画", icon: "◈" },
      { id: "models", label: "模特", icon: "◉" },
      { id: "assets", label: "品牌信息", icon: "◻" },
      { id: "lookbook", label: "Lookbook", icon: "✦" },
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
    ],
  },
];

/** 所有数据 tab 的统一注册表(TeamWorkbench 用 id 查找 meta)。 */
export const ALL_DATA_TABS: Record<string, NavSubTab & { section: "resources" | "knowledge" }> = {};
for (const s of RESOURCE_SECTIONS) for (const t of s.tabs) ALL_DATA_TABS[t.id] = { ...t, section: "resources" };
for (const s of KNOWLEDGE_SECTIONS) for (const t of s.tabs) ALL_DATA_TABS[t.id] = { ...t, section: "knowledge" };

/** 校验一个 tab id 是否合法(设计 tab + 数据 tab) */
export function isValidTabId(id: string | null | undefined): boolean {
  return !!id && (isDesignTab(id) || id in ALL_DATA_TABS);
}

/** 把 URL ?tab= 解析为合法 tab id,非法时回落到 DEFAULT_TAB_ID */
export function resolveTabFromSearch(search: string): string {
  const id = new URLSearchParams(search).get("tab");
  return isValidTabId(id) ? id! : DEFAULT_TAB_ID;
}

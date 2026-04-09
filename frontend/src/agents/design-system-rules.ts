export type DesignSystemRule = {
  category: string;
  rule: string;
};

/** ✅ DO：推荐做法 */
export const DESIGN_SYSTEM_DOS: DesignSystemRule[] = [
  // ── 色彩/主题 ──
  {
    category: "色彩/主题",
    rule: "统一用 shadcn 语义变量 `hsl(var(--xxx))`：primary/background/card/foreground/muted-foreground/border/input/ring/accent/secondary/muted/destructive/success/warning/info/primary-subtle",
  },
  { category: "色彩/主题", rule: "透明度用 `hsl(var(--xxx) / 0.1)` 语法" },
  {
    category: "色彩/主题",
    rule: "整体页面底色用 bg-[hsl(var(--background))]（白色/极浅色）",
  },
  {
    category: "色彩/主题",
    rule: "主色 hsl(var(--primary)) 仅用于 CTA 按钮、活跃 Tab 指示器、关键图标，面积 ≤ 10%；大面积保持 background/card 的白/灰",
  },
  {
    category: "色彩/主题",
    rule: "正文色用 text-[hsl(var(--foreground))]，次要文字用 text-[hsl(var(--muted-foreground))]",
  },
  {
    category: "色彩/主题",
    rule: "pageStylePack 仅供理解色板倾向，不要重新定义 :root",
  },
  { category: "色彩/主题", rule: "文字颜色符合 WANG「对比度」设计原则" },

  // ── 阴影/边框 ──
  { category: "阴影/边框", rule: "阴影用柔和双层，尽量减少投影使用" },
  {
    category: "阴影/边框",
    rule: "hover 态阴影增强：hover:shadow-[0_4px_12px_rgba(0,0,0,0.08),0_16px_40px_rgba(0,0,0,0.08)]",
  },
  {
    category: "阴影/边框",
    rule: "所有边框统一用 `border-[0.5px]`（或 `border-t-[0.5px]` / `border-b-[0.5px]`）",
  },
  {
    category: "阴影/边框",
    rule: "所有分割线必须搭配足够间距（上方 mb-4~mb-6 或下方 mt-4~mt-6 + 内部 py-3~py-4）",
  },
  { category: "阴影/边框", rule: "图片上的文字放在带背景模糊的透明中性色块上" },

  // ── 布局/间距 ──
  { category: "布局/间距", rule: "Hero 区域：py-32~py-60 纵向充裕留白" },
  { category: "布局/间距", rule: "模块间距：gap-8~gap-20，保持呼吸感" },
  {
    category: "布局/间距",
    rule: "web: max-w-6xl mx-auto / app: max-w-[430px] mx-auto min-h-screen",
  },
  {
    category: "布局/间距",
    rule: "grid 布局可变：grid-cols-1 md:grid-cols-2 lg:grid-cols-3，穿插 col-span-2 宽卡打破节奏",
  },
  { category: "布局/间距", rule: "组件内 p-4~p-8，留白充裕" },
  { category: "布局/间距", rule: "布局和间距符合「亲密性」设计原则" },

  // ── 排版 ──
  {
    category: "排版",
    rule: "适当增加视觉 Banner、视觉装饰元素、视觉装饰背景丰富页面层次，避免页面全是卡片列表",
  },
  {
    category: "排版",
    rule: "Hero/Display 标题：text-4xl md:text-5xl font-bold tracking-tight leading-[1.1]",
  },
  { category: "排版", rule: "区域标题：text-2xl font-semibold tracking-tight" },
  { category: "排版", rule: "卡片标题：text-lg font-semibold" },
  {
    category: "排版",
    rule: "正文：text-base leading-relaxed text-[hsl(var(--muted-foreground))]",
  },
  {
    category: "排版",
    rule: "辅助/标签：text-xs font-medium text-[hsl(var(--muted-foreground))] tracking-wide uppercase",
  },
  {
    category: "排版",
    rule: "层级清晰：标题深色 foreground，正文 muted-foreground，辅助更淡",
  },
  {
    category: "排版",
    rule: "banner 标题使用大号加粗文字，根据需求选择合适字体，可适当对其中关键字做高亮或装饰元素",
  },

  // ── 圆角 ──
  { category: "圆角", rule: "卡片：rounded-2xl~rounded-3xl（16-24px）" },
  { category: "圆角", rule: "按钮：rounded-xl~rounded-full" },
  { category: "圆角", rule: "输入框：rounded-xl" },
  { category: "圆角", rule: "Badge/Tag：rounded-full" },
  { category: "圆角", rule: "保持全局圆角一致性" },
  { category: "圆角", rule: "嵌套模块的圆角符合「同心圆」的设计准则" },

  // ── 导航/Header ──
  {
    category: "导航/Header",
    rule: "每个项目的 Header 应该独特：根据项目类型选择不同的导航风格",
  },
  {
    category: "导航/Header",
    rule: "可选方案：a) 简洁品牌 logo + 水平 Tab 导航 b) 全宽搜索优先布局 c) 带 Hero banner 的沉浸式顶部 d) 双层导航（品牌行 + 功能行）e) 侧边抽屉式导航触发器",
  },
  {
    category: "导航/Header",
    rule: "Tab 切换按钮样式也应多样化：下划线式、pill 胶囊式、填充卡片式、图标+文字组合式等",
  },

  // ── 微交互 ──
  { category: "微交互", rule: "transition-all duration-200 ease-out" },
  {
    category: "微交互",
    rule: "卡片 hover：shadow 增强 + translate-y-[-1px] 微浮",
  },
  { category: "微交互", rule: "按钮 hover：opacity 变化或微 scale" },
  { category: "微交互", rule: "背景图片 scale 变化" },

  // ── 图标 ──
  {
    category: "图标",
    rule: '图标、装饰性符号、分类标记**必须**用 lucide-react 图标组件：`import { Xxx } from "lucide-react"`',
  },
  {
    category: "图标",
    rule: "文本内容中合理使用 emoji 辅助表达是允许的（如标签、状态文案）",
  },

  // ── 渐变色 ──
  {
    category: "渐变色",
    rule: "渐变色的 `from-[…]`、`to-[…]`、`via-[…]` **必须全部使用 CSS 变量**，如 `bg-gradient-to-br from-[hsl(var(--primary-subtle))] to-[hsl(var(--background))]`",
  },
  { category: "渐变色", rule: "选择饱和度较低的渐变色，避免过度鲜艳" },

  // ── 组件 ──
  {
    category: "组件",
    rule: "组件优先：按 reactLibrarySection 签名在文件顶部内联定义用到的 shadcn 组件，直接 `<Button>`、`<Card>` 调用",
  },
  {
    category: "组件",
    rule: "同类内容必须数据驱动：多张卡片、列表、网格项等用 `const items = [{...}, ...]` + `.map()` 渲染",
  },
  {
    category: "组件",
    rule: '精简 className：相同样式组合抽为常量（如 `const cardCls = cn("...")` ）',
  },
];

/** ❌ NOT DO：禁止做法 */
export const DESIGN_SYSTEM_DONTS: DesignSystemRule[] = [
  // ── 色彩/主题 ──
  {
    category: "色彩/主题",
    rule: "严禁硬编码 hex 颜色：`bg-[#RRGGBB]`、`text-white`、`bg-white` 等",
  },
  {
    category: "色彩/主题",
    rule: "大面积背景禁止带明显色彩倾向（如偏黄/偏粉/偏蓝），只用 background（白）/ muted（中性浅灰）/ card（白）",
  },
  { category: "色彩/主题", rule: "禁止在图片上使用有色文字" },

  // ── 阴影/边框 ──
  { category: "阴影/边框", rule: "禁止彩色辉光阴影" },
  {
    category: "阴影/边框",
    rule: "严禁使用默认 `border`（1px 太粗），必须用 `border-[0.5px]`",
  },
  { category: "阴影/边框", rule: "禁止分割线紧贴内容，必须搭配间距" },
  { category: "阴影/边框", rule: "禁止使用 box-shadow 代替 border" },
  { category: "阴影/边框", rule: "禁止同时添加小 size 的 box-shadow 和 border" },
  { category: "阴影/边框", rule: "禁止在彩色、重色块使用投影，避免色块重叠" },

  // ── 微交互 ──
  { category: "微交互", rule: "避免过多 backdrop-blur，关注性能" },

  // ── 图标 ──
  {
    category: "图标",
    rule: '图标、装饰性符号、分类标记不要用 emoji。❌ `<span>🛒 购物车</span>` → ✅ `<ShoppingCart className="h-5 w-5" />`',
  },

  // ── 渐变色 ──
  {
    category: "渐变色",
    rule: "严禁渐变色中变量与硬编码 hex 混用。❌ `from-[hsl(var(--xxx))] to-[#f3f4f6]`",
  },
  {
    category: "渐变色",
    rule: "严禁全硬编码渐变。❌ `bg-gradient-to-b from-[#eff6ff] to-transparent`",
  },

  // ── 组件 ──
  {
    category: "组件",
    rule: "严禁原生 `<button>`/`<div>` 手绘 UI，必须用 shadcn 组件",
  },
  { category: "组件", rule: "禁止 `@/components` 等路径引入" },
  {
    category: "组件",
    rule: "严禁手写多份近似 JSX 块，必须用数据驱动 + .map()",
  },
];


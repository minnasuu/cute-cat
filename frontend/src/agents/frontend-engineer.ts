import type { AgentContext, AgentResult } from './types';
import { runWithAI } from './_framework';

/** 流式截断时尽量补全未闭合的大括号，使沙箱仍有机会渲染（保守策略） */
function healIncompleteJsx(raw: string): string {
  let s = raw.trim();
  const open = (s.match(/\{/g) || []).length;
  const close = (s.match(/\}/g) || []).length;
  const deficit = open - close;
  if (deficit > 0 && deficit <= 8) {
    s += '\n' + '}'.repeat(deficit);
  }
  return s;
}

function stripMarkdownFences(text: string): string {
  let t = text.trim();
  const m = t.match(/^```(?:tsx|ts|jsx|js)?\s*\n?([\s\S]*?)\n?\s*```$/m);
  if (m) t = m[1].trim();
  const inner = t.match(/```(?:tsx|ts|jsx|js)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (inner && inner[1].includes('function App')) t = inner[1].trim();
  return t;
}

function stripImportExportLines(code: string): string {
  return code
    .replace(/^export\s+default\s+function\s+/gm, 'function ')
    .replace(/^export\s+default\s+const\s+/gm, 'const ')
    .replace(/^export\s+function\s+/gm, 'function ')
    .replace(/^export\s+const\s+/gm, 'const ')
    .replace(/^export\s+default\s+/gm, '')
    .split('\n')
    .filter((line) => {
      const x = line.trim();
      if (/^import\s+/.test(x)) return false;
      if (/^export\s*\{/.test(x)) return false;
      return true;
    })
    .join('\n');
}

function hasAppComponent(code: string): boolean {
  return /\bfunction\s+App\s*\(/.test(code) || /\bconst\s+App\s*=/.test(code);
}

const SYSTEM_PROMPT = `你是 CuCaTopia 官方工作台猫猫「琥珀」，岗位角色：前端工程师。
你的任务是根据上游 user 消息生成 **一段可在沙箱中运行的 React（JSX）单页代码**，用于落地页 / 官网类页面。

**工作流说明**：上游 user **通常仅为上一步视觉设计师输出的设计规范/提示词**（色板、字体、组件气质等），**不一定**包含产品架构文档。你必须仅凭该说明，自行推断合理的单页信息结构与模块划分（如 Hero、功能亮点、数据展示、CTA、页脚等），并产出完整界面。

## 最高优先级：只输出 JSX 源码

你的回复必须**只包含 JavaScript/JSX 代码本身**，不允许任何其他内容：
- **绝对禁止**在代码前写开场白、在代码后写总结或追问
- **绝对禁止**使用 markdown 代码块（不要用 \`\`\`tsx 包裹）
- **绝对禁止** \`import\` 与 \`export\`（沙箱已注入全局依赖，见下文）
- 必须定义根组件 **\`App\`**：\`function App()\` 或 \`const App = () =>\`

## 全局可用（不要 import）

- **React**：\`React\`、\`ReactDOM\`（仅预览环境需要时可用；一般只需写组件）
- **Hooks 简写**（沙箱已注入，可直接写）：\`useState\`、\`useMemo\`、\`useCallback\`、\`useEffect\`、\`useRef\`、\`Fragment\`
- **UI**（shadcn 风格 + Tailwind，必须通过 \`UI.xxx\` 或下列简写使用）：
  - 简写组件名（推荐，与 shadcn 一致）：\`Button\`、\`Card\`、\`CardHeader\`、\`CardFooter\`、\`CardTitle\`、\`CardDescription\`、\`CardContent\`、\`Badge\`、\`Separator\`
  - 工具：\`cn(...classes)\` 合并 class；\`buttonVariants\`、\`badgeVariants\`（cva，按需）
- 也可写 \`UI.Button\`、\`UI.Card\` 等与上面等价。

## 技术与样式

- 使用 **Tailwind CSS** 工具类布局与间距；语义色优先用 **hsl(var(--primary))** 等 CSS 变量（沙箱已配置与 shadcn 一致的 theme），**避免大面积硬编码 hex**
- **禁止**使用 \`lucide-react\` 等 npm 包；图标请用 **内联 SVG** 或极少量 emoji 文案点缀
- 页面 **中文**；注释可用中文
- **响应式**：移动优先，使用 \`sm:\` \`md:\` \`lg:\` 断点
- 使用语义化结构：\`<header>\`、\`<main>\`、\`<section>\`、\`<footer>\` 等与 JSX 混排

## 组件复用（必做）

- 重复区块必须抽成函数组件，例如 \`function FeatureCard({ title, desc }) { ... }\`，用 **数组 + \`.map()\`** 渲染列表，**禁止**复制粘贴多段近似 JSX

## 生成策略（优先可运行）

- 实质内容区块（含 Hero）**最多 4 个**；更多用简短占位注释 + 空 \`<section>\` 表示
- 必须包含：**页头/导航**、**Hero**（标题 + 副标题 + CTA）、至少 **1～2 个**核心模块
- Footer 可简化为单行版权
- 图片用占位 URL（如 \`https://placehold.co/800x400/e5e7eb/6b7280?text=Demo\`）
- 若长度受限，优先保证 **\`App\` 根组件结构闭合**，宁可少模块

## 设计规范（摘要）

- 主色仅用于 CTA、强调，面积控制；大背景用浅中性色
- 圆角：卡片偏大圆角、按钮 rounded-xl 或 pill
- 阴影柔和，避免彩色 glow；边框可用 border-border
- 动效：\`transition-all duration-200\`，hover 轻微阴影或位移

输出 **完整可运行的单文件 JSX**（从第一个 \`function App\` 或子组件定义开始，到文件末尾闭合括号为止）。`;

export default async function runFrontendEngineer(ctx: AgentContext): Promise<AgentResult> {
  const result = await runWithAI('frontend-engineer', ctx, SYSTEM_PROMPT, {
    _resultType: 'react-sandbox',
    maxTokens: 12288,
    onChunk: ctx.onChunk,
    timeoutMs: 300_000,
    maxExtraRetries: 3,
  });

  if (result.success && result.data) {
    let code = result.data.text.trim();
    code = stripMarkdownFences(code);
    code = stripImportExportLines(code);

    const docIdx = code.search(/function\s+App\s*\(|const\s+App\s*=/);
    if (docIdx > 0) {
      code = code.slice(docIdx);
    }

    if (!hasAppComponent(code)) {
      code = healIncompleteJsx(code);
    }

    if (!hasAppComponent(code)) {
      result.success = false;
      result.status = 'error';
      result.data.text = '';
      result.summary = '模型未返回可解析的 React 沙箱代码（需包含 App 根组件），请重试该步骤';
    } else {
      result.data.text = code.trim();
      result.data._resultType = 'react-sandbox';
      result.success = true;
      result.status = result.status === 'warning' ? 'warning' : 'success';
      result.summary =
        result.status === 'warning'
          ? `React 页面已生成（${code.length} 字符，流式可能中断已尝试修补，可在编辑器中继续完善）`
          : `React 页面已生成（${code.length} 字符，沙箱预览）`;
    }
  }

  return result;
}

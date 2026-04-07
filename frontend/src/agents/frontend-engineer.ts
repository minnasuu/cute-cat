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
  if (
    inner &&
    (/\bexport\s+default\b/.test(inner[1]) ||
      /\bfunction\s+AppPreview\s*\(/.test(inner[1]) ||
      /\bconst\s+AppPreview\s*=/.test(inner[1]))
  ) {
    t = inner[1].trim();
  }
  return t;
}

function hasDefaultExportComponent(code: string): boolean {
  return /\bexport\s+default\s+function\s+\w+\s*\(/.test(code) || /\bexport\s+default\s+(\w+)\s*;/.test(code);
}

const SYSTEM_PROMPT = `你是 CuCaTopia 官方工作台猫猫「琥珀」，岗位角色：前端工程师。
你的任务是根据上游 user 消息生成 **一份可直接放进前端项目的 React + TypeScript（TSX）单文件页面代码**（类似 Vite/CRA 页面组件），用于落地页 / 官网类页面。

**工作流说明**：上游 user **通常仅为上一步视觉设计师输出的设计规范/提示词**（色板、字体、组件气质等），**不一定**包含产品架构文档。你必须仅凭该说明，自行推断合理的单页信息结构与模块划分（如 Hero、功能亮点、数据展示、CTA、页脚等），并产出完整界面。

## 最高优先级：只输出 TSX 源码（完整文件）

你的回复必须**只包含 TypeScript/TSX 代码本身**，不允许任何其他内容：
- **绝对禁止**在代码前写开场白、在代码后写总结或追问
- **绝对禁止**使用 markdown 代码块（不要用 \`\`\`tsx 包裹）
- 你必须输出完整文件结构：\`import ...\`、工具函数、子组件、页面数据、主组件，并以 **\`export default function AppPreview()\`** 作为默认导出（组件名固定为 \`AppPreview\`）

## 依赖与导入（必须 import）

- React：\`import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";\`
- 图标：允许使用 lucide-react：\`import { ... } from "lucide-react";\`
- class 合并：\`import { clsx } from "clsx";\` 与 \`import { twMerge } from "tailwind-merge";\`，并实现 \`cn()\`

## 技术与样式

- 使用 **Tailwind CSS** 工具类布局与间距；语义色优先用 **hsl(var(--primary))** 等 CSS 变量（沙箱已配置与 shadcn 一致的 theme），**避免大面积硬编码 hex**
- 图标优先用 \`lucide-react\`，数量适度；避免引入其他杂包
- 页面 **中文**；注释可用中文
- **响应式**：移动优先，使用 \`sm:\` \`md:\` \`lg:\` 断点
- 使用语义化结构：\`<header>\`、\`<main>\`、\`<section>\`、\`<footer>\` 等与 JSX 混排

## 内置基础组件（必须输出）

你必须在文件中内置并导出/使用以下基础组件实现（不要从外部 UI 库 import）：
- \`Button\`（\`variant\`: default/outline/ghost/link；\`size\`: default/sm/lg/icon；\`React.forwardRef\`）
- \`Card\`、\`CardHeader\`、\`CardTitle\`、\`CardContent\`
- \`Input\`、\`Label\`
- \`Badge\`（default/secondary/outline）
- \`Separator\`
- \`Switch\`（受控：\`checked\` + \`onCheckedChange\`）
并实现工具函数：
- \`cn(...inputs)\` 使用 \`twMerge(clsx(...))\`

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

输出 **完整可运行的单文件 TSX**（从第一行 \`import ...\` 开始，到文件末尾闭合括号为止）。`;

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

    // 兼容流式输出中断：尽量补全大括号，减少 TSX 解析失败概率
    if (!hasDefaultExportComponent(code)) {
      code = healIncompleteJsx(code);
    }

    if (!hasDefaultExportComponent(code)) {
      result.success = false;
      result.status = 'error';
      result.data.text = '';
      result.summary = '模型未返回可解析的 React TSX 页面文件（需包含 export default 组件），请重试该步骤';
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

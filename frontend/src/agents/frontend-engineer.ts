import type { AgentContext, AgentResult } from './types';
import { runWithAI } from './_framework';

function stripMarkdownFences(text: string): string {
  let t = text.trim();
  const m = t.match(/^```(?:html|HTML)?\s*\n?([\s\S]*?)\n?\s*```$/m);
  if (m) t = m[1].trim();
  const inner = t.match(/```(?:html|HTML)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (inner && /<!doctype|<html/i.test(inner[1])) t = inner[1].trim();
  return t;
}

function normalizeHtmlDoc(raw: string): string {
  let s = String(raw || '').trim();
  s = stripMarkdownFences(s);
  const idx = s.search(/<!doctype|<html/i);
  if (idx > 0) s = s.slice(idx).trim();
  return s.trim();
}

function looksLikeHtmlDoc(html: string): boolean {
  const s = String(html || '').trim();
  return /^<!doctype\b/i.test(s) || /^<html\b/i.test(s);
}

const SYSTEM_PROMPT = `你是 CuCaTopia 官方工作台猫猫「琥珀」，岗位角色：前端工程师。
你的任务是根据上游 user 消息生成 **一个可直接打开的静态单页面落地页 HTML 文件**（自包含、无后端数据）。

**工作流说明**：上游 user **通常仅为上一步视觉设计师输出的设计规范/提示词**（色板、字体、组件气质等），也可能包含落地页模块大纲。

## 最高优先级：只输出 HTML 源码

你的回复必须**只包含 HTML 文档本身**，不允许任何其他内容：
- **绝对禁止**在 HTML 前写开场白、在 HTML 后写总结或追问
- **绝对禁止**使用 markdown 代码块（不要用 \`\`\`html 包裹）
- 必须输出完整文档：以 \`<!DOCTYPE html>\` 开头，包含 \`<html>\`、\`<head>\`、\`<body>\`

## 结构与导航（必须遵守）

- 语义化标签：\`<header>\`、\`<main>\`、\`<section>\`、\`<footer>\`
- 页面按模块划分：每个模块一个 \`<section id=\"...\"></section>\`，从上到下排布

## 样式与素材（必须自包含）

- 样式必须写在 \`<style>\` 内联（不要依赖 Tailwind、不要外链 CSS）
- 内容中文；响应式（移动优先 + media query）
- 图标与插画：优先内联 SVG / CSS 渐变 / 纯形状，**禁止**外链图片资源（避免导出图片时跨域污染）

输出 **完整可运行的单文件 HTML**（从 \`<!DOCTYPE html>\` 开始，到 \`</html>\` 结束）。`;

export default async function runFrontendEngineer(ctx: AgentContext): Promise<AgentResult> {
  const result = await runWithAI('frontend-engineer', ctx, SYSTEM_PROMPT, {
    _resultType: 'html-page',
    maxTokens: 12288,
    onChunk: ctx.onChunk,
    timeoutMs: 300_000,
    maxExtraRetries: 3,
  });

  if (result.success && result.data) {
    const html = normalizeHtmlDoc(result.data.text);
    if (!looksLikeHtmlDoc(html)) {
      result.success = false;
      result.status = 'error';
      result.data.text = '';
      result.summary = '模型未返回可解析的 HTML 文档（需以 <!DOCTYPE html> 或 <html> 开头），请重试该步骤';
    } else {
      result.data.text = html;
      result.data._resultType = 'html-page';
      result.success = true;
      result.status = result.status === 'warning' ? 'warning' : 'success';
      result.summary =
        result.status === 'warning'
          ? `落地页已生成（${html.length} 字符，流式可能中断但仍可预览与导出）`
          : `落地页已生成（${html.length} 字符，可预览与导出）`;
    }
  }

  return result;
}

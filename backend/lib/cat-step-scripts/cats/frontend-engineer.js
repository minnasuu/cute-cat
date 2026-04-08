'use strict';

const { runWithAIStream, extractUpstreamText } = require('../_framework');

function stripMarkdownFences(text) {
  let t = text.trim();
  const m = t.match(/^```(?:html|HTML)?\s*\n?([\s\S]*?)\n?\s*```$/m);
  if (m) t = m[1].trim();
  const inner = t.match(/```(?:html|HTML)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (inner && /<!doctype|<html/i.test(inner[1])) t = inner[1].trim();
  return t;
}

function normalizeHtmlDoc(raw) {
  let s = String(raw || '').trim();
  s = stripMarkdownFences(s);
  const idx = s.search(/<!doctype|<html/i);
  if (idx > 0) s = s.slice(idx).trim();
  return s.trim();
}

function looksLikeHtmlDoc(html) {
  const s = String(html || '').trim();
  return /^<!doctype\b/i.test(s) || /^<html\b/i.test(s);
}

const SYSTEM_PROMPT = `你是 CuCaTopia 官方工作台猫猫「琥珀」，岗位角色：前端工程师。
你的任务是根据上游 user 消息生成 **一个可直接打开的静态单页落地页 HTML 文件**（自包含、无后端数据）。

上游 user **通常仅为上一步视觉设计师输出的设计规范/提示词**，也可能包含落地页模块大纲。你必须根据上游内容自行推断合理的单页信息结构并产出完整界面。

## 最高优先级：只输出 HTML 源码

- 你的回复必须**只包含 HTML 文档本身**，不允许任何其他内容（不要“好的/以下是/说明”等）
- **绝对禁止** markdown 代码块（不要用 \`\`\`html 包裹）
- 必须输出完整文档：以 \`<!DOCTYPE html>\` 开头，包含 \`<html>\`、\`<head>\`、\`<body>\`
- 样式必须自包含：用 \`<style>\` 内联（不要依赖 Tailwind、不要外链 CSS）
- 内容中文；响应式；语义化标签：\`<header>\` \`<main>\` \`<section>\` \`<footer>\`
- 页面按模块划分：每个模块一个 \`<section id=\"...\"></section>\`；导航仅用页内锚点跳转（\`href=\"#...\"\`），**禁止** Tab、多页面、路由
- 图标与插画：优先内联 SVG / CSS 渐变 / 纯形状，**禁止**外链图片资源（避免导出图片时跨域污染）
- 必须包含：导航、Hero、至少 2 个核心模块（卖点/场景/案例/FAQ/价格/保障等）、页脚 CTA

输出完整单文件 HTML。`;

module.exports = async function runFrontendEngineer(ctx) {
  const { merged } = ctx;
  const upstreamText = extractUpstreamText(merged).trim();

  const userText = upstreamText
    ? upstreamText
    : '请生成一个通用企业落地页风格的静态单页 HTML（自包含），包含导航、Hero、核心卖点、社会证明、FAQ、页脚CTA。';

  const result = await runWithAIStream('frontend-engineer', ctx, SYSTEM_PROMPT, userText, {
    maxTokens: 16384,
    _resultType: 'html-page',
  });

  if (result.success && result.data?.text) {
    const html = normalizeHtmlDoc(result.data.text);
    if (!looksLikeHtmlDoc(html)) {
      return {
        success: false,
        data: { text: '', _resultType: 'html-page' },
        summary: '模型未返回可解析的 HTML 文档（需以 <!DOCTYPE html> 或 <html> 开头），请重试该步骤',
        status: 'error',
      };
    }

    result.data.text = html;
    result.data._resultType = 'html-page';
    result.summary = `落地页已生成（${html.length} 字符，可预览与导出）`;
  }

  return result;
};

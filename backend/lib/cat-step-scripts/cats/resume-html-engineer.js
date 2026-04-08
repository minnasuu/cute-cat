'use strict';

const { runWithAIStream, extractUpstreamText, resolveSystemPrompt } = require('../_framework');

function stripMarkdownFences(text) {
  let t = String(text || '').trim();
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

function injectHeadStyle(html, cssText) {
  const css = String(cssText || '').trim();
  if (!css) return html;
  if (html.includes('id="cuca-export-constraints"')) return html;
  const styleTag = `\n<style id="cuca-export-constraints">\n${css}\n</style>\n`;
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${styleTag}</head>`);
  if (/<body\b/i.test(html)) return html.replace(/<body\b[^>]*>/i, (m) => `${m}\n${styleTag}`);
  return html + styleTag;
}

const SYSTEM_PROMPT = `你是 CuCaTopia 官方工作台猫猫「砚线」，岗位角色：排版工程师。
你的任务：把上游内容渲染成一个可直接打开的单文件 HTML 简历。

## 🚨最高优先级：只输出 HTML 源码
- 回复必须只包含 HTML 文档本身，不要任何解释/前言/总结
- 绝对禁止 markdown 代码块（不要用 \`\`\`html 包裹）
- 必须输出完整文档：以 <!DOCTYPE html> 开头，并包含 <html><head><body>

## 版式与导出要求（必须遵守）
- 一页 A4 简历风格：黑白极简（允许非常克制的灰阶）
- 使用内联 <style>，禁止外链 CSS / 字体 / 图片
- 必须支持“导出 PDF”：写好打印样式\n  - @page { size: A4; margin: 14mm; }\n  - @media print：隐藏不必要元素，避免分页断裂\n  - 使用 -webkit-print-color-adjust: exact; print-color-adjust: exact;
- 内容必须可编辑：尽量用语义标签（h1/h2/p/ul/li 等），让上层编辑器可 contenteditable
- 必须有头像位：在右上角或左上角放一张 <img>（src 用内联 data: 或占位符均可；但禁止外链）
  - 建议使用一个 1x1 透明像素 dataURL 作为默认 src，方便用户在预览中点击替换

## 输入说明
- 上游通常包含结构化的 Markdown 简历内容（# 与 ## 标题 + 列表）。
- 上游也可能包含一段「视觉风格：...」的设计提示词（来自视觉设计师），你应在不破坏“黑白极简、一页A4”的前提下，吸收其中关于字体、留白、分割线、强调色（可用极浅灰）等建议。
`;

const TRANSPARENT_PIXEL =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

module.exports = async function runResumeHtmlEngineer(ctx) {
  const { merged } = ctx;
  const upstreamText = extractUpstreamText(merged).trim();

  const userText = upstreamText
    ? upstreamText
    : '# 简历内容\n\n## 基本信息\n- 姓名：〔待填写〕\n- 手机号：〔待填写〕\n- 邮箱：〔待填写〕\n- 城市：〔待填写〕\n- 求职意向：〔待填写〕\n\n## 个人摘要\n- 〔要点〕\n\n## 核心技能\n- 〔要点〕\n\n## 工作经历\n- 〔公司 / 岗位 / 时间〕：〔要点〕\n\n## 项目经历\n- 〔项目〕：〔要点〕\n\n## 教育背景\n- 〔学校 / 专业 / 时间〕';

  const result = await runWithAIStream('resume-html-engineer', ctx, resolveSystemPrompt(SYSTEM_PROMPT, ctx), userText, {
    maxTokens: 16384,
    _resultType: 'html-page',
  });

  if (result.success && result.data?.text) {
    let html = normalizeHtmlDoc(result.data.text);
    if (!looksLikeHtmlDoc(html)) {
      return {
        success: false,
        data: { text: '', _resultType: 'html-page' },
        summary: '模型未返回可解析的 HTML 文档（需以 <!DOCTYPE html> 或 <html> 开头），请重试该步骤',
        status: 'error',
      };
    }

    // 强制约束：无背景、宽度 100%、A4 比例（screen 预览），避免生成“带底色画布”
    html = injectHeadStyle(
      html,
      [
        'html, body { background: transparent !important; }',
        'body { margin: 0; width: 100%; }',
        '@media screen { body { aspect-ratio: 210 / 297; } }',
      ].join('\n'),
    );

    // 兜底：若模型忘了放头像 img，则在 head 里标记一个默认占位（不改布局，只提供资源给后续替换）
    if (!/<img\b/i.test(html)) {
      html = html.replace(
        /<body\b[^>]*>/i,
        (m) =>
          `${m}\n<img alt="头像" src="${TRANSPARENT_PIXEL}" style="display:none" />`,
      );
    }

    result.data.text = html;
    result.data._resultType = 'html-page';
    result.summary = `简历已生成（${html.length} 字符，可编辑并导出 PDF）`;
  }

  return result;
};


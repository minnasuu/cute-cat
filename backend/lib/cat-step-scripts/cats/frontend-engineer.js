'use strict';

const { runWithAIStream, extractUpstreamText, resolveSystemPrompt } = require('../_framework');

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

function extractVisualAndNeed(text) {
  const s = String(text || '');
  const visIdx = s.indexOf('视觉风格：');
  const needIdx = s.indexOf('用户需求：');
  if (visIdx < 0 && needIdx < 0) return null;
  const visual = visIdx >= 0
    ? s.slice(visIdx + '视觉风格：'.length, needIdx >= 0 ? needIdx : undefined).trim()
    : '';
  const need = needIdx >= 0 ? s.slice(needIdx + '用户需求：'.length).trim() : '';
  return { visual, need };
}

function tryParseJsonObject(text) {
  try {
    const v = JSON.parse(String(text || '').trim());
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    return v;
  } catch {
    return null;
  }
}

function splitHtmlCandidates(text) {
  const s = String(text || '').trim();
  const idxs = [];
  const re = /<!DOCTYPE\s+html>/gi;
  let m;
  while ((m = re.exec(s))) idxs.push(m.index);
  if (idxs.length <= 1) return null;
  const parts = [];
  for (let i = 0; i < idxs.length; i++) {
    const start = idxs[i];
    const end = i + 1 < idxs.length ? idxs[i + 1] : s.length;
    const html = s.slice(start, end).trim();
    if (html) parts.push(html);
  }
  return parts.length > 1 ? parts : null;
}

function containsExternalResources(html) {
  const s = String(html || '');
  // hard block common external resource usage
  if (/\bsrc\s*=\s*["']https?:\/\//i.test(s)) return true;
  if (/\bhref\s*=\s*["']https?:\/\//i.test(s)) return true;
  if (/@import\s+url\(\s*["']?https?:\/\//i.test(s)) return true;
  return false;
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

  // 优先：视觉步骤若已输出结构化 payload（landing-visual-v2 / v1），直接消费
  const visualPayload = tryParseJsonObject(upstreamText);
  const landingVisual =
    visualPayload && (visualPayload.kind === 'landing-visual-v2' || visualPayload.kind === 'landing-visual-v1')
      ? visualPayload
      : null;

  const parsed = extractVisualAndNeed(upstreamText);
  const userText = upstreamText
    ? (landingVisual
        ? [
            '请生成 1 份“完整落地页”单文件 HTML（只输出 HTML，不要解释）。',
            '输出格式要求：',
            '- 必须从 `<!DOCTYPE html>` 开始，到 `</html>` 结束。',
            '- 禁止输出标题/注释/Markdown/说明文字。',
            '',
            // v2 三段结构：用户需求 / 匹配风格 / 通用prompt（可为空）
            landingVisual.kind === 'landing-visual-v2'
              ? [
                  '【用户需求】',
                  String(landingVisual.userNeed || '').trim() || '（无）',
                  '',
                  '【匹配的视觉风格（vibe-style-lib）】',
                  landingVisual.matchedStyle
                    ? `id: ${landingVisual.matchedStyle.id || ''}\n` +
                      (Array.isArray(landingVisual.matchedStyle.tags) && landingVisual.matchedStyle.tags.length
                        ? `tags: ${landingVisual.matchedStyle.tags.join('、')}\n`
                        : '') +
                      (landingVisual.matchedStyle.summary ? `summary: ${landingVisual.matchedStyle.summary}\n` : '') +
                      (landingVisual.matchedStyle.designPrompt ? `designPrompt: ${landingVisual.matchedStyle.designPrompt}` : '')
                    : '（无）',
                  '',
                  '【通用视觉prompt（可为空）】',
                  String(landingVisual.genericVisualPrompt || '').trim() || '（空）',
                  '',
                ].join('\n')
              : '',
            '【内容模型（JSON）】',
            JSON.stringify(landingVisual.contentModel || {}, null, 2),
            '',
            '【交互说明（可选）】',
            String(landingVisual.uxNotes || '').trim() || '（无）',
            '',
            '【视觉风格提示词】',
            String(landingVisual.visualPrompt || '').trim() || '（无）',
            '',
            '【设计 tokens（可控变体）】',
            JSON.stringify(landingVisual.designTokens || {}, null, 2),
          ].filter(Boolean).join('\n')
        : (parsed
            ? [
                '请严格按以下信息生成单文件 HTML（只输出 HTML）：',
                '',
                '【视觉风格提示词】',
                parsed.visual || '（无）',
                '',
                '【用户需求】',
                parsed.need || '（无）',
              ].join('\n')
            : upstreamText))
    : '请生成一个通用企业落地页风格的静态单页 HTML（自包含），包含导航、Hero、核心卖点、社会证明、FAQ、页脚CTA。';

  const systemPrompt = resolveSystemPrompt(SYSTEM_PROMPT, ctx);
  const result = await runWithAIStream('frontend-engineer', ctx, systemPrompt, userText, {
    maxTokens: 16384,
    _resultType: 'html-page',
  });

  if (result.success && result.data?.text) {
    const rawOut = String(result.data.text || '');
    const multi = splitHtmlCandidates(rawOut);
    // 默认只生成 1 份：若模型意外输出了多份 HTML，则取第一份
    if (multi && multi.length >= 2) {
      const first = normalizeHtmlDoc(multi[0]);
      if (looksLikeHtmlDoc(first)) {
        // 继续走下方通用约束（外链校验、注入样式等）
        result.data.text = first;
      }
    }

    // 若上面已把 result.data.text 置为第一份 HTML，这里优先用它
    let html = normalizeHtmlDoc(result.data.text || rawOut);
    if (!looksLikeHtmlDoc(html)) {
      // 自动“强约束”重试一次：当模型输出了说明/要点但没给 HTML 时，常见于被上游长文带偏或没遵守格式约束
      const retrySystemPrompt = `${systemPrompt}

## 🚨格式纠错（最高优先级）
你上一轮没有输出合法 HTML。现在你必须严格只输出完整 HTML 文档：
- 第一行必须是 <!DOCTYPE html>
- 最后一行必须是 </html>
- 禁止任何解释、前言、总结、列表、Markdown
- 必须自包含（<style> 内联），禁止外链资源`;

      const retryUserText = parsed
        ? [
            '请基于以下信息重新生成，并严格只输出 HTML：',
            '',
            '【视觉风格提示词】',
            parsed.visual || '（无）',
            '',
            '【用户需求】',
            parsed.need || '（无）',
          ].join('\n')
        : userText;

      const retry = await runWithAIStream('frontend-engineer', ctx, retrySystemPrompt, retryUserText, {
        maxTokens: 16384,
        _resultType: 'html-page',
      });

      if (!retry.success || !retry.data?.text) {
        return {
          success: false,
          data: { text: '', _resultType: 'html-page' },
          summary: '模型未返回可解析的 HTML 文档（需以 <!DOCTYPE html> 或 <html> 开头），请重试该步骤',
          status: 'error',
        };
      }

      html = normalizeHtmlDoc(retry.data.text);
      if (!looksLikeHtmlDoc(html)) {
        return {
          success: false,
          data: { text: '', _resultType: 'html-page' },
          summary: '模型未返回可解析的 HTML 文档（需以 <!DOCTYPE html> 或 <html> 开头），请重试该步骤',
          status: 'error',
        };
      }

      // 将重试结果回写到 result（保持 workflow-executor 的数据结构不变）
      result.data.text = html;
    }

    // 规则校验：禁止外链资源（截图/导出稳定性）
    if (containsExternalResources(html)) {
      const retrySystemPrompt = `${systemPrompt}

## 🚨资源纠错（最高优先级）
你上一轮包含了外链资源（http/https）。现在你必须：
- 禁止任何外链图片/CSS/字体/脚本
- 图标与装饰只能用内联 SVG / CSS 渐变 / 纯形状
- 仍然只输出完整 HTML（<!DOCTYPE html> ... </html>）`;

      const retry = await runWithAIStream('frontend-engineer', ctx, retrySystemPrompt, userText, {
        maxTokens: 16384,
        _resultType: 'html-page',
      });
      if (retry.success && retry.data?.text) {
        const next = normalizeHtmlDoc(retry.data.text);
        if (looksLikeHtmlDoc(next) && !containsExternalResources(next)) {
          html = next;
          result.data.text = html;
        }
      }
    }

    // 强制约束：无背景、宽度 100%，便于导出/截图时保持透明画布
    html = injectHeadStyle(
      html,
      ['html, body { background: transparent !important; }', 'body { margin: 0; width: 100%; }'].join(
        '\n',
      ),
    );

    result.data.text = html;
    result.data._resultType = 'html-page';
    result.summary = `落地页已生成（${html.length} 字符，可预览与导出）`;
  }

  return result;
};

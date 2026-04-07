'use strict';

const { runWithAI, extractUpstreamText } = require('../_framework');

const SYSTEM_PROMPT = `你是 CuCaTopia 官方工作台猫猫「琥珀」，岗位角色：前端工程师。
你的任务是根据上游输入生成一个完整可运行的 HTML 单页网站。

上游 user 消息**通常仅为上一步视觉设计师输出的设计规范/提示词**（色板、字体、组件气质等），**不一定**包含产品架构 JSON。你必须仅凭该设计说明，自行推断合理的单页信息结构与模块划分（如 Hero、功能亮点、数据展示、CTA、页脚等），并产出完整页面。

## 🚨🚨🚨 最高优先级规则：只输出 HTML 代码 🚨🚨🚨

你的回复必须**只包含 HTML 代码本身**，不允许包含任何其他内容：
- 回复的第一个字符必须是 \`<\`（即 \`<!DOCTYPE html>\` 的开头）
- 回复的最后一个字符必须是 \`>\`（即 \`</html>\` 的结尾）
- **绝对禁止**在 HTML 代码前面写任何文字
- **绝对禁止**在 HTML 代码后面写任何文字
- **绝对禁止**使用 markdown 代码块包裹
- **绝对禁止**输出任何非 HTML 的解释、说明、总结

## 🚨 禁止元对话与内容评判

- **绝对禁止**以聊天口吻开场、评价用户输入来源、或让用户「选 1/2/3」。
- **绝对禁止**输出 Markdown 列表、选项等非 HTML 内容。
- 无论上游长短，**直接生成**完整单页 HTML；信息不足时用占位文案与占位图。

## 输出格式要求

1. **直接输出纯 HTML 代码**，以 <!DOCTYPE html> 开头，以 </html> 结尾
2. HTML 必须包含完整的 <head>（含 meta charset, viewport, title）和 <body>
3. 所有 CSS 必须内联在 <style> 标签中（不引用外部 CSS 文件）
4. 可以使用 Tailwind CSS CDN（推荐）或 Google Fonts CDN
5. 页面必须是响应式的（支持移动端）
6. 使用语义化 HTML 标签（header, nav, main, section, footer）
7. 中文内容，代码注释用中文
8. 严格遵循上游视觉说明中的配色、字体和组件气质

生成美观、专业、可直接在浏览器中打开的完整网页。`;

module.exports = async function runFrontendEngineer(ctx) {
  const { merged } = ctx;
  const upstreamText = extractUpstreamText(merged).trim();

  const userText = upstreamText
    ? upstreamText
    : '请生成一个通用企业官网的 HTML 页面。直接输出 HTML 代码。';

  const result = await runWithAI('frontend-engineer', ctx, SYSTEM_PROMPT, userText, {
    maxTokens: 16384,
    _resultType: 'html-page',
  });

  if (result.success && result.data?.text) {
    let html = result.data.text.trim();
    const codeMatch = html.match(/```(?:html|HTML)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (codeMatch) html = codeMatch[1].trim();
    const docIdx = html.indexOf('<!DOCTYPE');
    const docLowerIdx = html.indexOf('<!doctype');
    const htmlTagIdx = html.indexOf('<html');
    const startIdx = Math.min(
      docIdx >= 0 ? docIdx : Infinity,
      docLowerIdx >= 0 ? docLowerIdx : Infinity,
      htmlTagIdx >= 0 ? htmlTagIdx : Infinity,
    );
    if (startIdx < Infinity && startIdx > 0) html = html.substring(startIdx);
    const closingHtmlIdx = html.lastIndexOf('</html>');
    if (closingHtmlIdx >= 0) html = html.substring(0, closingHtmlIdx + '</html>'.length);
    html = html.trim();
    const hasHtmlShell = /<html[\s>]/i.test(html) && /<\/html>/i.test(html);
    if (!hasHtmlShell) {
      return {
        success: false,
        data: { text: '', _resultType: 'html-page' },
        summary: '模型未返回可解析的完整 HTML，请重试该步骤',
        status: 'error',
      };
    }
    result.data.text = html;
    result.data._resultType = 'html-page';
    result.summary = `HTML 页面已生成（${html.length} 字符）`;
  }

  return result;
};

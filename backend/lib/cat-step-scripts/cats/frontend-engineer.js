'use strict';

const { runWithAI, extractUpstreamText } = require('../_framework');

const SYSTEM_PROMPT = `你是 CuCaTopia 官方工作台猫猫「琥珀」，岗位角色：前端工程师。
你的任务是综合前面产品策划、交互设计师、视觉设计师三个步骤的输出，生成一个完整可运行的 HTML 单页网站。

## 输出要求（极其重要，必须严格遵守）

1. **直接输出纯 HTML 代码**，以 <!DOCTYPE html> 开头，以 </html> 结尾
2. **禁止**使用 markdown 代码块包裹（不要写 \`\`\`html）
3. **禁止**在 HTML 之前或之后添加任何解释文字
4. HTML 必须包含完整的 <head>（含 meta charset, viewport, title）和 <body>
5. 所有 CSS 必须内联在 <style> 标签中（不引用外部 CSS 文件）
6. 可以使用 Google Fonts CDN（通过 <link> 引入）
7. 页面必须是响应式的（支持移动端）
8. 使用语义化 HTML 标签（header, nav, main, section, footer）
9. 中文内容，代码注释用中文
10. 页面应包含上游架构中定义的所有核心模块
11. 严格遵循上游视觉设计师给出的配色、字体和组件风格

生成美观、专业、可直接在浏览器中打开的完整网页。`;

module.exports = async function runFrontendEngineer(ctx) {
  const { merged } = ctx;
  const upstreamText = extractUpstreamText(merged);

  // 尝试收集所有上游步骤的内容
  const parts = [];
  if (merged?.text) parts.push(String(merged.text));
  if (merged?.summary && merged.summary !== merged?.text) parts.push(String(merged.summary));

  const userText = parts.length > 0
    ? `以下是前面三个步骤（产品架构、交互设计、视觉设计）的输出汇总：\n\n${parts.join('\n\n---\n\n')}\n\n请根据以上信息生成完整的 HTML 页面。记住：直接输出 HTML 代码，不要用 markdown 包裹。`
    : upstreamText
      ? `以下是上游设计信息：\n\n${upstreamText}\n\n请生成完整的 HTML 页面。直接输出 HTML 代码。`
      : '请生成一个通用企业官网的 HTML 页面。直接输出 HTML 代码。';

  const result = await runWithAI('frontend-engineer', ctx, SYSTEM_PROMPT, userText, {
    maxTokens: 8192,
    _resultType: 'html-page',
  });

  // 清理可能的 markdown 包裹
  if (result.success && result.data?.text) {
    let html = result.data.text.trim();
    const codeMatch = html.match(/```(?:html)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (codeMatch) html = codeMatch[1].trim();
    // 确保以 <!DOCTYPE 或 <html 开头
    const docIdx = html.indexOf('<!DOCTYPE');
    const htmlIdx = html.indexOf('<html');
    const startIdx = Math.min(
      docIdx >= 0 ? docIdx : Infinity,
      htmlIdx >= 0 ? htmlIdx : Infinity
    );
    if (startIdx < Infinity && startIdx > 0) {
      html = html.substring(startIdx);
    }
    result.data.text = html;
    result.data._resultType = 'html-page';
    result.summary = `HTML 页面已生成（${html.length} 字符）`;
  }

  return result;
};

'use strict';

const { runWithAI, extractUpstreamText } = require('../_framework');

// 与前端 frontend/src/agents/product-architect.ts 对齐：脑图 JSON 数组树
const SYSTEM_PROMPT = `你是产品架构师，将用户输入需求转化为产品架构脑图的 JSON 树。

## 🚨🚨🚨 最高优先级规则：只输出 JSON 🚨🚨🚨

你的回复必须**只包含 JSON 数组本身**，不允许包含任何其他内容：
- 回复的第一个字符必须是 \`[\`
- 回复的最后一个字符必须是 \`]\`
- **绝对禁止**在 JSON 前面写任何文字（包括"好的"、"以下是"、"根据需求"、"您好"等）
- **绝对禁止**在 JSON 后面写任何文字（包括"希望满意"、"如需修改"等）
- **绝对禁止**使用 markdown 代码块 \`\`\`json ... \`\`\` 包裹
- **绝对禁止**输出任何非 JSON 的解释、说明、总结、注释

## 🚨 禁止追问与澄清（与「只输出 JSON」同等重要）

- **绝对禁止**向用户提问、索要补充信息、列举「您可能指的是 A/B/C」、或输出任何对话式引导（例如「请问您具体指的是」「为了更准确地帮助您」「您可以参考以下几种」）。
- 即使用户只给了一个词、短语或行业名（如「广告官网」「电商后台」「SaaS」），也**必须**立刻基于**最常见、最合理的产品形态**推断并输出完整 JSON 树，不得因「表述宽泛」而拒绝结构化输出。
- 信息不足时：用通用模块名覆盖典型用户路径（数据看板、列表管理、设置与报告等），**不要**用文字说明「假设」或「待确认」。

正确示例（你应该这样输出）：
[{"id":"1","title":"首页","children":[{"id":"1-1","title":"推荐内容"}]}]

## 通用规则

- 一级节点：多页面表示底部/顶部 Tab 栏、单页面则表示独立模块（3~5 个，每个是功能聚合体）
- 最多 3 层，一级节点 ≤ 5 个，尽量将相似功能聚合到尽量少的模块中
- 用户视角命名，禁用技术词汇，节点标题 ≤ 8 字
- 包含完整用户路径（浏览→决策→行动→结果）
- 行业/场景类简述（如广告、投放、营销）：默认按**广告主或运营侧使用的 Web 产品/后台**来拆模块（数据概览、计划/素材管理、受众与转化、报表导出等），而非列举第三方平台或监管机构

## 输出格式

- 仅返回纯 JSON 数组，以 [ 开头 ] 结尾
- 禁止 markdown、代码块、注释、说明文字
- 节点字段：id（如"1","1-1"）、title、children（可选）`;

module.exports = async function runProductArchitect(ctx) {
  const { merged } = ctx;
  const userText = extractUpstreamText(merged).trim() || '请根据需求生成产品信息架构（JSON 树）';

  const result = await runWithAI('product-architect', ctx, SYSTEM_PROMPT, userText, {
    maxTokens: 8192,
  });

  if (result.success && result.data?.text) {
    let text = result.data.text.trim();
    const codeMatch = text.match(/```(?:json|JSON)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (codeMatch) text = codeMatch[1].trim();
    const bracketStart = text.indexOf('[');
    if (bracketStart > 0) text = text.substring(bracketStart);
    const bracketEnd = text.lastIndexOf(']');
    if (bracketEnd >= 0) text = text.substring(0, bracketEnd + 1);
    try {
      JSON.parse(text);
    } catch {
      const fixed = text.replace(/,\s*([\]}])/g, '$1');
      try {
        JSON.parse(fixed);
        text = fixed;
      } catch { /* keep */ }
    }
    text = text.trim();
    result.data.text = text;
    result.summary = `产品架构已生成（${text.length} 字符）`;
  }

  return result;
};

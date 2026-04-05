import type { AgentContext, AgentResult } from './types';
import { runWithAI } from './_framework';

const SYSTEM_PROMPT = `你是产品架构师，将用户输入需求转化为产品架构脑图的 JSON 树。

## 🚨🚨🚨 最高优先级规则：只输出 JSON 🚨🚨🚨

你的回复必须**只包含 JSON 数组本身**，不允许包含任何其他内容：
- 回复的第一个字符必须是 \`[\`
- 回复的最后一个字符必须是 \`]\`
- **绝对禁止**在 JSON 前面写任何文字（包括"好的"、"以下是"、"根据需求"等）
- **绝对禁止**在 JSON 后面写任何文字（包括"希望满意"、"如需修改"等）
- **绝对禁止**使用 markdown 代码块 \`\`\`json ... \`\`\` 包裹
- **绝对禁止**输出任何非 JSON 的解释、说明、总结、注释

正确示例（你应该这样输出）：
[{"id":"1","title":"首页","children":[{"id":"1-1","title":"推荐内容"}]}]

## 通用规则

- 一级节点：多页面表示底部/顶部 Tab 栏、单页面则表示独立模块（3~5 个，每个是功能聚合体）
- 最多 3 层，一级节点 ≤ 5 个，尽量将相似功能聚合到尽量少的模块中
- 用户视角命名，禁用技术词汇，节点标题 ≤ 8 字
- 包含完整用户路径（浏览→决策→行动→结果）

## 输出格式

- 仅返回纯 JSON 数组，以 [ 开头 ] 结尾
- 禁止 markdown、代码块、注释、说明文字
- 节点字段：id（如"1","1-1"）、title、children（可选）`;

export default async function runProductArchitect(ctx: AgentContext): Promise<AgentResult> {
  const result = await runWithAI('product-architect', ctx, SYSTEM_PROMPT, {
    onChunk: ctx.onChunk,
  });

  // 多重清理：确保最终结果只包含纯 JSON 数组
  if (result.success && result.data) {
    let text = result.data.text.trim();

    // 1. 去除 markdown 代码块包裹（支持 ```json、```JSON、``` 等）
    const codeMatch = text.match(/```(?:json|JSON)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (codeMatch) text = codeMatch[1].trim();

    // 2. 截取从第一个 [ 开始的内容（去除 AI 前缀废话）
    const bracketStart = text.indexOf('[');
    if (bracketStart > 0) {
      text = text.substring(bracketStart);
    }

    // 3. 截断最后一个 ] 之后的所有内容（去除 AI 后缀废话）
    const bracketEnd = text.lastIndexOf(']');
    if (bracketEnd >= 0) {
      text = text.substring(0, bracketEnd + 1);
    }

    // 4. 验证 JSON 合法性，如果解析失败则保留清理后的文本
    try {
      JSON.parse(text);
    } catch {
      // JSON 不合法，尝试进一步修复常见问题（如末尾多余逗号）
      const fixed = text.replace(/,\s*([\]}])/g, '$1');
      try {
        JSON.parse(fixed);
        text = fixed;
      } catch {
        // 修复失败，保留原文本
      }
    }

    text = text.trim();
    result.data.text = text;
    result.summary = `产品架构已生成（${text.length} 字符）`;
  }

  return result;
}

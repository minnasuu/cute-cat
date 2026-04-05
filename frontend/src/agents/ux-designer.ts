import type { AgentContext, AgentResult } from './types';
import { runWithAI } from './_framework';

const SYSTEM_PROMPT = `你是世界顶尖的交互设计师。
你的任务是基于上游产品策划输出的网站信息架构（JSON），补充完整的交互链路设计。

## 🚨🚨🚨 最高优先级规则：只输出交互设计文档内容 🚨🚨🚨

你的回复必须**只包含 Markdown 格式的交互设计文档本身**：
- 直接以第一个标题（如 \`# 交互设计\` 或 \`## 核心用户路径\`）开头
- **绝对禁止**在文档前面写任何寒暄（包括"好的"、"以下是"、"根据你的需求"等）
- **绝对禁止**在文档后面写任何总结（包括"希望满意"、"如需调整"等）
- **绝对禁止**使用 markdown 代码块 \`\`\`markdown ... \`\`\` 包裹整个输出
- 只输出设计内容本身，不要输出任何与设计无关的话

## 输出要求（Markdown 格式）

1. **核心用户路径**
2. **页面间跳转关系**：用箭头描述关键页面间的导航逻辑
3. **组件级交互说明**：每个关键页面的重要交互组件（导航栏、表单、CTA按钮等）的行为描述
4. **空态与加载**：关键页面的空态文案建议和加载状态设计
5. **响应式策略**：简述移动端适配要点

用简洁清晰的中文输出 Markdown，结构化呈现。`;

export default async function runUxDesigner(ctx: AgentContext): Promise<AgentResult> {
  const result = await runWithAI('ux-designer', ctx, SYSTEM_PROMPT, {
    maxTokens: 8192,
    onChunk: ctx.onChunk,
  });

  // 清理：确保最终结果只包含设计文档内容
  if (result.success && result.data) {
    let text = result.data.text.trim();

    // 1. 去除 markdown 代码块包裹
    const codeMatch = text.match(/```(?:markdown|md)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (codeMatch) text = codeMatch[1].trim();

    // 2. 去除前缀废话：截取从第一个 # 标题开始
    const headingIdx = text.search(/^#{1,3}\s/m);
    if (headingIdx > 0) {
      text = text.substring(headingIdx);
    }

    // 3. 去除后缀废话：如果末尾有明显的客套话，截断
    text = text.replace(/\n{2,}(?:---\n*)?(?:希望|如果你|如需|以上|如有|请随时|祝|期待)[\s\S]*$/m, '');

    text = text.trim();
    result.data.text = text;
    result.summary = text.length > 300 ? text.slice(0, 300) + '…' : text;
  }

  return result;
}

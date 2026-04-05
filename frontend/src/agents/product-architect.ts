import type { AgentContext, AgentResult } from './types';
import { runWithAI } from './_framework';

const SYSTEM_PROMPT = `你是产品架构师，将用户输入需求转化为产品架构脑图的 JSON 树。
通用规则：
- 一级节点：多页面表示底部/顶部 Tab 栏、单页面则表示独立模块（3~5 个，每个是功能聚合体）
- 最多 3 层，一级节点 ≤ 5 个，尽量将相似功能聚合到尽量少的模块中
- 用户视角命名，禁用技术词汇，节点标题 ≤ 8 字
- 包含完整用户路径（浏览→决策→行动→结果）

输出格式：
- 仅返回纯 JSON 数组，以 [ 开头 ] 结尾
- 禁止 markdown、代码块、注释、说明文字
- 节点字段：id（如"1","1-1"）、title、children（可选）`;

export default async function runProductArchitect(ctx: AgentContext): Promise<AgentResult> {
  const result = await runWithAI('product-architect', ctx, SYSTEM_PROMPT);

  // 清理 markdown 包裹
  if (result.success && result.data) {
    let text = result.data.text.trim();
    const codeMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (codeMatch) text = codeMatch[1].trim();
    result.data.text = text;
    result.summary = `产品架构已生成（${text.length} 字符）`;
  }

  return result;
}

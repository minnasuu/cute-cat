import type { SkillContext, SkillResult } from '../types';
import { runWithAI } from './_framework';

const SYSTEM_PROMPT = `你是世界顶尖的交互设计师。
你的任务是基于上游产品策划输出的网站信息架构（JSON），补充完整的交互链路设计。

输出要求（Markdown 格式）：
1. **核心用户路径**
2. **页面间跳转关系**：用箭头描述关键页面间的导航逻辑
3. **组件级交互说明**：每个关键页面的重要交互组件（导航栏、表单、CTA按钮等）的行为描述
4. **空态与加载**：关键页面的空态文案建议和加载状态设计
5. **响应式策略**：简述移动端适配要点

用简洁清晰的中文输出 Markdown，结构化呈现。`;

export default async function runUxDesigner(ctx: SkillContext): Promise<SkillResult> {
  return runWithAI('ux-designer', ctx, SYSTEM_PROMPT);
}

'use strict';

const { runWithAI, extractUpstreamText } = require('../_framework');
const { getStyleCatalog } = require('../visual-prompt-library');

const SYSTEM_PROMPT = `你是 CuCaTopia 官方工作台猫猫「墨墨」，岗位角色：视觉设计师。
你的任务是根据上游的产品架构和交互设计内容，从预定义的视觉风格库中选择最匹配的风格，并输出完整的视觉设计指引。

## 视觉风格库

${getStyleCatalog()}

## 输出要求

1. 先分析上游内容的行业属性、目标受众和产品气质
2. 从上方风格库中选择 1 个最匹配的风格（说明选择理由）
3. 基于选中的风格，输出完整的视觉 prompt（可在库中定义基础上微调）：
   - 主色 / 辅色 / 强调色（含色值）
   - 字体选择与层级
   - 圆角与间距规范
   - 组件风格关键词
   - 整体气质描述
4. 如有需要，可融合两种风格的元素，但需说明原因

用中文输出，结构清晰，便于前端工程师直接引用实现。`;

module.exports = async function runVisualDesigner(ctx) {
  const { merged } = ctx;
  const upstreamText = extractUpstreamText(merged);

  const userText = upstreamText
    ? `以下是上游输出的产品架构与交互设计内容：\n\n${upstreamText}\n\n请匹配最合适的视觉风格并输出设计指引。`
    : '请为一个通用企业官网选择合适的视觉风格。';

  return runWithAI('visual-designer', ctx, SYSTEM_PROMPT, userText, {
    maxTokens: 4096,
  });
};

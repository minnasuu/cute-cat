'use strict';

const { runWithAI, extractUpstreamText, resolveSystemPrompt } = require('../_framework');

const SYSTEM_PROMPT = `你是 CuCaTopia 官方工作台猫猫「咪咪」，岗位角色：品牌运营（运营专家）。
你的任务：用户给一个主题/活动/产品，你要为“海报制作”输出一份清晰的品牌运营拆解 Brief，供下游文案与视觉执行。

## 输出要求（只输出 Markdown，不要废话）
- 第一行必须是：# 海报Brief
- 必须包含以下二级标题（顺序固定）：\n## 主题\n## 受众\n## 目的\n## 情绪\n## 关键词\n## 约束
- 每个小节尽量短（1-4 行），关键词用逗号分隔
- 约束必须包含：一屏海报、移动端优先、可编辑（文本/图片）、避免外链图片

## 质量标准
- 受众要具体（年龄/场景/动机）
- 目的要可衡量（引导关注/报名/下单等）
- 情绪用 2-4 个词（如：克制、热血、温暖、科技感）
`;

module.exports = async function runBrandOpsBrief(ctx) {
  const upstream = extractUpstreamText(ctx.merged).trim();
  const userText = upstream || '请为一个通用活动主题输出海报 Brief。';
  return runWithAI('recorder-log', ctx, resolveSystemPrompt(SYSTEM_PROMPT, ctx), userText, {
    maxTokens: 2048,
  });
};


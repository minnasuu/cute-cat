'use strict';

const { runWithAI, extractUpstreamText } = require('../_framework');
const { VISUAL_STYLES, getStyleCatalog } = require('../visual-prompt-library');

const SYSTEM_PROMPT = `你是 CuCaTopia 官方工作台猫猫「墨墨」，岗位角色：视觉设计师。
你的任务是根据上游的产品架构和交互设计内容，从预定义的视觉风格库中选择最匹配的风格。

## 视觉风格库

${getStyleCatalog()}

## 输出要求

1. 先分析上游内容的行业属性、目标受众和产品气质
2. 从上方风格库中选择 1 个最匹配的风格（说明选择理由）
3. **只需输出风格编号（如"风格 1"）和选择理由，不要输出完整的设计规范**

用中文输出，简洁明了。格式示例：
选择：风格 3
理由：该风格的现代简约设计与产品的轻量化定位高度契合...`;

module.exports = async function runVisualDesigner(ctx) {
  const { merged } = ctx;
  let upstreamText = extractUpstreamText(merged);

  // 限制上游文本长度，避免加上风格库后 prompt 总量过大导致 AI 调用超时
  if (upstreamText.length > 3000) {
    upstreamText = upstreamText.slice(0, 3000) + '\n\n…（内容过长已截断）';
  }

  const userText = upstreamText
    ? `以下是上游输出的产品架构与交互设计内容：\n\n${upstreamText}\n\n请匹配最合适的视觉风格并输出设计指引。`
    : '请为一个通用企业官网选择合适的视觉风格。';

  const result = await runWithAI('visual-designer', ctx, SYSTEM_PROMPT, userText, {
    maxTokens: 4096,
  });

  // AI 只返回风格编号+理由，这里解析编号并拼接完整视觉定义
  if (result.success && result.data?.text) {
    const aiResponse = result.data.text;
    const styleMatch = aiResponse.match(/风格\s*(\d+)/);
    let selectedIndex = styleMatch ? parseInt(styleMatch[1], 10) - 1 : 0;
    if (selectedIndex < 0 || selectedIndex >= VISUAL_STYLES.length) {
      console.warn(`[visual-designer] AI 返回的风格编号无效: ${styleMatch?.[1]}, 默认使用第一个`);
      selectedIndex = 0;
    }
    const selected = VISUAL_STYLES[selectedIndex];

    result.data.text = `${aiResponse}\n\n---\n\n## 完整视觉设计规范\n\n**${selected.name}** (${selected.id})\n\n${selected.prompt}`;
    result.summary = result.data.text.length > 300
      ? result.data.text.slice(0, 300) + '…'
      : result.data.text;
  }

  return result;
};

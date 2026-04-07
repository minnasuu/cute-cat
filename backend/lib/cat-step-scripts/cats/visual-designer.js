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

/** 与 frontend visual-designer.ts 一致：视觉风格 = 库内 prompt；用户需求 = 上游 */
function formatVisualDesignerOutput(upstream, visualPrompt) {
  const up = String(upstream || '').trim();
  const vis = String(visualPrompt || '').trim();
  return `视觉风格：
${vis || '（无）'}

用户需求：
${up || '（无）'}`;
}

module.exports = async function runVisualDesigner(ctx) {
  const { merged } = ctx;
  const upstreamFull = extractUpstreamText(merged);
  let upstreamText = upstreamFull;

  // 限制上游文本长度（仅用于喂给模型），返回给下游仍用完整 upstreamFull 拼接
  if (upstreamText.length > 3000) {
    upstreamText = upstreamText.slice(0, 3000) + '\n\n…（内容过长已截断）';
  }

  // 上游长文并入 system，user 仅简短指令，避免模型在回复中复述整段输入（下游解析/展示像「用户+AI 拼接」）
  const upstreamForSystem = upstreamText.trim()
    ? upstreamText
    : '（无上游说明，请按通用企业官网场景选择风格。）';

  const fullSystemPrompt = `${SYSTEM_PROMPT}

## 上游产品 / 交互参考（仅供你内部匹配，不要在回复中复述或摘抄）

${upstreamForSystem}`;

  const userText =
    '请根据上文「上游产品 / 交互参考」与风格库，只输出两行：「选择：风格 N」与「理由：…」，不要输出其它任何内容。';

  const result = await runWithAI('visual-designer', ctx, fullSystemPrompt, userText, {
    maxTokens: 4096,
  });

  // 解析风格编号；data.text = 完整上游 + 灵感库 design prompt（与前端一致）
  if (result.success && result.data?.text) {
    const aiResponse = result.data.text;
    const styleMatch = aiResponse.match(/风格\s*(\d+)/);
    let selectedIndex = styleMatch ? parseInt(styleMatch[1], 10) - 1 : 0;
    if (selectedIndex < 0 || selectedIndex >= VISUAL_STYLES.length) {
      console.warn(`[visual-designer] AI 返回的风格编号无效: ${styleMatch?.[1]}, 默认使用第一个`);
      selectedIndex = 0;
    }
    const selected = VISUAL_STYLES[selectedIndex];
    const designPrompt = selected.prompt;

    const mergedText = formatVisualDesignerOutput(upstreamFull, designPrompt);
    result.data.text = mergedText;
    result.data._resultType = 'visual-design-output';
    result.data.selectedStyleId = selected.id;
    result.summary = `墨墨·视觉设计：已输出视觉风格与用户需求（${mergedText.length} 字）`;
  }

  return result;
};

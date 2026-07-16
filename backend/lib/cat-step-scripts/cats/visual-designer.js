'use strict';

const { runWithAI, extractUpstreamText, resolveSystemPrompt } = require('../_framework');
const { VISUAL_STYLES, getStyleCatalog } = require('../visual-prompt-library');

const LAYOUT_ARCHETYPES = [
  'editorial',
  'bentoGrid',
  'splitHero',
  'centeredMinimal',
  'neoBrutal',
  'glassmorphism',
  'gradientMesh',
];

function safeJsonParseObject(text) {
  try {
    const v = JSON.parse(String(text || '').trim());
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    return v;
  } catch {
    return null;
  }
}

function coerceLandingContentModel(upstreamFullText) {
  const obj = safeJsonParseObject(upstreamFullText);
  if (obj && Array.isArray(obj.sections)) return obj;
  return null;
}

function buildSystemPromptForCatalog(catalogText) {
  return `你是 CuCaTopia 官方工作台猫猫「墨墨」，岗位角色：视觉设计师。
你的任务是根据上游的产品架构和交互设计内容，从给定的视觉风格候选中选择最匹配的一条。

## 视觉风格候选

${catalogText}

## 输出要求

1. 先分析上游内容的行业属性、目标受众和产品气质
2. 从候选中选择 1 个最匹配的风格（说明选择理由）
3. **只需输出两行：「选择：...」与「理由：...」，不要输出完整的设计规范**

用中文输出，简洁明了。`;
}

/** 视觉风格 = 内置候选 prompt；用户需求 = 上游 */
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
  const stepId = ctx?.step?.stepId || '';
  const userNeed = String(ctx?.context?.userInput || '').trim() || '（未提供）';

  // 限制上游文本长度（仅用于喂给模型），返回给下游仍用完整 upstreamFull 拼接
  if (upstreamText.length > 3000) {
    upstreamText = upstreamText.slice(0, 3000) + '\n\n…（内容过长已截断）';
  }

  // 上游长文并入 system，user 仅简短指令，避免模型在回复中复述整段输入（下游解析/展示像「用户+AI 拼接」）
  const upstreamForSystem = upstreamText.trim()
    ? upstreamText
    : '（无上游说明，请按通用企业官网场景选择风格。）';

  // 候选来自内置视觉风格库（getStyleCatalog）
  const catalogText = getStyleCatalog();
  const systemPromptBase = buildSystemPromptForCatalog(catalogText);

  const fullSystemPrompt = `${systemPromptBase}

## 上游产品 / 交互参考（仅供你内部匹配，不要在回复中复述或摘抄）

${upstreamForSystem}`;

  const userText =
    '请根据上文「上游产品 / 交互参考」与候选，严格只输出两行：「选择：风格 N」与「理由：…」，不要输出其它任何内容。';

  // 支持管理员仅在「step」上覆盖 system prompt：
  // - 注意：不要把猫实例的 catSystemPrompt 当作覆盖，否则会导致落地页视觉步骤永远走“自由生成”分支
  // - 覆盖后按覆盖提示词执行（更适合“海报制作”等直出风格提示词的场景），避免被“候选选择”格式约束导致不稳定
  const stepPromptOverride = typeof ctx?.context?.stepSystemPrompt === 'string' ? ctx.context.stepSystemPrompt.trim() : '';
  let result;
  if (stepPromptOverride) {
    const directUserText = upstreamText.trim()
      ? upstreamText
      : '（无上游说明，请输出可被前端直接采用的视觉风格提示词。）';
    result = await runWithAI('visual-designer', ctx, stepPromptOverride, directUserText, {
      maxTokens: 4096,
    });
    if (!result.success) {
      const fallbackPrompt = VISUAL_STYLES[0]?.prompt || '';
      const mergedText = formatVisualDesignerOutput(upstreamFull, fallbackPrompt);
      return {
        success: true,
        status: 'success',
        data: {
          text: mergedText,
          _resultType: 'visual-design-output',
          selectedStyleId: VISUAL_STYLES[0]?.id || '',
          _fallback: true,
        },
        summary: `墨墨·视觉设计：AI 失败已回退为默认风格（${mergedText.length} 字）`,
      };
    }
    // 统一格式：将 AI 输出作为“视觉风格提示词”承载，避免下游/前端展示差异
    if (result.data?.text) {
      const mergedText = formatVisualDesignerOutput(upstreamFull, result.data.text);
      result.data.text = mergedText;
      result.data._resultType = 'visual-design-output';
      result.summary = `墨墨·视觉设计：已输出视觉风格与用户需求（${mergedText.length} 字）`;
    }
    return result;
  }

  result = await runWithAI('visual-designer', ctx, fullSystemPrompt, userText, {
    maxTokens: 4096,
  });
  if (!result.success) {
    const fallbackPrompt = VISUAL_STYLES[0]?.prompt || '';
    const mergedText = formatVisualDesignerOutput(upstreamFull, fallbackPrompt);
    return {
      success: true,
      status: 'success',
      data: {
        text: mergedText,
        _resultType: 'visual-design-output',
        selectedStyleId: VISUAL_STYLES[0]?.id || '',
        _fallback: true,
      },
      summary: `墨墨·视觉设计：AI 失败已回退为默认风格（${mergedText.length} 字）`,
    };
  }

  // 解析选择；data.text = 落地页（wpb_visual）输出结构化 JSON，其它工作流保持旧格式
  if (result.success && result.data?.text) {
    const aiResponse = result.data.text;
    let selectedStyleId = '';
    let designPrompt = '';

    const styleMatch = aiResponse.match(/风格\s*(\d+)/);
    let selectedIndex = styleMatch ? parseInt(styleMatch[1], 10) - 1 : 0;
    if (selectedIndex < 0 || selectedIndex >= VISUAL_STYLES.length) {
      console.warn(`[visual-designer] AI 返回的风格编号无效: ${styleMatch?.[1]}, 默认使用第一个`);
      selectedIndex = 0;
    }
    const selected = VISUAL_STYLES[selectedIndex];
    selectedStyleId = selected.id;
    designPrompt = selected.prompt;

    // 落地页：将上游 contentModel 与 uxNotes 一并打包输出，供前端工程师稳定消费
    if (stepId === 'wpb_visual') {
      const contentModel = coerceLandingContentModel(upstreamFull);
      const layoutArchetype = LAYOUT_ARCHETYPES[Math.floor(Math.random() * LAYOUT_ARCHETYPES.length)];
      const designTokens = {
        layoutArchetype,
        // tokens 由前端工程师基于 prompt 推断，视觉步骤先给“可控意图”而非强行细化到每个 px
        componentVariants: {
          button: ['pill', 'softShadow', 'outline'][Math.floor(Math.random() * 3)],
          card: ['soft', 'outline', 'glass'][Math.floor(Math.random() * 3)],
          background: ['grid', 'mesh', 'none'][Math.floor(Math.random() * 3)],
        },
      };
      const payload = {
        kind: 'landing-visual-v2',
        // 1) 用户需求（来自 workflow context 的原始 userInput）
        userNeed,
        // 2) 匹配风格（内置库命中）
        matchedStyle: null,
        // 3) 通用视觉 prompt（留空，后续你补充）
        genericVisualPrompt: '',
        // 供下游渲染差异化
        visualPrompt: designPrompt,
        designTokens,
        // 上游可能是 ux-designer 的 Markdown；若不是 JSON 则仍保留为 notes
        uxNotes: typeof upstreamFull === 'string' && !contentModel ? String(upstreamFull).trim() : undefined,
        contentModel: contentModel || undefined,
      };
      const text = JSON.stringify(payload);
      result.data.text = text;
      result.data._resultType = 'visual-design-output';
      result.data.selectedStyleId = selectedStyleId;
      result.summary = `墨墨·视觉设计：已输出用户需求/匹配风格/通用prompt（${text.length} 字符）`;
    } else {
      const mergedText = formatVisualDesignerOutput(upstreamFull, designPrompt);
      result.data.text = mergedText;
      result.data._resultType = 'visual-design-output';
      result.data.selectedStyleId = selectedStyleId;
      result.summary = `墨墨·视觉设计：已输出视觉风格与用户需求（${mergedText.length} 字）`;
    }
  }

  return result;
};

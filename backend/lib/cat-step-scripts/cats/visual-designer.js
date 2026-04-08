'use strict';

const { runWithAI, extractUpstreamText, resolveSystemPrompt } = require('../_framework');
const { VISUAL_STYLES, getStyleCatalog } = require('../visual-prompt-library');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

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

function vibeItemCatalog(items) {
  const head = `候选来自 Vibe Style Lib 灵感库（vibe-snap-library）。请在下列候选里选择最合适的一条。`;
  const lines = items.map((it, idx) => {
    const tags = Array.isArray(it.tags) ? it.tags.filter(Boolean).slice(0, 8).join('、') : '';
    const summary = String(it.summary || '').trim();
    return [
      `### 候选 ${idx + 1}`,
      `id: ${it.id}`,
      tags ? `tags: ${tags}` : null,
      summary ? `summary: ${summary.length > 220 ? `${summary.slice(0, 220)}…` : summary}` : 'summary: （空）',
    ].filter(Boolean).join('\n');
  });
  return [head, ...lines].join('\n\n');
}

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

  // 优先从 Vibe Style Lib 灵感库读取候选（只用 summary/tags 给 AI 匹配；取最近 N 条避免上下文过长）
  // 提高稳定性：只取 aiEnabled=true，且优先 official（官方 > 用户）。
  const TAKE = Math.min(
    Math.max(Number.parseInt(process.env.VIBE_STYLE_LIB_TAKE || '16', 10) || 16, 1),
    50,
  );
  let vibeItems = [];
  try {
    vibeItems = await prisma.vibeStyleItem.findMany({
      where: { aiEnabled: true },
      orderBy: [{ isOfficial: 'desc' }, { createdAt: 'desc' }],
      take: TAKE,
      // designPrompt 不拼进候选目录，但需要在最终命中时返回给下游
      select: { id: true, tags: true, summary: true, designPrompt: true },
    });
  } catch (e) {
    console.warn('[visual-designer] load vibeStyleItem failed:', e?.message || String(e));
    vibeItems = [];
  }

  const useVibeLibrary = Array.isArray(vibeItems) && vibeItems.length > 0;
  const catalogText = useVibeLibrary ? vibeItemCatalog(vibeItems) : getStyleCatalog();
  const systemPromptBase = buildSystemPromptForCatalog(catalogText);

  const fullSystemPrompt = `${systemPromptBase}

## 上游产品 / 交互参考（仅供你内部匹配，不要在回复中复述或摘抄）

${upstreamForSystem}`;

  const userText = useVibeLibrary
    ? '请根据上文「上游产品 / 交互参考」与候选，严格只输出两行：「选择：<id>」与「理由：…」，其中 <id> 必须来自候选里的 id。'
    : '请根据上文「上游产品 / 交互参考」与候选，严格只输出两行：「选择：风格 N」与「理由：…」，不要输出其它任何内容。';

  // 支持管理员在 step 上覆盖 system prompt：
  // - 覆盖后按覆盖提示词执行（更适合“海报制作”等直出风格提示词的场景），避免被“候选选择”格式约束导致不稳定
  const sysOverride = resolveSystemPrompt('', ctx);
  let result;
  if (sysOverride) {
    const directUserText = upstreamText.trim()
      ? upstreamText
      : '（无上游说明，请输出可被前端直接采用的视觉风格提示词。）';
    result = await runWithAI('visual-designer', ctx, sysOverride, directUserText, {
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

  // 解析选择；data.text = 完整上游 + designPrompt（与前端一致）
  if (result.success && result.data?.text) {
    const aiResponse = result.data.text;
    let selectedStyleId = '';
    let designPrompt = '';

    if (useVibeLibrary) {
      const idMatch = aiResponse.match(/选择[:：]\s*([a-zA-Z0-9_-]+)/);
      selectedStyleId = idMatch?.[1] ? String(idMatch[1]).trim() : '';
      const picked = vibeItems.find((x) => x.id === selectedStyleId) || vibeItems[0];
      if (!picked) {
        console.warn('[visual-designer] vibe library empty after selection, fallback to builtin');
      } else {
        selectedStyleId = picked.id;
        designPrompt = String(picked.designPrompt || '');
      }
    }

    if (!designPrompt) {
      const styleMatch = aiResponse.match(/风格\s*(\d+)/);
      let selectedIndex = styleMatch ? parseInt(styleMatch[1], 10) - 1 : 0;
      if (selectedIndex < 0 || selectedIndex >= VISUAL_STYLES.length) {
        console.warn(`[visual-designer] AI 返回的风格编号无效: ${styleMatch?.[1]}, 默认使用第一个`);
        selectedIndex = 0;
      }
      const selected = VISUAL_STYLES[selectedIndex];
      selectedStyleId = selected.id;
      designPrompt = selected.prompt;
    }

    const mergedText = formatVisualDesignerOutput(upstreamFull, designPrompt);
    result.data.text = mergedText;
    result.data._resultType = 'visual-design-output';
    result.data.selectedStyleId = selectedStyleId;
    result.summary = `墨墨·视觉设计：已输出视觉风格与用户需求（${mergedText.length} 字）`;
  }

  return result;
};

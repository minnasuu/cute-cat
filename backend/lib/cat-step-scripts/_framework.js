'use strict';

/**
 * 官方猫猫 AIGC 步骤统一框架。
 * - runPlaceholder: 占位（不调模型）
 * - runWithAI: 真实 AI 调用辅助（封装 callAI + 日志 + 超时）
 */

const { callAI } = require('./ai-bridge');

/**
 * 占位框架：不调用任何模型，仅打日志+返回空结果
 */
function runPlaceholder(templateId, ctx) {
  const { step, merged, context } = ctx;
  const role = context?.catRole || '';
  const name = context?.catName || '';
  const stepId = step?.stepId || '';

  console.log('[cat-step]', JSON.stringify({
    templateId,
    catName: name,
    role,
    stepId,
    hasUpstreamText: Boolean(merged?.text),
    hasUpstreamSummary: Boolean(merged?.summary),
    workflowName: context?.workflowName || '',
    exec: 'placeholder',
  }));

  return {
    success: true,
    data: { text: '' },
    summary: `[${templateId}] 脚本框架已执行（输出留空，待接入）`,
    status: 'success',
  };
}

/**
 * 真实 AI 调用辅助
 * @param {string} templateId
 * @param {object} ctx - { step, merged, userEmail, catSystemPrompt, context }
 * @param {string} systemPrompt - 系统提示词
 * @param {string} userText - 用户输入文本
 * @param {object} [options]
 * @param {number} [options.maxTokens=4096]
 * @param {string} [options._resultType] - 如 'html-page'
 * @returns {Promise<{success: boolean, data: object, summary: string, status: string}>}
 */
async function runWithAI(templateId, ctx, systemPrompt, userText, options = {}) {
  const { step, context } = ctx;
  const maxTokens = options.maxTokens || 4096;
  const _resultType = options._resultType || undefined;

  console.log('[cat-step:ai]', JSON.stringify({
    templateId,
    catName: context?.catName || '',
    stepId: step?.stepId || '',
    workflowName: context?.workflowName || '',
    maxTokens,
    inputLength: userText?.length || 0,
  }));

  try {
    const answer = await callAI(systemPrompt, userText, null, maxTokens);

    if (!answer || !answer.trim()) {
      return {
        success: false,
        data: { text: '' },
        summary: `[${templateId}] AI 返回空内容`,
        status: 'error',
      };
    }

    const data = { text: answer };
    if (_resultType) data._resultType = _resultType;

    return {
      success: true,
      data,
      summary: answer.length > 300 ? answer.slice(0, 300) + '…' : answer,
      status: 'success',
    };
  } catch (err) {
    console.error(`[cat-step:ai] ${templateId} error:`, err.message);
    return {
      success: false,
      data: { text: '' },
      summary: `[${templateId}] AI 调用失败: ${err.message}`,
      status: 'error',
    };
  }
}

/**
 * 真实 AI 流式调用辅助（将 token chunk 回调给 ctx.onChunk / options.onChunk）
 * - GLM：智谱 OpenAI 兼容 SSE（data: {...}\n\n）
 */
async function runWithAIStream(templateId, ctx, systemPrompt, userText, options = {}) {
  const { step, context, onChunk: ctxOnChunk } = ctx;
  const maxTokens = options.maxTokens || 4096;
  const _resultType = options._resultType || undefined;
  const selectedModel = 'glm';
  const onChunk = options.onChunk || ctxOnChunk;

  console.log('[cat-step:ai:stream]', JSON.stringify({
    templateId,
    catName: context?.catName || '',
    stepId: step?.stepId || '',
    workflowName: context?.workflowName || '',
    model: selectedModel,
    maxTokens,
    inputLength: userText?.length || 0,
  }));

  try {
    if (selectedModel === 'glm') {
      // --- GLM streaming (智谱, OpenAI 兼容) ---
      const apiKey = process.env.GLM_API_KEY;
      if (!apiKey) throw new Error('GLM_API_KEY not set');
      const baseUrl = process.env.GLM_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4';
      const model = process.env.GLM_MODEL || 'glm-4-flash';

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userText }],
          max_tokens: maxTokens,
          temperature: 0.7,
          stream: true,
        }),
      });
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`GLM API ${response.status}: ${errText}`);
      }
      let fullAnswer = '';
      const reader = response.body;
      const decoder = new TextDecoder();
      let buffer = '';
      for await (const chunk of reader) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (!trimmed.startsWith('data: ')) continue;
          try {
            const json = JSON.parse(trimmed.slice(6));
            const delta = json.choices?.[0]?.delta?.content || '';
            if (delta) {
              fullAnswer += delta;
              try { onChunk?.(delta, fullAnswer); } catch { /* ignore */ }
            }
          } catch { /* skip malformed */ }
        }
      }
      if (!fullAnswer.trim()) {
        return { success: false, data: { text: '' }, summary: `[${templateId}] AI 返回空内容`, status: 'error' };
      }
      const data = { text: fullAnswer };
      if (options._resultType) data._resultType = options._resultType;
      return {
        success: true, data,
        summary: fullAnswer.length > 300 ? fullAnswer.slice(0, 300) + '…' : fullAnswer,
        status: 'success',
      };
    }

    if (!fullAnswer.trim()) {
      return { success: false, data: { text: '' }, summary: `[${templateId}] AI 返回空内容`, status: 'error' };
    }

    const data = { text: fullAnswer };
    if (_resultType) data._resultType = _resultType;
    return {
      success: true,
      data,
      summary: fullAnswer.length > 300 ? fullAnswer.slice(0, 300) + '…' : fullAnswer,
      status: 'success',
    };
  } catch (err) {
    console.error(`[cat-step:ai:stream] ${templateId} error:`, err.message);
    return {
      success: false,
      data: { text: '' },
      summary: `[${templateId}] AI 调用失败: ${err.message}`,
      status: 'error',
    };
  }
}

/**
 * 从 ctx.merged 中提取上游文本
 */
function extractUpstreamText(merged) {
  if (!merged) return '';
  if (typeof merged === 'string') return merged;
  return String(
    merged.text ?? merged.summary ?? merged.notes ?? merged.content ?? merged.result ?? ''
  );
}

/**
 * 允许管理员在 workflow step 上覆盖 system prompt：
 * - stepSystemPrompt 优先级最高（每步自定义）
 * - catSystemPrompt 其次（猫实例自定义）
 */
function resolveSystemPrompt(defaultPrompt, ctx) {
  const stepPrompt = ctx?.context?.stepSystemPrompt;
  if (typeof stepPrompt === 'string' && stepPrompt.trim()) return stepPrompt.trim();
  const catPrompt = ctx?.context?.catSystemPrompt;
  if (typeof catPrompt === 'string' && catPrompt.trim()) return catPrompt.trim();
  return defaultPrompt;
}

module.exports = { runPlaceholder, runWithAI, runWithAIStream, extractUpstreamText, resolveSystemPrompt };

'use strict';

/**
 * 官方猫猫 AIGC 步骤统一框架。
 * - runPlaceholder: 占位（不调模型）
 * - runWithAI: 真实 AI 调用辅助（封装 callAI + 日志 + 超时）
 */

const { callAI } = require('./ai-bridge');

// 延迟加载 Google GenAI（ESM-only 包）
let _GoogleGenAI = null;
async function getGoogleGenAI() {
  if (!_GoogleGenAI) {
    const mod = await import('@google/genai');
    _GoogleGenAI = mod.GoogleGenAI;
  }
  return _GoogleGenAI;
}

async function createGeminiClient(apiKey) {
  const GoogleGenAI = await getGoogleGenAI();
  const baseUrl = process.env.GEMINI_BASE_URL;
  const opts = { apiKey };
  if (baseUrl) opts.httpOptions = { baseUrl };
  return new GoogleGenAI(opts);
}

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
 * - Qwen：OpenAI 兼容 SSE（data: {...}\n\n）
 * - Gemini：@google/genai generateContentStream
 */
async function runWithAIStream(templateId, ctx, systemPrompt, userText, options = {}) {
  const { step, context, onChunk: ctxOnChunk } = ctx;
  const maxTokens = options.maxTokens || 4096;
  const _resultType = options._resultType || undefined;
  const selectedModel = options.model || process.env.DEFAULT_AI_MODEL || 'qwen';
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
    if (selectedModel === 'qwen') {
      const apiKey = process.env.QWEN_API_KEY;
      if (!apiKey) throw new Error('QWEN_API_KEY not set');
      const baseUrl = process.env.QWEN_BASE_URL || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
      const model = process.env.QWEN_MODEL || 'qwen3.5-plus';

      const controller = new AbortController();
      const timeoutMs = Number.parseInt(process.env.QWEN_STREAM_TIMEOUT_MS || '', 10);
      const timeout = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 180000);

      try {
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
          signal: controller.signal,
        });
        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Qwen API ${response.status}: ${errText}`);
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
        if (_resultType) data._resultType = _resultType;
        return {
          success: true,
          data,
          summary: fullAnswer.length > 300 ? fullAnswer.slice(0, 300) + '…' : fullAnswer,
          status: 'success',
        };
      } finally {
        clearTimeout(timeout);
      }
    }

    // --- Gemini streaming ---
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY not set');
    const ai = await createGeminiClient(apiKey);
    const stream = await ai.models.generateContentStream({
      model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
      contents: userText,
      config: {
        systemInstruction: systemPrompt,
        maxOutputTokens: maxTokens,
        temperature: 0.7,
      },
    });

    let fullAnswer = '';
    for await (const chunk of stream) {
      const delta = chunk.text || '';
      if (delta) {
        fullAnswer += delta;
        try { onChunk?.(delta, fullAnswer); } catch { /* ignore */ }
      }
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

module.exports = { runPlaceholder, runWithAI, runWithAIStream, extractUpstreamText };

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
    skillId: step?.skillId,
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
 * 从 ctx.merged 中提取上游文本
 */
function extractUpstreamText(merged) {
  if (!merged) return '';
  if (typeof merged === 'string') return merged;
  return String(
    merged.text ?? merged.summary ?? merged.notes ?? merged.content ?? merged.result ?? ''
  );
}

module.exports = { runPlaceholder, runWithAI, extractUpstreamText };

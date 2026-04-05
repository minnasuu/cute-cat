'use strict';

/**
 * 按 agentId 分发工作流步骤到对应猫脚本。
 * 每只猫唯一对应一个 agentId，调用哪只猫就是调用它的 agent 脚本。
 */

const { OFFICIAL_TEMPLATE_IDS } = require('../../data/official-cats');
const { runPlaceholder, runWithAI, extractUpstreamText } = require('./_framework');
const { callAI } = require('./ai-bridge');

/** @type {Record<string, (ctx: object) => object>} */
const handlers = {};

for (const id of OFFICIAL_TEMPLATE_IDS) {
  try {
    handlers[id] = require(`./cats/${id}`);
  } catch (e) {
    if (e.code !== 'MODULE_NOT_FOUND') throw e;
    handlers[id] = (ctx) => runPlaceholder(id, ctx);
  }
}

/**
 * 按 agentId 分发执行（新版统一入口）
 */
async function runAgentStep(args) {
  const { step, merged, userEmail, context } = args;
  const agentId = step?.agentId || context?.catTemplateId || '';

  // 优先查找已注册的猫脚本
  const run = handlers[agentId];
  if (run) {
    return run(args);
  }

  // 未注册的 agentId：使用通用 AI 调用（不注入外部 prompt）
  const upstreamText = extractUpstreamText(merged);
  const userText = upstreamText || '请执行任务';

  try {
    const answer = await callAI('你是一位专业的 AI 助手，请用中文回复。', userText, null, 4096);
    return {
      success: true,
      data: { text: answer },
      summary: answer?.length > 300 ? answer.slice(0, 300) + '…' : answer,
      status: 'success',
    };
  } catch (err) {
    return {
      success: false,
      data: { text: '' },
      summary: `[${agentId}] AI 调用失败: ${err.message}`,
      status: 'error',
    };
  }
}

/**
 * 旧版兼容入口（按 templateId 分发）
 */
async function runOfficialCatAigcStep(args) {
  const tid = args.context?.catTemplateId || '';
  const run = handlers[tid] || ((ctx) => runPlaceholder(tid || 'unknown-cat', ctx));
  return run(args);
}

module.exports = {
  runAgentStep,
  runOfficialCatAigcStep,
  OFFICIAL_TEMPLATE_IDS,
};

'use strict';

/**
 * AI 调用桥接：延迟加载 workflow-executor 中的 callAI，避免循环依赖。
 * 猫脚本通过此模块间接调用 AI。
 */

let _callAI = null;

function getCallAI() {
  if (!_callAI) {
    // 延迟 require 避免循环
    const executor = require('../../workflow-executor');
    _callAI = executor.callAI;
  }
  return _callAI;
}

async function callAI(systemPrompt, userText, model, maxTokens) {
  const fn = getCallAI();
  if (!fn) throw new Error('callAI not available from workflow-executor');
  return fn(systemPrompt, userText, model, maxTokens);
}

module.exports = { callAI };

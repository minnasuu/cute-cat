'use strict';

/**
 * 按官方猫猫 templateId 分发 AIGC（skillId: aigc）步骤。
 * 每个 templateId 对应 cats/<id>.js，内部仅调用占位框架，具体执行后续逐猫实现。
 */

const { OFFICIAL_TEMPLATE_IDS } = require('../../data/official-cats');
const { runPlaceholder } = require('./_framework');

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
 * @param {object} args
 * @param {object} args.step
 * @param {object} args.merged
 * @param {string} args.userEmail
 * @param {string} args.catSystemPrompt
 * @param {object} args.context
 */
async function runOfficialCatAigcStep(args) {
  const tid = args.context?.catTemplateId || '';
  const run = handlers[tid] || ((ctx) => runPlaceholder(tid || 'unknown-cat', ctx));
  return run(args);
}

module.exports = {
  runOfficialCatAigcStep,
  OFFICIAL_TEMPLATE_IDS,
};

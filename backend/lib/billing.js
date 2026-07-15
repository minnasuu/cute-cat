'use strict';

/**
 * billing —— AI 消费扣币统一入口。
 *
 * 每个真实调用模型的入口都应经此模块扣币,避免散落各处。
 * 扣币失败抛 err.code='INSUFFICIENT_COINS',路由层据此返回 402。
 */

const coins = require('./coins');

/**
 * 按场景扣币。
 * @param {string} userId
 * @param {string} scenario  AI_COSTS 的 key
 * @param {{ refId?: string, note?: string, count?: number }} [meta]
 * @returns {Promise<number>} 新余额
 */
async function chargeAI(userId, scenario, meta = {}) {
  const unit = coins.getCost(scenario);
  if (unit == null) throw new Error(`billing: unknown scenario=${scenario}`);
  const count = meta.count ?? 1;
  const amount = unit * count;
  return coins.consumeCoins(userId, amount, {
    refId: meta.refId,
    note: meta.note || `ai:${scenario} x${count}`,
  });
}

module.exports = { chargeAI };

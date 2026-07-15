'use strict';

/**
 * coins —— 喵币核心：余额查询、收入、消费、流水、定价、套餐。
 *
 * 汇率: 7 元 = 1000 喵币。
 * 并发安全: consumeCoins 用 updateMany({ where: { id, coins: { gte: amount } } })
 *   原子扣减,失败即余额不足,避免超扣。
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ─── 配置 ───
const YUAN_RATE = 1000 / 7;                 // 1 元 = ? 喵币
const SIGNUP_BONUS = 100;                    // 注册奖励
const INVITE_REWARD = 100;                   // 邀请奖励/人
const INVITE_MAX = 10;                      // 邀请上限

// AI 场景单价(喵币/次)
// 灵感分析按 5 喵币/千 tokens 计费;Ark 流式接口不返回 usage,按典型调用(~1600 tokens)估出固定单价 8 喵币。
// 可通过环境变量 INSPIRATION_ANALYZE_COST 覆盖。
const AI_COSTS = {
  image_generate: 9,        // 文生图/线稿/成品图 单张
  image_regenerate: 9,      // 重生成 单张
  image_lineart: 9,         // 线稿 单张
  material_combo_per_image: 9, // 材料组合 单张
  style_mutate_per_image: 9,   // 款式裂变 单张
  chat_text: 1,             // 文本对话 次
  workflow_step: 1,         // 工作流步骤 次
  inspiration_analyze: Number.parseInt(process.env.INSPIRATION_ANALYZE_COST || '', 10) || 8,  // 灵感分析 次 ≈1600 tokens × 5/1000
};

// 充值套餐(灰测模拟支付,后续接真实网关)
const PACKAGES = [
  { id: 'pkg_a', name: '基础包', coins: 1000, yuan: 7 },
  { id: 'pkg_b', name: '进阶包', coins: 3000, yuan: 19 },
  { id: 'pkg_c', name: '豪华包', coins: 8000, yuan: 49 },
];

// ─── 兑换码档位(与套餐对齐,用于前端展示 + 校验) ───
const REDEEM_TIERS = {
  basic: { name: '基础包', coins: 1000, yuan: 7 },
  plus:  { name: '进阶包', coins: 3000, yuan: 19 },
  pro:   { name: '豪华包', coins: 8000, yuan: 49 },
};
const VALID_TIERS = Object.keys(REDEEM_TIERS);

// ─── 内部: 写流水 ───
async function recordTx(userId, { amount, balanceAfter, type, refId, note }) {
  return prisma.coinTransaction.create({
    data: { userId, amount, balanceAfter, type, refId: refId ?? null, note: note ?? null },
  });
}

// ─── 收入 ───
async function addCoins(userId, amount, type, { refId, note } = {}) {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error('addCoins: amount must be a positive integer');
  }
  const allowedTypes = ['recharge', 'signup_bonus', 'invite_reward', 'refund'];
  if (!allowedTypes.includes(type)) {
    throw new Error(`addCoins: unsupported type=${type}`);
  }
  const user = await prisma.user.update({
    where: { id: userId },
    data: { coins: { increment: amount } },
    select: { coins: true },
  });
  await recordTx(userId, { amount, balanceAfter: user.coins, type, refId, note });
  return user.coins;
}

// ─── 消费(原子扣减,余额不足抛错) ───
async function consumeCoins(userId, amount, { refId, note } = {}) {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error('consumeCoins: amount must be a positive integer');
  }
  const updated = await prisma.user.updateMany({
    where: { id: userId, coins: { gte: amount } },
    data: { coins: { decrement: amount } },
  });
  if (updated.count === 0) {
    const e = new Error('INSUFFICIENT_COINS');
    e.code = 'INSUFFICIENT_COINS';
    throw e;
  }
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { coins: true } });
  await recordTx(userId, { amount: -amount, balanceAfter: user.coins, type: 'ai_consume', refId, note });
  return user.coins;
}

// ─── 查询 ───
async function getUserCoins(userId) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { coins: true } });
  return u?.coins ?? 0;
}

async function listTransactions(userId, { type, take = 50, skip = 0 } = {}) {
  const where = { userId };
  if (type) where.type = type;
  const [items, total] = await Promise.all([
    prisma.coinTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(take, 200),
      skip,
    }),
    prisma.coinTransaction.count({ where }),
  ]);
  return { items, total };
}

// ─── 定价 & 套餐 ───
function getCost(scenario) {
  return AI_COSTS[scenario] ?? null;
}

function getPricing() {
  return {
    currency: '喵币',
    yuanRate: YUAN_RATE,
    signupBonus: SIGNUP_BONUS,
    inviteReward: INVITE_REWARD,
    inviteMax: INVITE_MAX,
    costs: AI_COSTS,
  };
}

function getPackages() {
  return PACKAGES.map((p) => ({ ...p, yuanPrice: p.yuan }));
}

function getPackage(packageId) {
  return PACKAGES.find((p) => p.id === packageId) || null;
}

// ─── 邀请码 ───
function generateInviteCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

async function ensureInviteCode(userId) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { inviteCode: true } });
  if (u?.inviteCode) return u.inviteCode;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateInviteCode();
    try {
      await prisma.user.update({ where: { id: userId }, data: { inviteCode: code } });
      return code;
    } catch (err) {
      if (!String(err.message).includes('Unique') && !String(err.message).includes('inviteCode')) throw err;
    }
  }
  throw new Error('generate inviteCode failed after retries');
}

async function findInviterByCode(code) {
  if (!code) return null;
  return prisma.user.findUnique({ where: { inviteCode: String(code).trim().toUpperCase() } });
}

// ─── 充值兑换码 ───

/** 查看现有兑换码档位(前端展示用) */
function getRedeemTiers() {
  return REDEEM_TIERS;
}

/**
 * 管理员/脚本批量生成兑换码。
 * tier ∈ basic|plus|pro,n 为生成数量,默认 1。
 * 代码前缀便于人工辨识档位:B-/P-/R-(basic/plus/pro) + 6 位随机大写字母数字。
 */
async function generateRedeemCodes(tier, n = 1) {
  if (!VALID_TIERS.includes(tier)) throw new Error(`invalid tier: ${tier}`);
  const prefix = { basic: 'B-', plus: 'P-', pro: 'R-' }[tier];
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const out = [];
  for (let i = 0; i < n; i++) {
    let code = prefix;
    for (let k = 0; k < 6; k++) code += charset[Math.floor(Math.random() * charset.length)];
    try {
      await prisma.redemptionCode.create({ data: { code, tier, coins: REDEEM_TIERS[tier].coins } });
      out.push(code);
    } catch (err) {
      // 唯一冲突 → 重试一次
      if (String(err.message).includes('Unique')) { i--; continue; }
      throw err;
    }
  }
  return out;
}

/**
 * 兑换码核销。
 * 返回 { coins, tier, name }。
 * 错误:丢 Error,message 为 'INVALID_CODE' / 'CODE_ALREADY_USED'。
 */
async function redeemCode(userId, rawCode) {
  const code = String(rawCode || '').trim().toUpperCase();
  if (!code) throw new Error('INVALID_CODE');

  const row = await prisma.redemptionCode.findUnique({ where: { code } });
  if (!row) throw new Error('INVALID_CODE');
  if (row.used) throw new Error('CODE_ALREADY_USED');

  // 原子占用(updateMany where used=false → 成功才继续,避免并发重复兑换)
  const locked = await prisma.redemptionCode.updateMany({
    where: { id: row.id, used: false },
    data: { used: true, usedById: userId, usedAt: new Date() },
  });
  if (locked.count === 0) throw new Error('CODE_ALREADY_USED');

  // 加币 + 流水
  const balance = await addCoins(userId, row.coins, 'recharge', {
    refId: row.id,
    note: `兑换码充值 ${REDEEM_TIERS[row.tier]?.name ?? row.tier}(${row.coins} 喵币)`,
  });

  // 首次成功充值 → 升级会员
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (u && u.role === 'user') {
    const updated = await prisma.user.update({ where: { id: userId }, data: { role: 'member' } });
    return { coins: balance, tier: row.tier, name: REDEEM_TIERS[row.tier]?.name ?? row.tier, role: updated.role };
  }
  return { coins: balance, tier: row.tier, name: REDEEM_TIERS[row.tier]?.name ?? row.tier, role: u?.role };
}

module.exports = {
  YUAN_RATE,
  SIGNUP_BONUS,
  INVITE_REWARD,
  INVITE_MAX,
  AI_COSTS,
  PACKAGES,
  addCoins,
  consumeCoins,
  getUserCoins,
  listTransactions,
  getCost,
  getPricing,
  getPackages,
  getPackage,
  generateInviteCode,
  ensureInviteCode,
  findInviterByCode,
  REDEEM_TIERS,
  VALID_TIERS,
  getRedeemTiers,
  generateRedeemCodes,
  redeemCode,
};

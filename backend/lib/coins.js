'use strict';

/**
 * coins —— 喵币核心：余额查询、收入、消费、流水、定价、套餐。
 *
 * 汇率: 10 元 = 1000 喵币(基础包基准)。进阶/豪华包性价比更高。
 * 并发安全: consumeCoins 用 updateMany({ where: { id, coins: { gte: amount } } })
 *   原子扣减,失败即余额不足,避免超扣。
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ─── 配置(默认值,管理员可在后台通过 SystemConfig('coins_pricing') 覆盖) ───
const YUAN_RATE = 1000 / 10;                // 1 元 = ? 喵币
const SIGNUP_BONUS = 100;                    // 注册奖励
const INVITE_REWARD = 100;                   // 邀请奖励/人
const INVITE_MAX = 10;                      // 邀请上限

// AI 场景单价(喵币/次)
// 灵感分析按 5 喵币/千 tokens 计费;Ark 流式接口不返回 usage,按典型调用(~1600 tokens)估出固定单价 8 喵币。
// 可通过环境变量 INSPIRATION_ANALYZE_COST 覆盖。
const AI_COSTS = {
  image_generate: 15,       // 文生图/线稿/成品图 单张
  image_regenerate: 15,     // 重生成 单张
  image_lineart: 15,        // 线稿 单张
  material_combo_per_image: 15, // 材料组合 单张
  style_mutate_per_image: 15,   // 款式裂变 单张
  outfit_styling: 15,           // 穿搭效果(模特 + 单品) 单张
  chat_text: 1,             // 文本对话 次
  workflow_step: 1,         // 工作流步骤 次
  inspiration_analyze: Number.parseInt(process.env.INSPIRATION_ANALYZE_COST || '', 10) || 8,  // 灵感分析 次 ≈1600 tokens × 5/1000
};

// 充值套餐(灰测模拟支付,后续接真实网关)
const PACKAGES = [
  { id: 'pkg_a', name: '基础包', coins: 1000, yuan: 10 },
  { id: 'pkg_b', name: '进阶包', coins: 3000, yuan: 28 },
  { id: 'pkg_c', name: '豪华包', coins: 5000, yuan: 45 },
];

// ─── 兑换码档位(与套餐对齐,用于前端展示 + 校验) ───
const REDEEM_TIERS = {
  basic: { name: '基础包', coins: 1000, yuan: 10 },
  plus:  { name: '进阶包', coins: 3000, yuan: 28 },
  pro:   { name: '豪华包', coins: 5000, yuan: 45 },
};
const VALID_TIERS = Object.keys(REDEEM_TIERS);

// ─── 运行时覆盖(SystemConfig key = 'coins_pricing') ───
// 管理员在后台修改的定价,作为 JSON 字符串存于 SystemConfig.value。
// 启动时加载一次,读取代价/套餐时合并覆盖到默认值之上。
let _runtimePricing = null; // 已解析的覆盖对象(尚未合并默认值)
let _runtimeLoaded = false;

/** 从 DB 加载运行时定价覆盖(启动时调用;表未迁移或出错时保持 null → 使用默认值) */
async function loadRuntimePricing({ force = false } = {}) {
  if (_runtimeLoaded && !force) return _runtimePricing;
  try {
    const row = await prisma.systemConfig.findUnique({ where: { key: 'coins_pricing' } });
    _runtimePricing = row?.value ? JSON.parse(row.value) : null;
  } catch (err) {
    // 表未迁移 / 解析失败 → 降级为默认值,不阻断启动
    console.error('[coins] loadRuntimePricing 失败,使用默认定价:', err.message);
    _runtimePricing = null;
  }
  _runtimeLoaded = true;
  return _runtimePricing;
}

/** 合并: 默认值作为基底,_runtimePricing 有定义的字段覆盖上来 */
function withRuntime(overrides) {
  if (!overrides || typeof overrides !== 'object') return undefined;
  return overrides;
}

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

// ─── 管理员调币(可正可负,扣币时校验余额,写流水) ───
async function adjustCoins(userId, amount, reason) {
  if (!Number.isInteger(amount) || amount === 0) {
    throw new Error('adjustCoins: amount must be a non-zero integer');
  }
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { coins: true } });
  if (!user) throw new Error('用户不存在');
  const newBalance = user.coins + amount;
  if (newBalance < 0) {
    const e = new Error('余额不足');
    e.code = 'INSUFFICIENT_COINS';
    throw e;
  }
  await prisma.user.update({ where: { id: userId }, data: { coins: newBalance } });
  await recordTx(userId, {
    amount,
    balanceAfter: newBalance,
    type: amount >= 0 ? 'refund' : 'adjust',
    note: reason || (amount >= 0 ? '管理员加币' : '管理员扣币'),
  });
  return newBalance;
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
/**
 * 合并后的运行时定价覆盖。
 * - costs / redeemTiers 做浅合并(管理员只填想改的项即可)
 * - packages 为整体替换(数组)
 * - 标量(yuanRate/signupBonus/inviteReward/inviteMax)按字段覆盖
 */
function getRuntime() {
  const rt = (_runtimePricing && typeof _runtimePricing === 'object') ? _runtimePricing : {};
  return {
    yuanRate: rt.yuanRate ?? YUAN_RATE,
    signupBonus: rt.signupBonus ?? SIGNUP_BONUS,
    inviteReward: rt.inviteReward ?? INVITE_REWARD,
    inviteMax: rt.inviteMax ?? INVITE_MAX,
    costs: { ...AI_COSTS, ...(rt.costs || {}) },
    packages: Array.isArray(rt.packages) && rt.packages.length ? rt.packages : PACKAGES,
    redeemTiers: rt.redeemTiers && typeof rt.redeemTiers === 'object' && Object.keys(rt.redeemTiers).length
      ? rt.redeemTiers
      : REDEEM_TIERS,
  };
}

function getCost(scenario) {
  return getRuntime().costs[scenario] ?? null;
}

function getPricing() {
  const rt = getRuntime();
  return {
    currency: '喵币',
    yuanRate: rt.yuanRate,
    signupBonus: rt.signupBonus,
    inviteReward: rt.inviteReward,
    inviteMax: rt.inviteMax,
    costs: rt.costs,
  };
}

function getPackages() {
  return getRuntime().packages.map((p) => ({ ...p, yuanPrice: p.yuan }));
}

function getPackage(packageId) {
  return getRuntime().packages.find((p) => p.id === packageId) || null;
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
  // 显式 select 基础字段:避免未迁移字段导致 P2022
  return prisma.user.findUnique({
    where: { inviteCode: String(code).trim().toUpperCase() },
    select: {
      id: true, email: true, nickname: true, avatar: true, role: true, coins: true,
      inviteCode: true, invitedById: true, inviteCount: true, createdAt: true,
    },
  });
}

// ─── 充值兑换码 ───

/** 查看现有兑换码档位(前端展示用) */
function getRedeemTiers() {
  return getRuntime().redeemTiers;
}

// ─── 标量取值(供直接读取常量的外部模块使用,对齐运行时覆盖) ───
function getSignupBonus() { return getRuntime().signupBonus; }
function getInviteReward() { return getRuntime().inviteReward; }
function getInviteMax() { return getRuntime().inviteMax; }
function getYuanRate() { return getRuntime().yuanRate; }

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
  const tierName = getRuntime().redeemTiers[row.tier]?.name ?? row.tier;
  const balance = await addCoins(userId, row.coins, 'recharge', {
    refId: row.id,
    note: `兑换码充值 ${tierName}(${row.coins} 喵币)`,
  });

  // 首次成功充值 → 升级会员
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (u && u.role === 'user') {
    const updated = await prisma.user.update({ where: { id: userId }, data: { role: 'member' } });
    return { coins: balance, tier: row.tier, name: tierName, role: updated.role };
  }
  return { coins: balance, tier: row.tier, name: tierName, role: u?.role };
}

module.exports = {
  YUAN_RATE,
  SIGNUP_BONUS,
  INVITE_REWARD,
  INVITE_MAX,
  AI_COSTS,
  PACKAGES,
  addCoins,
  adjustCoins,
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
  // 运行时定价覆盖
  loadRuntimePricing,
  getRuntime,
  getSignupBonus,
  getInviteReward,
  getInviteMax,
  getYuanRate,
};

// ─── 启动时异步加载运行时定价(不阻塞模块导出) ───
loadRuntimePricing().catch(() => {});

'use strict';

/**
 * account —— 个人账户中心。
 *
 * GET  /api/account/me            个人信息 + 喵币 + 角色 + 邀请
 * GET  /api/account/pricing       定价(汇率/送币/AI 单价)
 * GET  /api/account/packages      充值套餐
 * POST /api/account/recharge      模拟支付充值(接真实网关时替换验签/幂等)
 * GET  /api/account/transactions  喵币流水(分页 + 类型筛选)
 * GET  /api/account/invite        邀请链接/统计
 * PUT  /api/account/profile       改昵称/头像
 */

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware } = require('../middleware/auth');
const bcrypt = require('bcryptjs');
const coins = require('../lib/coins');

const router = express.Router();
const prisma = new PrismaClient();

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost';

router.use(authMiddleware);

function publicUser(u) {
  return {
    id: u.id,
    email: u.email,
    nickname: u.nickname,
    avatar: u.avatar,
    role: u.role,
    coins: u.coins,
    inviteCode: u.inviteCode,
    inviteCount: u.inviteCount,
    invitedById: u.invitedById,
    createdAt: u.createdAt,
  };
}

// ── 个人中心 ──
router.get('/me', async (req, res) => {
  try {
    const u = await prisma.user.findUnique({
      where: { id: req.userId },
      include: { _count: { select: { coinTransactions: true } } },
    });
    if (!u) return res.status(404).json({ error: '用户不存在' });
    // 系统喵币总量(全部用户余额之和),供前端判断充值库存:
    // 若 user.coins > systemCoins * 0.95 则充值入口置灰
    const agg = await prisma.user.aggregate({ _sum: { coins: true } });
    res.json({
      ...publicUser(u),
      txCount: u._count.coinTransactions,
      systemCoins: agg._sum.coins ?? 0,
    });
  } catch (err) {
    console.error('[account] me error:', err);
    res.status(500).json({ error: '获取账户信息失败' });
  }
});

// ── 定价 ──
router.get('/pricing', (_req, res) => {
  res.json(coins.getPricing());
});

// ── 套餐 ──
router.get('/packages', (_req, res) => {
  res.json({ packages: coins.getPackages() });
});

// ── 充值(模拟支付) ──
// 已废弃: 由兑换码方案替代,保留接口但返回提示,避免旧前端报错。
router.post('/recharge', (_req, res) => {
  res.status(410).json({ error: '充值已改为兑换码模式,请使用 /api/account/redeem' });
});

// ── 兑换码档位(前端展示三档信息) ──
router.get('/redeem-tiers', (_req, res) => {
  res.json({ tiers: coins.getRedeemTiers() });
});

// ── 兑换码核销 ──
router.post('/redeem', async (req, res) => {
  try {
    const { code } = req.body || {};
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: '请输入兑换码' });
    }
    const result = await coins.redeemCode(req.userId, code);
    res.json({
      success: true,
      coins: result.coins,
      tier: result.tier,
      name: result.name,
      role: result.role,
    });
  } catch (err) {
    if (err.message === 'INVALID_CODE') {
      return res.status(400).json({ error: '兑换码无效' });
    }
    if (err.message === 'CODE_ALREADY_USED') {
      return res.status(409).json({ error: '兑换码已被使用' });
    }
    console.error('[account] redeem error:', err);
    res.status(500).json({ error: '兑换失败,请稍后重试' });
  }
});

// ── 流水 ──
router.get('/transactions', async (req, res) => {
  try {
    const type = req.query.type || undefined;
    const take = Number.parseInt(req.query.take, 10) || 50;
    const skip = Number.parseInt(req.query.skip, 10) || 0;
    const { items, total } = await coins.listTransactions(req.userId, { type, take, skip });
    res.json({ items, total, take, skip });
  } catch (err) {
    console.error('[account] transactions error:', err);
    res.status(500).json({ error: '获取流水失败' });
  }
});

// ── 充值明细(三类收入:新用户赠送 / 邀请赠送 / 充值) ──
router.get('/recharge-records', async (req, res) => {
  try {
    const items = await prisma.coinTransaction.findMany({
      where: { userId: req.userId, type: { in: ['signup_bonus', 'invite_reward', 'recharge'] } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ items });
  } catch (err) {
    console.error('[account] recharge-records error:', err);
    res.status(500).json({ error: '获取充值明细失败' });
  }
});

// ── 邀请 ──
router.get('/invite', async (req, res) => {
  try {
    const u = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { inviteCode: true, inviteCount: true },
    });
    if (!u) return res.status(404).json({ error: '用户不存在' });
    const code = u.inviteCode || (await coins.ensureInviteCode(req.userId));
    res.json({
      code,
      url: `${FRONTEND_URL}/register?invite=${encodeURIComponent(code)}`,
      count: u.inviteCount,
      max: coins.INVITE_MAX,
      reward: coins.INVITE_REWARD,
      earned: u.inviteCount * coins.INVITE_REWARD,
    });
  } catch (err) {
    console.error('[account] invite error:', err);
    res.status(500).json({ error: '获取邀请信息失败' });
  }
});

// ── 改资料(昵称/头像/密码) ──
router.put('/profile', async (req, res) => {
  try {
    const { nickname, avatar, oldPassword, newPassword } = req.body;
    const data = {};
    if (nickname) data.nickname = nickname;
    if (avatar !== undefined) data.avatar = avatar;

    // 改密码:需校验原密码
    if (oldPassword || newPassword) {
      if (!oldPassword || !newPassword) {
        return res.status(400).json({ error: '请填写原密码和新密码' });
      }
      if (String(newPassword).length < 6) {
        return res.status(400).json({ error: '新密码至少 6 位' });
      }
      const cur = await prisma.user.findUnique({ where: { id: req.userId }, select: { password: true } });
      if (!cur) return res.status(404).json({ error: '用户不存在' });
      const ok = bcrypt.compareSync(oldPassword, cur.password);
      if (!ok) return res.status(400).json({ error: '原密码错误' });
      data.password = bcrypt.hashSync(String(newPassword), 10);
    }

    const u = await prisma.user.update({
      where: { id: req.userId },
      data,
      select: { id: true, email: true, nickname: true, avatar: true, role: true, coins: true },
    });
    res.json(u);
  } catch (err) {
    console.error('[account] profile error:', err);
    res.status(500).json({ error: '更新失败' });
  }
});

module.exports = router;

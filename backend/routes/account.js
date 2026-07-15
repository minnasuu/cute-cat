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
    res.json({ ...publicUser(u), txCount: u._count.coinTransactions });
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
router.post('/recharge', async (req, res) => {
  try {
    const { packageId } = req.body || {};
    const pkg = coins.getPackage(packageId);
    if (!pkg) return res.status(400).json({ error: '套餐不存在' });

    const balance = await coins.addCoins(req.userId, pkg.coins, 'recharge', {
      refId: pkg.id,
      note: `充值 ${pkg.name}(${pkg.coins} 喵币 = ${pkg.yuan} 元)`,
    });

    // 首次成功充值 → 升级会员
    const u = await prisma.user.findUnique({ where: { id: req.userId }, select: { role: true } });
    if (u && u.role === 'user') {
      await prisma.user.update({ where: { id: req.userId }, data: { role: 'member' } });
    }

    res.json({ success: true, coins: balance, package: pkg, role: u?.role === 'user' ? 'member' : u?.role });
  } catch (err) {
    console.error('[account] recharge error:', err);
    res.status(500).json({ error: '充值失败' });
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

// ── 改资料 ──
router.put('/profile', async (req, res) => {
  try {
    const { nickname, avatar } = req.body;
    const u = await prisma.user.update({
      where: { id: req.userId },
      data: { ...(nickname && { nickname }), ...(avatar !== undefined && { avatar }) },
      select: { id: true, email: true, nickname: true, avatar: true, role: true, coins: true },
    });
    res.json(u);
  } catch (err) {
    console.error('[account] profile error:', err);
    res.status(500).json({ error: '更新失败' });
  }
});

module.exports = router;

'use strict';

/**
 * workspaces —— 官方工作台管理。
 *
 * GET /api/workspaces     当前用户的官方工作台列表(含用户喵币余额,跨工作台通用)
 * GET /api/workspaces/:id  单个工作台详情
 *
 * 工作台由系统官方预置(服装/编织/串珠…),用户不可自建/修改/删除。
 */

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware } = require('../middleware/auth');
const coins = require('../lib/coins');
const { ensureOfficialWorkspaces } = require('../lib/workbench-seed');

const router = express.Router();
const prisma = new PrismaClient();

router.use(authMiddleware);

function publicTeam(t) {
  return {
    id: t.id,
    name: t.name,
    icon: t.icon,
    workspaceType: t.workspaceType,
    isOfficial: t.isOfficial,
    description: t.description,
    createdAt: t.createdAt,
  };
}

// ── 当前用户的工作台列表 + 通用余额 ──
router.get('/', async (req, res) => {
  try {
    // 确保官方工作台已 seed
    await ensureOfficialWorkspaces(prisma, req.userId);
    const teams = await prisma.team.findMany({
      where: { ownerId: req.userId, isOfficial: true },
      orderBy: { createdAt: 'asc' },
    });
    const balance = await coins.getUserCoins(req.userId);
    res.json({ workspaces: teams.map(publicTeam), coins: balance });
  } catch (err) {
    console.error('[workspaces] list error:', err);
    res.status(500).json({ error: '获取工作台列表失败' });
  }
});

// ── 单个工作台详情 ──
router.get('/:id', async (req, res) => {
  try {
    const team = await prisma.team.findFirst({
      where: { id: req.params.id, ownerId: req.userId },
    });
    if (!team) return res.status(404).json({ error: '工作台不存在' });
    res.json(publicTeam(team));
  } catch (err) {
    res.status(500).json({ error: '获取工作台详情失败' });
  }
});

module.exports = router;

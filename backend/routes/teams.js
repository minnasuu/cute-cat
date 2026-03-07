const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// All routes require auth
router.use(authMiddleware);

// Plan limits
const PLAN_LIMITS = {
  free: { maxTeams: 3, maxCatsPerTeam: 5, maxWorkflowsPerTeam: 5 },
  pro: { maxTeams: 999, maxCatsPerTeam: 20, maxWorkflowsPerTeam: 999 },
  enterprise: { maxTeams: 999, maxCatsPerTeam: 999, maxWorkflowsPerTeam: 999 },
};

// ======================== 获取我的团队列表 ========================
router.get('/', async (req, res) => {
  try {
    const teams = await prisma.team.findMany({
      where: { ownerId: req.userId },
      include: {
        cats: { select: { id: true, name: true, role: true, catColors: true, accent: true }, take: 6 },
        _count: { select: { cats: true, workflows: true, workflowRuns: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(teams);
  } catch (err) {
    console.error('[teams] list error:', err);
    res.status(500).json({ error: '获取团队列表失败' });
  }
});

// ======================== 创建团队 ========================
router.post('/', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    const limits = PLAN_LIMITS[user.plan] || PLAN_LIMITS.free;

    const teamCount = await prisma.team.count({ where: { ownerId: req.userId } });
    if (teamCount >= limits.maxTeams) {
      return res.status(403).json({ error: `免费版最多创建 ${limits.maxTeams} 个团队，请升级套餐` });
    }

    const { name, description, icon } = req.body;
    if (!name) return res.status(400).json({ error: '请输入团队名称' });

    const team = await prisma.team.create({
      data: { name, description, icon, ownerId: req.userId },
    });
    res.json(team);
  } catch (err) {
    console.error('[teams] create error:', err);
    res.status(500).json({ error: '创建团队失败' });
  }
});

// ======================== 获取团队详情 ========================
router.get('/:id', async (req, res) => {
  try {
    const team = await prisma.team.findFirst({
      where: { id: req.params.id, ownerId: req.userId },
      include: {
        cats: { orderBy: { createdAt: 'asc' } },
        workflows: { orderBy: { createdAt: 'desc' } },
        _count: { select: { cats: true, workflows: true, workflowRuns: true } },
      },
    });
    if (!team) return res.status(404).json({ error: '团队不存在' });
    res.json(team);
  } catch (err) {
    res.status(500).json({ error: '获取团队详情失败' });
  }
});

// ======================== 更新团队 ========================
router.put('/:id', async (req, res) => {
  try {
    const team = await prisma.team.findFirst({ where: { id: req.params.id, ownerId: req.userId } });
    if (!team) return res.status(404).json({ error: '团队不存在' });

    const { name, description, icon } = req.body;
    const updated = await prisma.team.update({
      where: { id: req.params.id },
      data: { ...(name && { name }), ...(description !== undefined && { description }), ...(icon !== undefined && { icon }) },
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: '更新团队失败' });
  }
});

// ======================== 删除团队 ========================
router.delete('/:id', async (req, res) => {
  try {
    const team = await prisma.team.findFirst({ where: { id: req.params.id, ownerId: req.userId } });
    if (!team) return res.status(404).json({ error: '团队不存在' });

    await prisma.team.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '删除团队失败' });
  }
});

module.exports = router;

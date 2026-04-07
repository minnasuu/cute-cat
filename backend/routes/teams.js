const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();
const { ensureWorkbenchTeam, WORKBENCH_MARKER } = require('../lib/workbench-seed');

// All routes require auth
router.use(authMiddleware);

/**
 * 工作台完整 JSON（含最近运行与 AI 统计），供 GET /workbench 与 GET /:id 误匹配 id=workbench 时兜底。
 */
async function buildWorkbenchJson(userId) {
  const team = await ensureWorkbenchTeam(prisma, userId);
  const tid = team.id;
  const [workflows, catCount, runCount, cats, runs, grouped] = await Promise.all([
    prisma.workflow.findMany({
      where: { teamId: tid },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, icon: true, description: true, steps: true },
    }),
    prisma.teamCat.count({ where: { teamId: tid } }),
    prisma.workflowRun.count({ where: { teamId: tid } }),
    prisma.teamCat.findMany({
      where: { teamId: tid },
      select: { id: true, name: true, role: true, catColors: true, accent: true, messages: true, templateId: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.workflowRun.findMany({
      where: { teamId: tid },
      orderBy: { startedAt: 'desc' },
      take: 60,
      select: {
        id: true,
        workflowId: true,
        workflowName: true,
        userInput: true,
        status: true,
        startedAt: true,
        completedAt: true,
        totalDuration: true,
        steps: true,
      },
    }),
    prisma.aICallLog.groupBy({
      by: ['catId'],
      where: { teamId: tid, catId: { not: null } },
      _count: { _all: true },
    }),
  ]);
  const nameById = Object.fromEntries(cats.map((c) => [c.id, c.name]));
  const aiStats = grouped
    .map((g) => ({
      catId: g.catId,
      name: nameById[g.catId] || '未知猫猫',
      count: g._count._all,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    teamId: team.id,
    name: team.name,
    workflows,
    cats,
    runs,
    aiStats,
    counts: {
      cats: catCount,
      workflows: workflows.length,
      workflowRuns: runCount,
    },
  };
}

// ======================== 工作台：确保默认团队/猫/工作流已就绪 ========================
router.get('/workbench', async (req, res) => {
  try {
    res.json(await buildWorkbenchJson(req.userId));
  } catch (err) {
    console.error('[teams] workbench error:', err);
    res.status(500).json({ error: '初始化工作台失败' });
  }
});

// ======================== 团队 AI 调用统计（按猫聚合） ========================
router.get('/:id/ai-stats', async (req, res) => {
  try {
    const team = await prisma.team.findFirst({
      where: { id: req.params.id, ownerId: req.userId },
    });
    if (!team) return res.status(404).json({ error: '团队不存在' });

    const grouped = await prisma.aICallLog.groupBy({
      by: ['catId'],
      where: { teamId: team.id, catId: { not: null } },
      _count: { _all: true },
    });

    const cats = await prisma.teamCat.findMany({
      where: { teamId: team.id },
      select: { id: true, name: true, templateId: true },
    });
    const nameById = Object.fromEntries(cats.map((c) => [c.id, c.name]));

    const stats = grouped
      .map((g) => ({
        catId: g.catId,
        name: nameById[g.catId] || '未知猫猫',
        count: g._count._all,
      }))
      .sort((a, b) => b.count - a.count);

    res.json(stats);
  } catch (err) {
    console.error('[teams] ai-stats error:', err);
    res.status(500).json({ error: '获取统计失败' });
  }
});

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
router.post('/', (req, res) => {
  res.status(403).json({ error: '当前产品不再支持自建团队；创作数据由系统自动准备' });
});

// ======================== 获取团队详情 ========================
router.get('/:id', async (req, res) => {
  try {
    // 防止 GET /api/teams/workbench 被误匹配为 /:id（id=workbench）而 404「团队不存在」
    if (req.params.id === 'workbench') {
      return res.json(await buildWorkbenchJson(req.userId));
    }
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
    console.error('[teams] detail error:', err);
    res.status(500).json({ error: '获取团队详情失败' });
  }
});

// ======================== 更新团队 ========================
router.put('/:id', async (req, res) => {
  try {
    const team = await prisma.team.findFirst({ where: { id: req.params.id, ownerId: req.userId } });
    if (!team) return res.status(404).json({ error: '团队不存在' });
    if (team.description === WORKBENCH_MARKER) {
      return res.status(403).json({ error: '官方创作空间不可修改' });
    }

    const { name, description } = req.body;
    const updated = await prisma.team.update({
      where: { id: req.params.id },
      data: { ...(name && { name }), ...(description !== undefined && { description }) },
    });
    res.json(updated);
  } catch (err) {
    console.error('[teams] update error:', err);
    res.status(500).json({ error: '更新团队失败' });
  }
});

// ======================== 删除团队 ========================
router.delete('/:id', async (req, res) => {
  try {
    const team = await prisma.team.findFirst({ where: { id: req.params.id, ownerId: req.userId } });
    if (!team) return res.status(404).json({ error: '团队不存在' });
    if (team.description === WORKBENCH_MARKER) {
      return res.status(403).json({ error: '官方创作空间不可删除' });
    }

    await prisma.team.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    console.error('[teams] delete error:', err);
    res.status(500).json({ error: '删除团队失败' });
  }
});

module.exports = router;

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

router.use(authMiddleware);

// Helper: verify team ownership
async function verifyTeamOwner(teamId, userId) {
  return prisma.team.findFirst({ where: { id: teamId, ownerId: userId } });
}

// ======================== 获取团队工作流列表 ========================
router.get('/team/:teamId', async (req, res) => {
  try {
    const team = await verifyTeamOwner(req.params.teamId, req.userId);
    if (!team) return res.status(404).json({ error: '团队不存在' });

    const workflows = await prisma.workflow.findMany({
      where: { teamId: req.params.teamId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(workflows);
  } catch (err) {
    res.status(500).json({ error: '获取工作流列表失败' });
  }
});

// ======================== 创建工作流 ========================
router.post('/team/:teamId', async (req, res) => {
  try {
    const team = await verifyTeamOwner(req.params.teamId, req.userId);
    if (!team) return res.status(404).json({ error: '团队不存在' });

    const { name, icon, description, steps, trigger, cron, scheduled, startTime, endTime, persistent, enabled } = req.body;
    if (!name || !steps) return res.status(400).json({ error: '请填写工作流名称和步骤' });

    const resolvedTrigger = trigger || (scheduled ? 'cron' : 'manual');
    const workflow = await prisma.workflow.create({
      data: {
        teamId: req.params.teamId,
        name,
        icon: icon || '📋',
        description: description || '',
        steps,
        trigger: resolvedTrigger,
        cron: cron || null,
        startTime: startTime || null,
        endTime: endTime || null,
        persistent: !!persistent,
        enabled: enabled !== undefined ? enabled : true,
      },
    });
    res.json(workflow);
  } catch (err) {
    console.error('[workflows] create error:', err);
    res.status(500).json({ error: '创建工作流失败' });
  }
});

// ======================== 获取工作流详情 ========================
router.get('/:id', async (req, res) => {
  try {
    const workflow = await prisma.workflow.findUnique({ where: { id: req.params.id } });
    if (!workflow) return res.status(404).json({ error: '工作流不存在' });
    const team = await verifyTeamOwner(workflow.teamId, req.userId);
    if (!team) return res.status(404).json({ error: '无权访问' });
    res.json(workflow);
  } catch (err) {
    res.status(500).json({ error: '获取工作流失败' });
  }
});

// ======================== 更新工作流 ========================
router.put('/:id', async (req, res) => {
  try {
    const workflow = await prisma.workflow.findUnique({ where: { id: req.params.id } });
    if (!workflow) return res.status(404).json({ error: '工作流不存在' });
    const team = await verifyTeamOwner(workflow.teamId, req.userId);
    if (!team) return res.status(404).json({ error: '无权访问' });

    const { name, icon, description, steps, trigger, cron, scheduled, scheduledEnabled, startTime, endTime, persistent, enabled } = req.body;
    const resolvedTrigger = trigger || (scheduled ? 'cron' : 'manual');
    const updated = await prisma.workflow.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(icon && { icon }),
        ...(description !== undefined && { description }),
        ...(steps && { steps }),
        trigger: resolvedTrigger,
        ...(cron !== undefined && { cron: cron || null }),
        ...(startTime !== undefined && { startTime: startTime || null }),
        ...(endTime !== undefined && { endTime: endTime || null }),
        ...(persistent !== undefined && { persistent: !!persistent }),
        ...(enabled !== undefined || scheduledEnabled !== undefined
          ? { enabled: enabled !== undefined ? enabled : !!scheduledEnabled }
          : {}),
      },
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: '更新工作流失败' });
  }
});

// ======================== 删除工作流 ========================
router.delete('/:id', async (req, res) => {
  try {
    const workflow = await prisma.workflow.findUnique({ where: { id: req.params.id } });
    if (!workflow) return res.status(404).json({ error: '工作流不存在' });
    const team = await verifyTeamOwner(workflow.teamId, req.userId);
    if (!team) return res.status(404).json({ error: '无权访问' });

    await prisma.workflow.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '删除工作流失败' });
  }
});

// ======================== 执行工作流（创建 Run 记录）========================
router.post('/:id/run', async (req, res) => {
  try {
    const workflow = await prisma.workflow.findUnique({ where: { id: req.params.id } });
    if (!workflow) return res.status(404).json({ error: '工作流不存在' });
    const team = await verifyTeamOwner(workflow.teamId, req.userId);
    if (!team) return res.status(404).json({ error: '无权访问' });

    const run = await prisma.workflowRun.create({
      data: {
        workflowId: workflow.id,
        teamId: workflow.teamId,
        triggeredBy: req.userId,
        workflowName: workflow.name,
        status: 'running',
      },
    });
    res.json(run);
  } catch (err) {
    res.status(500).json({ error: '执行工作流失败' });
  }
});

// ======================== 获取团队执行记录 ========================
router.get('/team/:teamId/runs', async (req, res) => {
  try {
    const team = await verifyTeamOwner(req.params.teamId, req.userId);
    if (!team) return res.status(404).json({ error: '团队不存在' });

    const runs = await prisma.workflowRun.findMany({
      where: { teamId: req.params.teamId },
      orderBy: { startedAt: 'desc' },
      take: 50,
    });
    res.json(runs);
  } catch (err) {
    res.status(500).json({ error: '获取执行记录失败' });
  }
});

// ======================== 更新执行记录 ========================
router.put('/runs/:runId', async (req, res) => {
  try {
    const { status, steps, completedAt, totalDuration } = req.body;
    const updated = await prisma.workflowRun.update({
      where: { id: req.params.runId },
      data: {
        ...(status && { status }),
        ...(steps && { steps }),
        ...(completedAt && { completedAt: new Date(completedAt) }),
        ...(totalDuration !== undefined && { totalDuration }),
      },
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: '更新执行记录失败' });
  }
});

module.exports = router;

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

const ADMIN_EMAIL = 'minhansu508@gmail.com';

router.use(authMiddleware);

async function requireAdmin(req, res, next) {
  try {
    const u = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { email: true },
    });
    if (!u || u.email !== ADMIN_EMAIL) {
      return res.status(403).json({ error: '仅管理员可访问' });
    }
    return next();
  } catch (err) {
    return res.status(500).json({ error: '管理员鉴权失败' });
  }
}

router.use(requireAdmin);

// ======================== Admin: workflows list ========================
router.get('/workflows', async (_req, res) => {
  try {
    const workflows = await prisma.workflow.findMany({
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        teamId: true,
        name: true,
        icon: true,
        description: true,
        placeholder: true,
        steps: true,
        trigger: true,
        cron: true,
        startTime: true,
        endTime: true,
        persistent: true,
        enabled: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    res.json(workflows);
  } catch (err) {
    console.error('[admin] list workflows error:', err);
    res.status(500).json({ error: '获取工作流列表失败' });
  }
});

// ======================== Admin: workflow detail ========================
router.get('/workflows/:id', async (req, res) => {
  try {
    const wf = await prisma.workflow.findUnique({ where: { id: req.params.id } });
    if (!wf) return res.status(404).json({ error: '工作流不存在' });
    res.json(wf);
  } catch (err) {
    res.status(500).json({ error: '获取工作流失败' });
  }
});

// ======================== Admin: update workflow (including steps) ========================
router.put('/workflows/:id', async (req, res) => {
  try {
    const { name, description, placeholder, steps, icon, enabled, persistent, trigger, cron, startTime, endTime } =
      req.body || {};

    const updated = await prisma.workflow.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(placeholder !== undefined && { placeholder: typeof placeholder === 'string' ? placeholder : null }),
        ...(steps !== undefined && { steps }),
        ...(icon !== undefined && { icon }),
        ...(enabled !== undefined && { enabled: !!enabled }),
        ...(persistent !== undefined && { persistent: !!persistent }),
        ...(trigger !== undefined && { trigger }),
        ...(cron !== undefined && { cron: cron || null }),
        ...(startTime !== undefined && { startTime: startTime || null }),
        ...(endTime !== undefined && { endTime: endTime || null }),
      },
    });
    res.json(updated);
  } catch (err) {
    console.error('[admin] update workflow error:', err);
    res.status(500).json({ error: '更新工作流失败' });
  }
});

module.exports = router;


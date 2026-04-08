const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware } = require('../middleware/auth');
const { WORKBENCH_MARKER } = require('../lib/workbench-seed');

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
    if (team.description === WORKBENCH_MARKER) {
      return res.status(403).json({ error: '官方创作空间的工作流由系统维护，不可新增' });
    }

    const { name, description, placeholder, steps, icon, trigger, cron, scheduled, startTime, endTime, persistent, enabled } = req.body;
    if (!name || !steps) return res.status(400).json({ error: '请填写工作流名称和步骤' });

    const resolvedTrigger = trigger || (scheduled ? 'cron' : 'manual');
    const workflow = await prisma.workflow.create({
      data: {
        teamId: req.params.teamId,
        name,
        icon: icon || 'ClipboardList',
        description: description || '',
        placeholder: typeof placeholder === 'string' ? placeholder : null,
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
    if (team.description === WORKBENCH_MARKER) {
      return res.status(403).json({ error: '官方创作空间的工作流不可修改' });
    }

    const { name, description, placeholder, steps, trigger, cron, scheduled, scheduledEnabled, startTime, endTime, persistent, enabled } = req.body;
    const resolvedTrigger = trigger || (scheduled ? 'cron' : 'manual');
    const updated = await prisma.workflow.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(placeholder !== undefined && { placeholder: typeof placeholder === 'string' ? placeholder : null }),
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
    if (team.description === WORKBENCH_MARKER) {
      return res.status(403).json({ error: '官方创作空间的工作流不可删除' });
    }

    await prisma.workflow.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '删除工作流失败' });
  }
});

// ======================== 后端执行工作流（定时/手动触发，全程后端执行）========================
router.post('/:id/execute', async (req, res) => {
  try {
    const workflow = await prisma.workflow.findUnique({ where: { id: req.params.id } });
    if (!workflow) return res.status(404).json({ error: '工作流不存在' });
    const team = await verifyTeamOwner(workflow.teamId, req.userId);
    if (!team) return res.status(404).json({ error: '无权访问' });

    const { executeWorkflow } = require('../workflow-executor');
    const userInput = typeof req.body?.userInput === 'string' ? req.body.userInput : '';

    // 异步执行，立即返回
    res.json({ message: '工作流已开始执行', workflowId: workflow.id });

    executeWorkflow(workflow, req.userId, { userInput }).catch(err => {
      console.error(`[workflows] execute error for ${workflow.id}:`, err.message);
    });
  } catch (err) {
    console.error('[workflows] execute error:', err);
    res.status(500).json({ error: '执行工作流失败' });
  }
});

// ======================== 后端执行工作流（SSE 流式返回步骤输出）========================
router.post('/:id/execute/stream', async (req, res) => {
  // --- SSE headers ---
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const heartbeat = setInterval(() => {
    try { res.write(':heartbeat\n\n'); } catch { /* closed */ }
  }, 8000);
  req.on('close', () => clearInterval(heartbeat));

  function sendSSE(event, data) {
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch { /* closed */ }
  }

  function endSSE() {
    clearInterval(heartbeat);
    try { res.end(); } catch { /* closed */ }
  }

  try {
    const workflow = await prisma.workflow.findUnique({ where: { id: req.params.id } });
    if (!workflow) {
      sendSSE('error', { message: '工作流不存在' });
      return endSSE();
    }
    const team = await verifyTeamOwner(workflow.teamId, req.userId);
    if (!team) {
      sendSSE('error', { message: '无权访问' });
      return endSSE();
    }

    const { executeWorkflow } = require('../workflow-executor');
    const userInput = typeof req.body?.userInput === 'string' ? req.body.userInput : '';

    await executeWorkflow(workflow, req.userId, {
      userInput,
      hooks: {
        onRunCreated: ({ runId, workflowId }) => sendSSE('runCreated', { runId, workflowId }),
        onStepStart: ({ index, stepId, agentId }) => sendSSE('stepStart', { index, stepId, agentId }),
        onStepChunk: ({ index, textDelta, accumulated }) =>
          sendSSE('stepChunk', { index, textDelta, accumulatedLen: (accumulated || '').length }),
        onStepDone: ({ index, success, status, summary, resultType, resultData }) =>
          sendSSE('stepDone', {
            index,
            success,
            status,
            summary,
            resultType: resultType || null,
            // 前端需完整 resultData 才能无刷新预览 html-page / react-sandbox；体积由步骤本身决定
            resultData: resultData != null ? String(resultData) : null,
          }),
        onRunDone: ({ runId, status }) => sendSSE('runDone', { runId, status }),
      },
    });

    endSSE();
  } catch (err) {
    console.error('[workflows] execute/stream error:', err);
    sendSSE('error', { message: err.message || '执行工作流失败' });
    endSSE();
  }
});

// ======================== 执行工作流（创建 Run 记录）========================
router.post('/:id/run', async (req, res) => {
  try {
    const workflow = await prisma.workflow.findUnique({ where: { id: req.params.id } });
    if (!workflow) return res.status(404).json({ error: '工作流不存在' });
    const team = await verifyTeamOwner(workflow.teamId, req.userId);
    if (!team) return res.status(404).json({ error: '无权访问' });

    const runCount = await prisma.workflowRun.count({ where: { teamId: workflow.teamId } });
    if (runCount >= 100) {
      await prisma.workflowRun.deleteMany({ where: { teamId: workflow.teamId } });
    }

    const userInput = typeof req.body?.userInput === 'string' ? req.body.userInput.trim() : '';
    const run = await prisma.workflowRun.create({
      data: {
        workflowId: workflow.id,
        teamId: workflow.teamId,
        triggeredBy: req.userId,
        workflowName: workflow.name,
        userInput: userInput || null,
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
      take: 100,
    });
    res.json(runs);
  } catch (err) {
    res.status(500).json({ error: '获取执行记录失败' });
  }
});

// ======================== 删除执行记录 ========================
router.delete('/runs/:runId', async (req, res) => {
  try {
    const run = await prisma.workflowRun.findUnique({ where: { id: req.params.runId } });
    if (!run) return res.status(404).json({ error: '记录不存在' });
    const team = await verifyTeamOwner(run.teamId, req.userId);
    if (!team) return res.status(404).json({ error: '无权访问' });

    await prisma.workflowRun.delete({ where: { id: req.params.runId } });
    res.json({ success: true });
  } catch (err) {
    console.error('[workflows] delete run error:', err);
    res.status(500).json({ error: '删除执行记录失败' });
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

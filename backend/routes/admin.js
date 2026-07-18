const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware } = require('../middleware/auth');
const { WORKBENCH_MARKER, repairWorkbenchWorkflowsForTeam } = require('../lib/workbench-seed');
const { isAdminEmail } = require('../lib/admin');
const coins = require('../lib/coins');

const router = express.Router();
const prisma = new PrismaClient();

router.use(authMiddleware);

// 管理员鉴权(基于 env ADMIN_EMAILS,统一数据源)
async function requireAdmin(req, res, next) {
  try {
    const u = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { email: true, role: true },
    });
    if (!u || (u.role !== 'admin' && !isAdminEmail(u.email))) {
      return res.status(403).json({ error: '仅管理员可访问' });
    }
    return next();
  } catch (err) {
    return res.status(500).json({ error: '管理员鉴权失败' });
  }
}

router.use(requireAdmin);

// ======================== Admin: 用户列表 ========================
router.get('/users', async (_req, res) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        nickname: true,
        role: true,
        coins: true,
        inviteCode: true,
        inviteCount: true,
        createdAt: true,
        _count: { select: { coinTransactions: true } },
      },
    });

    // 聚合每个用户的喵币来源(赠送 / 邀请 / 充值)
    const userIds = users.map((u) => u.id);
    const grouped = await prisma.coinTransaction.groupBy({
      by: ['userId', 'type'],
      where: { userId: { in: userIds }, type: { in: ['signup_bonus', 'invite_reward', 'recharge'] } },
      _sum: { amount: true },
    });
    const summaryMap = {};
    for (const g of grouped) {
      if (!summaryMap[g.userId]) summaryMap[g.userId] = { signupBonus: 0, inviteReward: 0, recharge: 0 };
      const sum = g._sum.amount ?? 0;
      if (g.type === 'signup_bonus') summaryMap[g.userId].signupBonus = sum;
      else if (g.type === 'invite_reward') summaryMap[g.userId].inviteReward = sum;
      else if (g.type === 'recharge') summaryMap[g.userId].recharge = sum;
    }

    res.json({
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        nickname: u.nickname,
        role: u.role,
        coins: u.coins,
        inviteCode: u.inviteCode,
        inviteCount: u.inviteCount,
        txCount: u._count.coinTransactions,
        createdAt: u.createdAt,
        coinsSummary: summaryMap[u.id] ?? { signupBonus: 0, inviteReward: 0, recharge: 0 },
      })),
    });
  } catch (err) {
    console.error('[admin] list users error:', err);
    res.status(500).json({ error: '获取用户列表失败' });
  }
});

// ======================== Admin: 调整用户喵币 ========================
router.post('/users/:id/coins', async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, reason } = req.body || {};
    if (!Number.isInteger(amount) || amount === 0) {
      return res.status(400).json({ error: 'amount 必须是非零整数(正数加币/负数扣币)' });
    }
    const newBalance = await coins.adjustCoins(id, amount, typeof reason === 'string' ? reason : '');
    res.json({ coins: newBalance });
  } catch (err) {
    if (err?.code === 'INSUFFICIENT_COINS') {
      return res.status(400).json({ error: '余额不足,无法扣除' });
    }
    console.error('[admin] adjust coins error:', err);
    res.status(500).json({ error: '调整喵币失败' });
  }
});

// ======================== Admin: 兑换码批量生成 ========================
router.post('/redeem-codes/generate', async (req, res) => {
  try {
    const { tier, count = 1 } = req.body || {};
    if (!['basic', 'plus', 'pro'].includes(tier)) {
      return res.status(400).json({ error: '档位必须是 basic / plus / pro' });
    }
    const n = Math.min(Math.max(parseInt(count, 10) || 1, 1), 200);
    const codes = await coins.generateRedeemCodes(tier, n);
    res.json({ success: true, tier, count: codes.length, codes });
  } catch (err) {
    console.error('[admin] generate redeem codes error:', err);
    res.status(500).json({ error: '生成兑换码失败' });
  }
});

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

// ======================== Admin: delete workflow ========================
router.delete('/workflows/:id', async (req, res) => {
  try {
    const wf = await prisma.workflow.findUnique({ where: { id: req.params.id } });
    if (!wf) return res.status(404).json({ error: '工作流不存在' });
    await prisma.workflow.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    console.error('[admin] delete workflow error:', err);
    res.status(500).json({ error: '删除工作流失败' });
  }
});

// ======================== Admin: repair workbench official workflows ========================
// POST /api/admin/workflows/repair-workbench?teamId=xxx
// - no teamId: repair all workbench teams (description marker)
router.post('/workflows/repair-workbench', async (req, res) => {
  try {
    const teamId = typeof req.query.teamId === 'string' ? req.query.teamId.trim() : '';
    const targetTeams = teamId
      ? await prisma.team.findMany({ where: { id: teamId } })
      : await prisma.team.findMany({ where: { description: WORKBENCH_MARKER } });

    const results = [];
    for (const t of targetTeams) {
      try {
        await repairWorkbenchWorkflowsForTeam(prisma, t.id);
        results.push({ teamId: t.id, ok: true });
      } catch (e) {
        results.push({ teamId: t.id, ok: false, error: e?.message || String(e) });
      }
    }

    res.json({ success: true, data: { repaired: results } });
  } catch (err) {
    console.error('[admin] repair workbench workflows error:', err);
    res.status(500).json({ error: '修复工作台工作流失败' });
  }
});

// ======================== Admin: 内测码管理 ========================

const beta = require('../lib/beta');

// 统计(BetaCode 表未迁移时返回空统计,不 500)
router.get('/beta-codes/stats', async (_req, res) => {
  try {
    const stats = await beta.betaStats();
    res.json(stats);
  } catch (err) {
    console.error('[admin] beta stats error:', err);
    // 表未迁移 → 返回空统计
    if (String(err.message).includes('beta_code') || String(err.message).includes('does not exist') || String(err.message).includes('table')) {
      return res.json({ total: 0, used: 0, unused: 0 });
    }
    res.status(500).json({ error: '获取内测码统计失败' });
  }
});

// 列表(分页,BetaCode 表未迁移时返回空列表,不 500)
router.get('/beta-codes', async (req, res) => {
  try {
    const { page, pageSize } = req.query;
    const result = await beta.listBetaCodes({ page, pageSize });
    res.json(result);
  } catch (err) {
    console.error('[admin] list beta codes error:', err);
    // 表未迁移 → 返回空列表
    if (String(err.message).includes('beta_code') || String(err.message).includes('does not exist') || String(err.message).includes('table')) {
      return res.json({ total: 0, page: 1, pageSize: 50, rows: [] });
    }
    res.status(500).json({ error: '获取内测码列表失败' });
  }
});

// 批量生成
router.post('/beta-codes/generate', async (req, res) => {
  try {
    const { n = 1, note = '' } = req.body;
    const count = Math.min(Math.max(parseInt(n, 10) || 1, 1), 500);
    if (count > 500) return res.status(400).json({ error: '单次最多生成 500 个' });

    // 记录操作的管理员 identity
    const u = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { email: true },
    });
    const createdBy = u?.email || 'admin';

    const codes = await beta.createBetaCodes(count, note, createdBy);
    res.json({ success: true, count: codes.length, codes, note: note || '', createdBy });
  } catch (err) {
    console.error('[admin] generate beta codes error:', err);
    res.status(500).json({ error: '生成内测码失败' });
  }
});

// 删除未使用的内测码
router.delete('/beta-codes/:id', async (req, res) => {
  try {
    const result = await beta.deleteBetaCode(req.params.id);
    if (!result.ok) {
      if (result.reason === 'not_found') return res.status(404).json({ error: '内测码不存在' });
      if (result.reason === 'already_used') return res.status(400).json({ error: '已使用的内测码不可删除' });
      return res.status(400).json({ error: '删除失败' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[admin] delete beta code error:', err);
    res.status(500).json({ error: '删除内测码失败' });
  }
});

// ======================== Admin: 系统配置 ========================

// 获取系统配置(SystemConfig 表未迁移时返回空值,不 500)
router.get('/config/:key', async (req, res) => {
  try {
    const config = await prisma.systemConfig.findUnique({ where: { key: req.params.key } });
    res.json({ key: req.params.key, value: config?.value ?? null, note: config?.note ?? null, updatedBy: config?.updatedBy ?? null, updatedAt: config?.updatedAt ?? null });
  } catch (err) {
    console.error('[admin] get config error:', err);
    // 表未迁移 → 返回空值
    if (String(err.message).includes('system_config') || String(err.message).includes('does not exist') || String(err.message).includes('table')) {
      return res.json({ key: req.params.key, value: null, note: null, updatedBy: null, updatedAt: null });
    }
    res.status(500).json({ error: '获取配置失败' });
  }
});

// 更新系统配置(SystemConfig 表未迁移时返回失败提示,不 500)
router.put('/config/:key', async (req, res) => {
  try {
    const { value, note } = req.body;
    if (value == null) return res.status(400).json({ error: '缺少 value' });
    const adminUser = await prisma.user.findUnique({ where: { id: req.userId }, select: { email: true } });
    const updated = await prisma.systemConfig.upsert({
      where: { key: req.params.key },
      create: { key: req.params.key, value: String(value), note: note || null, updatedBy: adminUser?.email || null },
      update: { value: String(value), ...(note !== undefined && { note }), updatedBy: adminUser?.email || null },
    });
    res.json({ success: true, key: updated.key, value: updated.value, note: updated.note, updatedBy: updated.updatedBy, updatedAt: updated.updatedAt });
  } catch (err) {
    console.error('[admin] update config error:', err);
    // 表未迁移 → 返回友好提示
    if (String(err.message).includes('system_config') || String(err.message).includes('does not exist') || String(err.message).includes('table')) {
      return res.status(400).json({ error: '请先执行数据库迁移(npx prisma migrate dev)后再使用此功能' });
    }
    res.status(500).json({ error: '更新配置失败' });
  }
});

// ======================== Admin: 定价规则 ========================

// 定价规则合法的 AI 场景键(用于校验 & 前端展示)
const PRICING_cost_KEYS = [
  'image_generate', 'image_regenerate', 'image_lineart',
  'material_combo_per_image', 'style_mutate_per_image', 'outfit_styling',
  'chat_text', 'workflow_step', 'inspiration_analyze',
];
const PRICING_TIER_KEYS = ['basic', 'plus', 'pro'];

function validatePricingInput(value) {
  const errors = [];
  if (value == null) return errors;
  if (typeof value !== 'object') { errors.push('pricing 必须为对象'); return errors; }
  if (value.yuanRate != null && (typeof value.yuanRate !== 'number' || value.yuanRate <= 0)) errors.push('yuanRate 必须为正数');
  if (value.signupBonus != null && (!Number.isInteger(value.signupBonus) || value.signupBonus < 0)) errors.push('signupBonus 必须为非负整数');
  if (value.inviteReward != null && (!Number.isInteger(value.inviteReward) || value.inviteReward < 0)) errors.push('inviteReward 必须为非负整数');
  if (value.inviteMax != null && (!Number.isInteger(value.inviteMax) || value.inviteMax < 0)) errors.push('inviteMax 必须为非负整数');
  if (value.costs != null) {
    if (typeof value.costs !== 'object') errors.push('costs 必须为对象');
    else for (const [k, v] of Object.entries(value.costs)) {
      if (!PRICING_cost_KEYS.includes(k)) errors.push(`costs 未知场景: ${k}`);
      else if (!Number.isInteger(v) || v < 0) errors.push(`costs.${k} 必须为非负整数`);
    }
  }
  if (value.packages != null) {
    if (!Array.isArray(value.packages)) errors.push('packages 必须为数组');
    else value.packages.forEach((p, i) => {
      if (!p || typeof p !== 'object') { errors.push(`packages[${i}] 必须为对象`); return; }
      if (typeof p.id !== 'string') errors.push(`packages[${i}].id 必须为字符串`);
      if (typeof p.name !== 'string') errors.push(`packages[${i}].name 必须为字符串`);
      if (!Number.isInteger(p.coins) || p.coins <= 0) errors.push(`packages[${i}].coins 必须为正整数`);
      if (!Number.isInteger(p.yuan) || p.yuan <= 0) errors.push(`packages[${i}].yuan 必须为正整数`);
    });
  }
  if (value.redeemTiers != null) {
    if (typeof value.redeemTiers !== 'object') errors.push('redeemTiers 必须为对象');
    else for (const [k, v] of Object.entries(value.redeemTiers)) {
      if (!PRICING_TIER_KEYS.includes(k)) errors.push(`redeemTiers 未知档位: ${k}`);
      else if (!v || typeof v !== 'object' || typeof v.name !== 'string'
        || !Number.isInteger(v.coins) || v.coins <= 0 || !Number.isInteger(v.yuan) || v.yuan <= 0) {
        errors.push(`redeemTiers.${k} 需要 name(string)/coins(正整数)/yuan(正整数)`);
      }
    }
  }
  return errors;
}

// 获取当前生效的定价(合并后) + 原始存储值
router.get('/pricing', requireAdmin, async (req, res) => {
  try {
    // 确保加载最新(后台低频操作,直接强制刷新)
    await coins.loadRuntimePricing({ force: true });
    const raw = await prisma.systemConfig.findUnique({ where: { key: 'coins_pricing' } });
    const effective = coins.getRuntime();
    res.json({
      key: 'coins_pricing',
      stored: raw?.value ? JSON.parse(raw.value) : null,
      effective,
      defaults: {
        yuanRate: coins.YUAN_RATE,
        signupBonus: coins.SIGNUP_BONUS,
        inviteReward: coins.INVITE_REWARD,
        inviteMax: coins.INVITE_MAX,
        costs: coins.AI_COSTS,
        packages: coins.PACKAGES,
        redeemTiers: coins.REDEEM_TIERS,
      },
      costKeys: PRICING_cost_KEYS,
      tierKeys: PRICING_TIER_KEYS,
      updatedBy: raw?.updatedBy ?? null,
      updatedAt: raw?.updatedAt ?? null,
    });
  } catch (err) {
    console.error('[admin] get pricing error:', err);
    res.status(500).json({ error: '获取定价失败' });
  }
});

// 更新定价规则
router.put('/pricing', requireAdmin, async (req, res) => {
  try {
    const { value } = req.body;
    if (value == null) return res.status(400).json({ error: '缺少 value' });
    const errors = validatePricingInput(value);
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });

    const adminUser = await prisma.user.findUnique({ where: { id: req.userId }, select: { email: true } });
    const json = JSON.stringify(value);
    const updated = await prisma.systemConfig.upsert({
      where: { key: 'coins_pricing' },
      create: { key: 'coins_pricing', value: json, note: '喵币定价规则(管理员可调整)', updatedBy: adminUser?.email || null },
      update: { value: json, note: '喵币定价规则(管理员可调整)', updatedBy: adminUser?.email || null },
    });
    // 刷新内存缓存,立即生效
    await coins.loadRuntimePricing({ force: true });

    res.json({
      success: true,
      key: updated.key,
      effective: coins.getRuntime(),
      updatedBy: updated.updatedBy,
      updatedAt: updated.updatedAt,
    });
  } catch (err) {
    console.error('[admin] update pricing error:', err);
    if (String(err.message).includes('system_config') || String(err.message).includes('does not exist') || String(err.message).includes('table')) {
      return res.status(400).json({ error: '请先执行数据库迁移(npx prisma migrate dev)后再使用此功能' });
    }
    res.status(500).json({ error: '更新定价失败' });
  }
});

module.exports = router;


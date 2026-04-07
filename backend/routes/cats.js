const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware } = require('../middleware/auth');
const { CAT_TEMPLATES, OFFICIAL_TEMPLATE_IDS } = require('../data/official-cats');
const { WORKBENCH_MARKER } = require('../lib/workbench-seed');

const router = express.Router();
const prisma = new PrismaClient();

router.use(authMiddleware);

const PLAN_LIMITS = {
  free: { maxCatsPerTeam: 50 },
  pro: { maxCatsPerTeam: 200 },
  enterprise: { maxCatsPerTeam: 999 },
};

// ======================== 获取模版猫列表 ========================
router.get('/templates', async (req, res) => {
  res.json(CAT_TEMPLATES);
});

// ======================== 获取团队猫猫列表 ========================
router.get('/team/:teamId', async (req, res) => {
  try {
    const team = await prisma.team.findFirst({ where: { id: req.params.teamId, ownerId: req.userId } });
    if (!team) return res.status(404).json({ error: '团队不存在' });

    const cats = await prisma.teamCat.findMany({
      where: { teamId: req.params.teamId },
      orderBy: { createdAt: 'asc' },
    });
    res.json(cats);
  } catch (err) {
    res.status(500).json({ error: '获取猫猫列表失败' });
  }
});

// ======================== 添加猫猫到团队（仅官方模板） ========================
router.post('/team/:teamId', async (req, res) => {
  try {
    const team = await prisma.team.findFirst({ where: { id: req.params.teamId, ownerId: req.userId } });
    if (!team) return res.status(404).json({ error: '团队不存在' });
    if (team.description === WORKBENCH_MARKER) {
      return res.status(403).json({ error: '官方创作空间的角色由系统维护，不可新增' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    const limits = PLAN_LIMITS[user.plan] || PLAN_LIMITS.free;
    const catCount = await prisma.teamCat.count({ where: { teamId: req.params.teamId } });
    if (catCount >= limits.maxCatsPerTeam) {
      return res.status(403).json({ error: `当前套餐每个团队最多 ${limits.maxCatsPerTeam} 只猫猫` });
    }

    const { templateId, name, role, description, catColors, systemPrompt, skills, aiModel, temperature, maxTokens, accent, item, messages } = req.body;

    if (!templateId || !OFFICIAL_TEMPLATE_IDS.includes(templateId)) {
      return res.status(400).json({ error: '请选择官方猫猫模板（templateId）' });
    }

    const template = CAT_TEMPLATES.find((t) => t.id === templateId);
    if (!template) return res.status(400).json({ error: '无效的模板' });

    let data = {
      teamId: req.params.teamId,
      templateId,
      name: name || template.name,
      role: template.role,
      description: template.description,
      catColors: template.catColors,
      systemPrompt: template.systemPrompt,
      skills: template.skills,
      accent: template.accent,
      item: template.item,
      messages: template.messages,
    };

    if (name) data.name = name;
    if (role) data.role = role;
    if (description !== undefined) data.description = description;
    if (catColors) data.catColors = catColors;
    if (systemPrompt !== undefined) data.systemPrompt = systemPrompt;
    if (skills) {
      if (!Array.isArray(skills) || skills.length !== 1 || skills[0]?.id !== 'aigc') {
        return res.status(400).json({ error: '官方猫猫仅保留内置 AIGC 能力标识（aigc），与模板保持一致' });
      }
      data.skills = skills;
    }
    if (aiModel) data.aiModel = aiModel;
    if (temperature !== undefined) data.temperature = temperature;
    if (maxTokens !== undefined) data.maxTokens = maxTokens;
    if (accent) data.accent = accent;
    if (item) data.item = item;
    if (messages) data.messages = messages;

    const cat = await prisma.teamCat.create({ data });
    res.json(cat);
  } catch (err) {
    console.error('[cats] create error:', err);
    res.status(500).json({ error: '添加猫猫失败' });
  }
});

// ======================== 获取猫猫详情 ========================
router.get('/:catId', async (req, res) => {
  try {
    const cat = await prisma.teamCat.findUnique({ where: { id: req.params.catId } });
    if (!cat) return res.status(404).json({ error: '猫猫不存在' });
    const team = await prisma.team.findFirst({ where: { id: cat.teamId, ownerId: req.userId } });
    if (!team) return res.status(404).json({ error: '无权访问' });
    res.json(cat);
  } catch (err) {
    res.status(500).json({ error: '获取猫猫详情失败' });
  }
});

// ======================== 更新猫猫 ========================
router.put('/:catId', async (req, res) => {
  try {
    const cat = await prisma.teamCat.findUnique({ where: { id: req.params.catId } });
    if (!cat) return res.status(404).json({ error: '猫猫不存在' });
    const team = await prisma.team.findFirst({ where: { id: cat.teamId, ownerId: req.userId } });
    if (!team) return res.status(404).json({ error: '无权访问' });
    if (team.description === WORKBENCH_MARKER) {
      return res.status(403).json({ error: '官方创作空间的角色不可修改' });
    }

    const { name, role, description, catColors, systemPrompt, skills, aiModel, temperature, maxTokens, accent, item, messages } = req.body;
    if (skills !== undefined) {
      if (!Array.isArray(skills) || skills.length !== 1 || skills[0]?.id !== 'aigc') {
        return res.status(400).json({ error: '官方猫猫仅保留内置 AIGC 能力标识（aigc）' });
      }
    }
    const updated = await prisma.teamCat.update({
      where: { id: req.params.catId },
      data: {
        ...(name && { name }),
        ...(role && { role }),
        ...(description !== undefined && { description }),
        ...(catColors && { catColors }),
        ...(systemPrompt !== undefined && { systemPrompt }),
        ...(skills && { skills }),
        ...(aiModel !== undefined && { aiModel }),
        ...(temperature !== undefined && { temperature }),
        ...(maxTokens !== undefined && { maxTokens }),
        ...(accent && { accent }),
        ...(item && { item }),
        ...(messages && { messages }),
      },
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: '更新猫猫失败' });
  }
});

// ======================== 删除猫猫 ========================
router.delete('/:catId', async (req, res) => {
  try {
    const cat = await prisma.teamCat.findUnique({ where: { id: req.params.catId } });
    if (!cat) return res.status(404).json({ error: '猫猫不存在' });
    const team = await prisma.team.findFirst({ where: { id: cat.teamId, ownerId: req.userId } });
    if (!team) return res.status(404).json({ error: '无权访问' });
    if (team.description === WORKBENCH_MARKER) {
      return res.status(403).json({ error: '官方创作空间的角色不可删除' });
    }

    await prisma.teamCat.delete({ where: { id: req.params.catId } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '删除猫猫失败' });
  }
});

module.exports = router;

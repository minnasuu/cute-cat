'use strict';

/**
 * 通用团队工作台(Team Workbench)路由。
 *
 * 挂在 `/api/teams/:teamId`,由 host `teams.js` 通过 `router.use('/:teamId', ...)` 挂载。
 * 替代旧 `/api/laisse-ancie/*`,以 `teamId` 为作用域,未来任何团队都可复用这些
 * 「技能 / 资产 / 灵感 / 材料 / 设计作品 / 系列 / 品牌 / 设计主流程 chat」模块。
 *
 * 与旧 `laisse-ancie.js` 并行期:旧路径保留不动;新路径由本文件提供,数据共享 `LA*` 系列表
 * (全部为 teamId 作用域,有 @@index([teamId]))。
 */

const express = require('express');
const path = require('path');
const multer = require('multer');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const { callLongcatStream, callQwenStream, callGeminiStream } = require('../workflow-executor');
const {
  defaultBrand, findOwned, pickDefined, tryParseJson, slugify,
} = require('../lib/laisse-ancie-helpers');

const router = express.Router();

const UPLOAD_ROOT = path.resolve(__dirname, '..', 'uploads');

const storage = multer.diskStorage({
  destination: async (req, _file, cb) => {
    try {
      const dir = path.join(UPLOAD_ROOT, String(req.team.id));
      await new Promise((resolve, reject) =>
        require('fs').mkdir(dir, { recursive: true }, (err) => (err ? reject(err) : resolve())),
      );
      cb(null, dir);
    } catch (err) {
      cb(err);
    }
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const stem = `${Date.now().toString(36)}${crypto.randomUUID().slice(0, 8)}`;
    cb(null, `${stem}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpe?g|png|webp|avif|gif)$/i.test(file.mimetype)) cb(null, true);
    else cb(new Error('unsupported mime'));
  },
});

/* ─── resolve team (带自动创建默认 Laisse Ancie team 兜底) ───────
 * teams.js 已经校验团队所有权;这里额外处理"尚未有 Laisse Ancie 团队"的首次访问:
 * 自动建队 + 品牌信息 seed,保证"进来就能用"。
 */
router.use(async (req, res, next) => {
  try {
    const teamId = req.params.teamId;
    let team = await prisma.team.findFirst({ where: { id: teamId, ownerId: req.userId } });
    if (!team) {
      team = await prisma.team.create({
        data: { name: '来兮·安兮', description: '__laisse_ancie_team__', ownerId: req.userId },
      });
      // seed 品牌信息(无示例技能/资产——新用户从空开始)
      await prisma.lABrandProfile.upsert({
        where: { teamId: team.id },
        update: {},
        create: { teamId: team.id, ...defaultBrand({}) },
      });
    }
    req.team = team;
    req.teamId = team.id;
    next();
  } catch (err) {
    next(err);
  }
});

/* ─── brand profile ──────────────────────────────────────────── */

// GET/PATCH /api/teams/:teamId/brand
router.route('/brand')
  .get(async (req, res) => {
    const profile = await prisma.lABrandProfile.findUnique({ where: { teamId: req.team.id } });
    const pairs = await prisma.lAColorPair.findMany({ where: { teamId: req.team.id }, orderBy: { createdAt: 'asc' } });
    res.json({ profile, colors: pairs });
  })
  .patch(async (req, res) => {
    const data = pickDefined(req.body ?? {}, [
      'nameZh', 'nameEn', 'cnFont', 'enFont', 'sloganZh', 'sloganEn',
      'greetingEn', 'voice', 'audienceAgeMin', 'audienceAgeMax', 'priceMin', 'priceMax',
      'systemSnippet',
    ]);
    const profile = await prisma.lABrandProfile.upsert({
      where: { teamId: req.team.id },
      update: data,
      create: { teamId: req.team.id, ...defaultBrand(data) },
    });
    if (Array.isArray(req.body.colors)) {
      await prisma.lAColorPair.deleteMany({ where: { teamId: req.team.id } });
      if (req.body.colors.length > 0) {
        await prisma.lAColorPair.createMany({
          data: req.body.colors.map((c) => ({ teamId: req.team.id, bg: c.bg, fg: c.fg, usage: c.usage })),
        });
      }
    }
    const pairs = await prisma.lAColorPair.findMany({ where: { teamId: req.team.id } });
    res.json({ profile, colors: pairs });
  });

/* ─── assets (通用资产,替代旧 visual-assets) ──────────────────── */

router.get('/assets', async (req, res) => {
  const { kind } = req.query;
  const where = { teamId: req.team.id };
  if (kind && kind !== 'all') where.kind = String(kind);
  const assets = await prisma.lAVisualAsset.findMany({
    where,
    orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
  });
  res.json(assets);
});

// POST /api/teams/:teamId/assets — JSON body {kind,title,description,src,tags,seasons,pinned}
router.post('/assets', async (req, res) => {
  const data = pickDefined(req.body ?? {}, ['kind', 'title', 'description', 'src', 'tags', 'seasons', 'pinned']);
  if (!data.kind || !data.title || !data.src) {
    return res.status(400).json({ error: 'kind, title, src required' });
  }
  const asset = await prisma.lAVisualAsset.create({
    data: {
      teamId: req.team.id,
      kind: String(data.kind),
      title: String(data.title),
      description: data.description || null,
      src: String(data.src),
      tags: Array.isArray(data.tags) ? data.tags : [],
      seasons: Array.isArray(data.seasons) ? data.seasons : null,
      pinned: !!data.pinned,
    },
  });
  res.status(201).json(asset);
});

router.patch('/assets/:id', async (req, res) => {
  const owned = await findOwned(prisma.lAVisualAsset, req.params.id, req.team.id);
  if (!owned) return res.status(404).json({ error: 'not found' });
  const data = pickDefined(req.body ?? {}, ['kind', 'title', 'description', 'src', 'tags', 'seasons', 'pinned']);
  const asset = await prisma.lAVisualAsset.update({ where: { id: owned.id }, data });
  res.json(asset);
});

router.delete('/assets/:id', async (req, res) => {
  const owned = await findOwned(prisma.lAVisualAsset, req.params.id, req.team.id);
  if (!owned) return res.status(404).json({ error: 'not found' });
  await prisma.lAVisualAsset.delete({ where: { id: owned.id } });
  res.json({ ok: true });
});

/* ─── inspirations (灵感图) ──────────────────────────────────── */

router.get('/inspirations', async (req, res) => {
  const { q, category, take: takeStr, cursor } = req.query;
  const take = Math.min(parseInt(takeStr, 10) || 24, 96);
  const where = { teamId: req.team.id };
  if (category) where.category = String(category);
  if (q) {
    where.OR = [
      { category: { contains: String(q), mode: 'insensitive' } },
      { brandAnalysis: { contains: String(q), mode: 'insensitive' } },
    ];
  }
  const total = await prisma.lAInspirationAsset.count({ where });
  const rows = await prisma.lAInspirationAsset.findMany({
    where,
    take: take + 1,
    ...(cursor ? { cursor: { id: String(cursor) }, skip: 1 } : {}),
    orderBy: { createdAt: 'desc' },
  });
  const hasMore = rows.length > take;
  const items = hasMore ? rows.slice(0, take) : rows;
  res.json({ items, nextCursor: hasMore ? items[items.length - 1].id : null, total });
});

// POST /api/teams/:teamId/inspirations — multipart form-data with field "file"
router.post('/inspirations', (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      console.error('[team-workbench] upload error:', err.message);
      return res.status(400).json({ error: `上传失败: ${err.message}` });
    }
    if (!req.file) return res.status(400).json({ error: 'no file' });
    try {
      const url = `/uploads/${req.team.id}/${req.file.filename}`;
      const asset = await prisma.lAInspirationAsset.create({
        data: {
          teamId: req.team.id,
          url,
          thumbUrl: url,
          mime: req.file.mimetype,
          bytes: req.file.size,
          category: req.body.category || null,
          silhouette: req.body.silhouette || null,
          colors: tryParseJson(req.body.colors, []),
          brandAnalysis: req.body.brandAnalysis || null,
        },
      });
      res.status(201).json(asset);
    } catch (e) {
      console.error('[team-workbench] create inspiration failed:', e);
      res.status(500).json({ error: `写入失败: ${e.message}` });
    }
  });
});

router.post('/inspirations/:id/touch', async (req, res) => {
  const owned = await findOwned(prisma.lAInspirationAsset, req.params.id, req.team.id);
  if (!owned) return res.status(404).json({ error: 'not found' });
  const row = await prisma.lAInspirationAsset.update({
    where: { id: owned.id },
    data: { useCount: { increment: 1 } },
    select: { id: true, useCount: true },
  });
  res.json(row);
});

router.delete('/inspirations/:id', async (req, res) => {
  const owned = await findOwned(prisma.lAInspirationAsset, req.params.id, req.team.id);
  if (!owned) return res.status(404).json({ error: 'not found' });
  await prisma.lAInspirationAsset.delete({ where: { id: owned.id } });
  res.json({ ok: true });
});

/* ─── materials (面料·工艺·辅材·毛线·串珠) ─────────────────── */

router.get('/materials', async (req, res) => {
  const { category } = req.query;
  const where = { teamId: req.team.id };
  if (category && category !== 'all') where.category = String(category);
  const rows = await prisma.lAMaterial.findMany({ where, orderBy: [{ category: 'asc' }, { name: 'asc' }] });
  res.json(rows);
});

router.post('/materials', async (req, res) => {
  const data = pickDefined(req.body ?? {}, [
    'slug', 'category', 'name', 'code', 'supplier', 'origin',
    'colors', 'composition', 'weight', 'texture', 'finish',
    'width', 'thickness', 'diameter', 'size', 'tex', 'shape',
    'originNote', 'care', 'uses', 'seasons', 'notes',
    'priceAmount', 'priceCur', 'priceUnit', 'priceNote',
  ]);
  if (!data.name || !data.category) return res.status(400).json({ error: 'name,category required' });
  if (!data.slug) data.slug = `${data.category}-${slugify(data.name)}-${crypto.randomUUID().slice(0, 6)}`;
  const mat = await prisma.lAMaterial.create({
    data: {
      teamId: req.team.id,
      slug: String(data.slug),
      category: String(data.category),
      name: String(data.name),
      code: data.code || null,
      supplier: data.supplier || null,
      origin: data.origin || null,
      colors: Array.isArray(data.colors) ? data.colors : [],
      composition: data.composition || null,
      weight: data.weight || null,
      texture: data.texture || null,
      finish: data.finish || null,
      width: data.width || null,
      thickness: data.thickness || null,
      diameter: data.diameter || null,
      size: data.size || null,
      tex: data.tex || null,
      shape: data.shape || null,
      originNote: data.originNote || null,
      care: Array.isArray(data.care) ? data.care : [],
      uses: Array.isArray(data.uses) ? data.uses : [],
      seasons: Array.isArray(data.seasons) ? data.seasons : [],
      notes: data.notes || null,
      priceAmount: typeof data.priceAmount === 'number' ? data.priceAmount : null,
      priceCur: data.priceCur || 'CNY',
      priceUnit: data.priceUnit || null,
      priceNote: data.priceNote || null,
    },
  });
  res.status(201).json(mat);
});

router.patch('/materials/:id', async (req, res) => {
  const owned = await findOwned(prisma.lAMaterial, req.params.id, req.team.id);
  if (!owned) return res.status(404).json({ error: 'not found' });
  const data = pickDefined(req.body ?? {}, [
    'slug', 'category', 'name', 'code', 'supplier', 'origin',
    'colors', 'composition', 'weight', 'texture', 'finish',
    'width', 'thickness', 'diameter', 'size', 'tex', 'shape',
    'originNote', 'care', 'uses', 'seasons', 'notes',
    'priceAmount', 'priceCur', 'priceUnit', 'priceNote',
  ]);
  const mat = await prisma.lAMaterial.update({ where: { id: owned.id }, data });
  res.json(mat);
});

router.delete('/materials/:id', async (req, res) => {
  const owned = await findOwned(prisma.lAMaterial, req.params.id, req.team.id);
  if (!owned) return res.status(404).json({ error: 'not found' });
  await prisma.lAMaterial.delete({ where: { id: owned.id } });
  res.json({ ok: true });
});

/* ─── skills 知识库(团队级通用) ──────────────────────────────── */

router.get('/skills', async (req, res) => {
  const { category } = req.query;
  const where = { teamId: req.team.id };
  if (category && category !== 'all') where.category = String(category);
  const rows = await prisma.lASkillArticle.findMany({ where, orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }] });
  res.json(rows);
});

router.post('/skills', async (req, res) => {
  const data = pickDefined(req.body ?? {}, [
    'category', 'title', 'zhTitle', 'body', 'tags',
    'relatedProducts', 'relatedMaterials', 'systemHint', 'pinned',
  ]);
  if (!data.title || !data.zhTitle || !data.category) {
    return res.status(400).json({ error: 'title, zhTitle, category required' });
  }
  const a = await prisma.lASkillArticle.create({
    data: {
      teamId: req.team.id,
      category: String(data.category),
      title: String(data.title),
      zhTitle: String(data.zhTitle),
      body: data.body || '',
      tags: Array.isArray(data.tags) ? data.tags : [],
      relatedProducts: Array.isArray(data.relatedProducts) ? data.relatedProducts : [],
      relatedMaterials: Array.isArray(data.relatedMaterials) ? data.relatedMaterials : [],
      systemHint: data.systemHint || null,
      pinned: !!data.pinned,
    },
  });
  res.status(201).json(a);
});

router.patch('/skills/:id', async (req, res) => {
  const owned = await findOwned(prisma.lASkillArticle, req.params.id, req.team.id);
  if (!owned) return res.status(404).json({ error: 'not found' });
  const data = pickDefined(req.body ?? {}, [
    'category', 'title', 'zhTitle', 'body', 'tags',
    'relatedProducts', 'relatedMaterials', 'systemHint', 'pinned',
  ]);
  const a = await prisma.lASkillArticle.update({ where: { id: owned.id }, data });
  res.json(a);
});

router.delete('/skills/:id', async (req, res) => {
  const owned = await findOwned(prisma.lASkillArticle, req.params.id, req.team.id);
  if (!owned) return res.status(404).json({ error: 'not found' });
  await prisma.lASkillArticle.delete({ where: { id: owned.id } });
  res.json({ ok: true });
});

/* ─── products (设计稿 → lookbook 总表) ─────────────────────── */

router.get('/products', async (req, res) => {
  const { mode, status } = req.query;
  const where = { teamId: req.team.id };
  if (mode && mode !== 'all') where.mode = String(mode);
  if (status) where.status = String(status);
  const rows = await prisma.lAProduct.findMany({ where, orderBy: [{ updatedAt: 'desc' }] });
  res.json(rows);
});

router.post('/products', async (req, res) => {
  const data = pickDefined(req.body ?? [], []);
  if (!data.title) return res.status(400).json({ error: 'title required' });
  const now = new Date().toISOString();
  const status = data.status === 'submitted' ? 'submitted' : 'draft';
  const history = [
    { id: crypto.randomUUID(), status: 'draft', at: data.created_at || now, actor: 'atelier' },
    ...(status === 'submitted' ? [{ id: crypto.randomUUID(), status: 'submitted', at: now, actor: 'atelier' }] : []),
  ];
  const p = await prisma.lAProduct.create({
    data: {
      teamId: req.team.id,
      mode: data.mode || 'single',
      collectionId: data.collectionId || null,
      title: String(data.title),
      description: data.description || '',
      seasons: data.seasons || [],
      category: data.category || null,
      colors: data.colors || [],
      targetPriceNum: typeof data.targetPriceNum === 'number' ? data.targetPriceNum : null,
      silhouette: data.silhouette || null,
      fabricId: data.fabricId || null,
      fabricComposition: data.fabricComposition || null,
      liningId: data.liningId || null,
      liningComposition: data.liningComposition || null,
      trimIds: data.trimIds || null,
      stitchNotes: data.stitchNotes || null,
      measureTable: data.measureTable || null,
      gradingNotes: data.gradingNotes || null,
      patternUrl: data.patternUrl || null,
      techPackUrl: data.techPackUrl || null,
      aiDraftRaw: data.aiDraftRaw || null,
      status,
      statusHistory: history,
    },
  });
  res.status(201).json(p);
});

router.patch('/products/:id', async (req, res) => {
  const owned = await findOwned(prisma.lAProduct, req.params.id, req.team.id);
  if (!owned) return res.status(404).json({ error: 'not found' });
  const data = req.body ?? {};
  const update = {};
  for (const k of Object.keys(data)) {
    if (k === 'status') continue;
    update[k] = data[k];
  }
  const p = await prisma.lAProduct.update({ where: { id: owned.id }, data: update });
  res.json(p);
});

// POST /api/teams/:teamId/products/:id/advance
router.post('/products/:id/advance', async (req, res) => {
  const owned = await findOwned(prisma.lAProduct, req.params.id, req.team.id);
  if (!owned) return res.status(404).json({ error: 'not found' });
  const next = String(req.body.status);
  const entry = {
    id: crypto.randomUUID(),
    status: next,
    at: new Date().toISOString(),
    actor: 'atelier',
    note: req.body.note || null,
  };
  const p = await prisma.lAProduct.update({
    where: { id: owned.id },
    data: { status: next, statusHistory: [...(owned.statusHistory || []), entry] },
  });
  res.json(p);
});

router.delete('/products/:id', async (req, res) => {
  const owned = await findOwned(prisma.lAProduct, req.params.id, req.team.id);
  if (!owned) return res.status(404).json({ error: 'not found' });
  await prisma.lAProduct.delete({ where: { id: owned.id } });
  res.json({ ok: true });
});

/* ─── collections (系列 / 专题) ──────────────────────────────── */

router.get('/collections', async (req, res) => {
  const rows = await prisma.lACollection.findMany({
    where: { teamId: req.team.id },
    orderBy: [{ createdAt: 'desc' }],
    include: { products: { select: { id: true, title: true, status: true } } },
  });
  res.json(rows);
});

router.post('/collections', async (req, res) => {
  const data = pickDefined(req.body ?? {}, ['mode', 'title', 'occasion', 'theme', 'seasons', 'palette', 'designerNote']);
  if (!data.title) return res.status(400).json({ error: 'title required' });
  const c = await prisma.lACollection.create({
    data: {
      teamId: req.team.id,
      mode: data.mode || 'collection',
      title: String(data.title),
      occasion: data.occasion || null,
      theme: data.theme || null,
      seasons: Array.isArray(data.seasons) ? data.seasons : [],
      palette: Array.isArray(data.palette) ? data.palette : [],
      designerNote: data.designerNote || null,
    },
  });
  res.status(201).json(c);
});

router.patch('/collections/:id', async (req, res) => {
  const owned = await findOwned(prisma.lACollection, req.params.id, req.team.id);
  if (!owned) return res.status(404).json({ error: 'not found' });
  const data = pickDefined(req.body ?? {}, ['mode', 'title', 'occasion', 'theme', 'seasons', 'palette', 'designerNote']);
  const c = await prisma.lACollection.update({ where: { id: owned.id }, data });
  res.json(c);
});

router.delete('/collections/:id', async (req, res) => {
  const owned = await findOwned(prisma.lACollection, req.params.id, req.team.id);
  if (!owned) return res.status(404).json({ error: 'not found' });
  await prisma.lACollection.delete({ where: { id: owned.id } });
  res.json({ ok: true });
});

/* ─── chat proxy → SSE 流式(设计主流程) ──────────────────────── */

// POST /api/teams/:teamId/chat   body: { system, prompt, model?, maxTokens? }
//
// SSE 流式 —— header 立即下发、8s 心跳、AbortController 硬超时。
// Events: chunk { text } · done { text, model } · error { error }
const CHAT_TIMEOUT_MS = Number.parseInt(process.env.LAISSE_ANCIE_CHAT_TIMEOUT_MS || '', 10) || 180000;
const CHAT_HEARTBEAT_MS = Number.parseInt(process.env.LAISSE_ANCIE_CHAT_HEARTBEAT_MS || '', 10) || 8000;

router.post('/chat', async (req, res) => {
  const system = String(req.body.system || '');
  const prompt = String(req.body.prompt || '');
  const requestedModel = req.body.model || process.env.DEFAULT_AI_MODEL || 'qwen';
  const maxTokens = Math.min(Number(req.body.maxTokens) || 2048, 8192);
  if (!system && !prompt) return res.status(400).json({ error: 'system or prompt required' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const heartbeat = setInterval(() => {
    try { res.write(':heartbeat\n\n'); } catch { /* 连接已关闭 */ }
  }, CHAT_HEARTBEAT_MS);
  req.on('close', () => clearInterval(heartbeat));

  function sendSSE(event, data) {
    try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch { /* 连接已关闭 */ }
  }
  function endSSE() {
    clearInterval(heartbeat);
    try { res.end(); } catch { /* 连接已关闭 */ }
  }

  const controller = new AbortController();
  const hardTimeout = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);

  let fullText = '';
  const onDelta = (delta) => {
    fullText += delta;
    sendSSE('chunk', { text: delta });
  };

  try {
    console.log(`[team-workbench] chat stream: model=${requestedModel}, maxTokens=${maxTokens}, system=${system.length}c, prompt=${prompt.length}c, timeout=${CHAT_TIMEOUT_MS}ms`);
    if (requestedModel === 'qwen') {
      await callQwenStream(system, prompt, maxTokens, { onDelta, signal: controller.signal });
    } else if (requestedModel === 'longcat') {
      await callLongcatStream(system, prompt, maxTokens, { onDelta, signal: controller.signal });
    } else {
      await callGeminiStream(system, prompt, maxTokens, { onDelta, signal: controller.signal });
    }
    sendSSE('done', { text: fullText, model: requestedModel });
    console.log(`[team-workbench] chat stream done: model=${requestedModel}, length=${fullText.length}`);
  } catch (err) {
    console.error('[team-workbench] chat stream error', err.name, err.message);
    const msg = err.name === 'AbortError'
      ? `生成超时(当前上限 ${Math.round(CHAT_TIMEOUT_MS / 1000)}s,可通过环境变量 LAISSE_ANCIE_CHAT_TIMEOUT_MS 调大)`
      : (err.message || String(err));
    sendSSE('error', { error: msg });
  } finally {
    clearTimeout(hardTimeout);
  }
  endSSE();
});

module.exports = router;

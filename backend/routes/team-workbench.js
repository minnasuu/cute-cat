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
const fs = require('fs');
const multer = require('multer');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const { asyncHandler } = require('../middleware/asyncHandler');
const { callArkStream } = require('../workflow-executor');
const { analyzeInspiration } = require('../lib/analyze-inspiration');
const storage = require('../lib/storage');
const { createSavePath, saveUpload, getPublicUrl, TMP_DIR } = storage;
const designGeneratorRouter = require('./design-generator');
const {
  defaultBrand, findOwned, pickDefined, tryParseJson, slugify,
} = require('../lib/laisse-ancie-helpers');

const router = express.Router();

// 调试用的轻便 multer(field 名 'file'),落点 tmp,调试完后 unlink
const debugImageUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      fs.mkdirSync(TMP_DIR, { recursive: true });
      cb(null, TMP_DIR);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
      cb(null, `dbg-${Date.now().toString(36)}${ext}`);
    },
  }),
  limits: { fileSize: 12 * 1024 * 1024 },
}).single('file');

// TMP_DIR 必须在 multer 启动前物理存在(multer 不等待 async callback)
fs.mkdirSync(TMP_DIR, { recursive: true });
const multerStorage = multer.diskStorage({
  // 统一先落到本地 tmp,后续由 saveUpload() 路由到本地最终目录或 S3,避免容器重建丢失文件
  // 注意:multer diskStorage.destination 是同步回调,不可用 async/await
  destination: (_req, _file, cb) => cb(null, TMP_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const stem = `${Date.now().toString(36)}${crypto.randomUUID().slice(0, 8)}`;
    cb(null, `${stem}${ext}`);
  },
});
const upload = multer({
  storage: multerStorage,
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

// 挂载设计工作流(/design/generate, /design/regenerate)
// ← 必须在 team 中间件之后,否则 req.team 为 undefined 会触发 'cannot read .id'
router.use('/design', designGeneratorRouter);

/* ─── brand profile ──────────────────────────────────────────── */

// GET/PATCH /api/teams/:teamId/brand
router.route('/brand')
  .get(asyncHandler(async (req, res) => {
    const profile = await prisma.lABrandProfile.findUnique({ where: { teamId: req.team.id } });
    const pairs = await prisma.lAColorPair.findMany({ where: { teamId: req.team.id }, orderBy: { createdAt: 'asc' } });
    res.json({ profile, colors: pairs });
  }))
  .patch(asyncHandler(async (req, res) => {
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
  }));

/* ─── assets (通用资产,替代旧 visual-assets) ──────────────────── */

router.get('/assets', asyncHandler(async (req, res) => {
  const { kind } = req.query;
  const where = { teamId: req.team.id };
  if (kind && kind !== 'all') where.kind = String(kind);
  const assets = await prisma.lAVisualAsset.findMany({
    where,
    orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
  });
  res.json(assets);
}));

// POST /api/teams/:teamId/assets — JSON body {kind,title,description,src,tags,seasons,pinned}
router.post('/assets', asyncHandler(async (req, res) => {
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
}));

router.patch('/assets/:id', asyncHandler(async (req, res) => {
  const owned = await findOwned(prisma.lAVisualAsset, req.params.id, req.team.id);
  if (!owned) return res.status(404).json({ error: 'not found' });
  const data = pickDefined(req.body ?? {}, ['kind', 'title', 'description', 'src', 'tags', 'seasons', 'pinned']);
  const asset = await prisma.lAVisualAsset.update({ where: { id: owned.id }, data });
  res.json(asset);
}));

router.delete('/assets/:id', asyncHandler(async (req, res) => {
  const owned = await findOwned(prisma.lAVisualAsset, req.params.id, req.team.id);
  if (!owned) return res.status(404).json({ error: 'not found' });
  await prisma.lAVisualAsset.delete({ where: { id: owned.id } });
  res.json({ ok: true });
}));

/* ─── inspirations (灵感图) ──────────────────────────────────── */

router.get('/inspirations', asyncHandler(async (req, res) => {
  const { q, category, visualStyle, take: takeStr, cursor } = req.query;
  const take = Math.min(parseInt(takeStr, 10) || 24, 96);
  const where = { teamId: req.team.id };
  if (category) where.category = String(category);
  if (visualStyle) where.visualStyle = { contains: String(visualStyle), mode: 'insensitive' };
  if (q) {
    where.OR = [
      { category: { contains: String(q), mode: 'insensitive' } },
      { visualStyle: { contains: String(q), mode: 'insensitive' } },
      { designApproach: { contains: String(q), mode: 'insensitive' } },
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
}));

// GET /api/teams/:teamId/inspirations/debug —— AI 配置诊断(返回各 provider 可用性)
// 注意:上线后应删除或加 admin 校验
router.get('/inspirations/debug', asyncHandler(async (req, res) => {
  try {
    // ark = 主力(文本/视觉解析/生图);qwen = 仅 vibe-snap-extract 子系统
    const prefs = ['ark', 'qwen'];
    const providers = [];
    const openAiEndpoint = (base) => {
      const b = (base || '').replace(/\/+$/, '');
      return b.endsWith('/v1') ? `${b}/chat/completions` : `${b}/v1/chat/completions`;
    };
    for (const name of prefs) {
      const upper = name.toUpperCase();
      const key = process.env[`${upper}_API_KEY`];
      const base = name === 'openai' && !process.env[`${upper}_BASE_URL`] ? 'https://api.openai.com' : process.env[`${upper}_BASE_URL`];
      const model = process.env[`${upper}_MODEL`];
      if (!key || !base) {
        providers.push({ name, ok: 'no-config' });
        continue;
      }
      const endpoint = openAiEndpoint(base);
      let probe = { endpoint, ok: false, status: null, body: null };
      try {
        const r = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
          body: JSON.stringify({ model: model || 'gpt-4o-mini', max_tokens: 5, messages: [{ role: 'user', content: 'hi' }] }),
          signal: AbortSignal.timeout(10000),
        });
        probe.status = r.status;
        probe.ok = r.ok;
        probe.body = await r.text().then((t) => t.slice(0, 300));
      } catch (e) {
        probe.body = `fetch error: ${e.message}`;
      }
      providers.push({ name, ok: probe.ok ? 'ok' : 'fail', model, baseUrl: base.replace(/^https?:\/\/[^/]+/, '***'), probe });
    }
    res.json({
      providers,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}));

// POST /api/teams/:teamId/inspirations/debug —— 真正用一张图调 analyzeInspiration,看哪个 provider 能出 JSON
// 注意:上线后应删除或加 admin 校验
router.post('/inspirations/debug', debugImageUpload, asyncHandler(async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '请上传一张图(field 名 "file")' });
    const buf = fs.readFileSync(req.file.path);
    fs.unlinkSync(req.file.path);
    const ext = path.extname(req.file.filename).toLowerCase();
    const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.png' ? 'image/png' : 'image/jpeg';
    const { result, error } = await analyzeInspiration(buf, mime);
    res.json({ ok: !!result, error, category: result?.category || null, style: result?.styleFeatures || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}));

// POST /api/teams/:teamId/inspirations — multipart form-data with field "file"
router.post('/inspirations', (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      console.error('[team-workbench] upload multer error:', err.message, err.code, err.field);
      return res.status(400).json({ error: `上传失败: ${err.message}` });
    }
    if (!req.file) {
      console.error('[team-workbench] no file in request; content-type:', req.headers['content-type']);
      return res.status(400).json({ error: 'no file' });
    }
    try {
      // 把 multer 暂存文件落到最终位置(本地或 S3,由 storage 模块按 env 决定)
      const savePath = createSavePath(`inspirations/${req.team.id}`, req.file.filename);
      await saveUpload(req.file.path, savePath, req.file.mimetype);
      const url = getPublicUrl(savePath);
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

      // 异步 AI 视觉分析(不阻塞上传响应)——本地模式下 url 相对路径需要转为绝对 /app/backend/… 文件路径
      // savePath 已是 'inspiration/filename' 形式(无 'uploads/' 前缀,UPLOAD_ROOT 已含)
      const filePath = storage.mode === 'local'
        ? path.join(storage.UPLOAD_ROOT, ...savePath.split('/'))
        : null;
      void runInspirationAnalysis(asset.id, filePath, url);
    } catch (e) {
      console.error('[team-workbench] create inspiration failed:', e);
      res.status(500).json({ error: `写入失败: ${e.message}` });
    }
  });
});

// 把/publicUrl 转成 Ark 可访问的绝对 URL
//  - 已是 http(s):// → 直接返回(S3 公网 / data URL)
//  - /uploads/... 相对路径 → 用 FRONTEND_URL 拼成绝对 URL(本地模式,走前端同域反代访问 /uploads)
function toAbsoluteImageUrl(publicUrl) {
  if (!publicUrl) return publicUrl;
  if (/^https?:\/\//i.test(publicUrl) || publicUrl.startsWith('data:')) return publicUrl;
  const base = (process.env.FRONTEND_URL || '').split(',')[0].trim().replace(/\/+$/, '');
  return base ? `${base.replace(/\/+$/, '')}${publicUrl}` : publicUrl;
}

// 异步分析灵感图片,失败把原因写入 analysisError(供前端重试接口返回)
// 返回 'success' | 'failed',调用方可据此响应前端
// filePath:本地绝对路径(本地模式,保留以兼容,已不再用于读图);publicUrl:公网 URL(所有模式,含 S3)
async function runInspirationAnalysis(id, filePath, publicUrl) {
  try {
    // 直接用过 Ark 能拉取的图片 URL(不再绕回读本地磁盘),省 base64 传输且绕过本地文件路径错位
    let imageUrl = toAbsoluteImageUrl(publicUrl);

    // 从 url 中解析 mime: 取文件扩展名
    const ext = path.extname(publicUrl || filePath || '').toLowerCase();
    const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
      : ext === '.png' ? 'image/png'
      : ext === '.webp' ? 'image/webp'
      : 'image/jpeg';

    // 诊断:排查 400 MissingParameter:input.content.image_url(空 URL 直接送 Ark)
    console.log(`[team-workbench] inspiration ${id} analyze: mode=${storage.mode}, publicUrl=${publicUrl}, imageUrl=${imageUrl}, filePath=${filePath}`);

    // 保护:imageUrl 为空时,回退到读最终落盘位置拼 buffer(避免空 URL 送 Ark 报 400)
    let buf = null;
    if (!imageUrl) {
      // 用 storage.UPLOAD_ROOT + publicUrl(不含 /uploads 前缀)拼出本地真实路径
      const localRel = publicUrl && publicUrl.replace(/^\/uploads\//, '');
      const localAbs = localRel ? path.join(storage.UPLOAD_ROOT, localRel) : filePath;
      if (localAbs && fs.existsSync(localAbs)) {
        buf = fs.readFileSync(localAbs);
        console.log(`[team-workbench] inspiration ${id}: imageUrl empty, fallback to buffer(${buf.length}B) from ${localAbs}`);
      }
    }
    const { result, error } = await analyzeInspiration(buf, mime, imageUrl || undefined);
    if (!result) {
      // AI 接口失败 / 返回空 / JSON 解析失败 → 写 failed + analysisError,避免前端永久 "analysing…"
      console.warn(`[team-workbench] inspiration ${id} analysis failed: ${error}`);
      await prisma.lAInspirationAsset.update({ where: { id }, data: { analysisStatus: 'failed', analysisError: error || 'unknown' } }).catch(() => {});
      return 'failed';
    }
    await prisma.lAInspirationAsset.update({
      where: { id },
      data: {
        analysisStatus: 'success',
        analysisError: null,
        category: result.category || null,
        visualStyle: result.visualStyle || null,
        designApproach: result.designApproach || null,
        inspiration: Array.isArray(result.inspiration) ? result.inspiration : [],
      },
    });
    console.log(`[team-workbench] inspiration ${id} analyzed: category=${result.category}`);
    return 'success';
  } catch (err) {
    // 未知异常(不应到达)→ 同样标记 failed
    console.error('[team-workbench] analyze inspiration exception:', err.message);
    await prisma.lAInspirationAsset.update({ where: { id }, data: { analysisStatus: 'failed', analysisError: `exception:${err.message}` } }).catch(() => {});
    return 'failed';
  }
}

// POST /api/teams/:teamId/inspirations/:id/analyze —— 重试 AI 分析(同步等待,返回详细状态给前端排错)
router.post('/inspirations/:id/analyze', asyncHandler(async (req, res) => {
  const owned = await findOwned(prisma.lAInspirationAsset, req.params.id, req.team.id);
  if (!owned) return res.status(404).json({ error: 'not found' });
  // 清除上次失败原因,重置为 pending
  await prisma.lAInspirationAsset.update({ where: { id: owned.id }, data: { analysisStatus: 'pending', analysisError: null } });
  const status = await runInspirationAnalysis(owned.id, owned.url);
  const updated = await prisma.lAInspirationAsset.findUnique({
    where: { id: owned.id },
    select: { id: true, analysisStatus: true, analysisError: true, category: true },
  });
  res.json({ ok: true, status, ...updated });
}));

// PATCH /api/teams/:teamId/inspirations/:id — 更新 AI 分析/归类字段
router.patch('/inspirations/:id', asyncHandler(async (req, res) => {
  const owned = await findOwned(prisma.lAInspirationAsset, req.params.id, req.team.id);
  if (!owned) return res.status(404).json({ error: 'not found' });
  const data = pickDefined(req.body ?? {}, [
    'category', 'visualStyle', 'designApproach', 'inspiration',
    // 旧字段(兼容旧前端/旧数据)
    'silhouette', 'colors', 'brandAnalysis', 'designHighlights', 'styleFeatures',
  ]);
  const row = await prisma.lAInspirationAsset.update({ where: { id: owned.id }, data });
  res.json(row);
}));

// PATCH /api/teams/:teamId/inspirations/:id/image — 替换灵感图片
// multipart form-data with field "file";只换图(url/bytes/mime),保留 category/visualStyle 等
// AI 分析字段不变,不触发重新解析(避免覆盖已有分析或重复耗时)
router.patch('/inspirations/:id/image', (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      console.error('[team-workbench] replace image multer error:', err.message);
      return res.status(400).json({ error: `上传失败: ${err.message}` });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'no file' });
    }
    const owned = await findOwned(prisma.lAInspirationAsset, req.params.id, req.team.id);
    if (!owned) return res.status(404).json({ error: 'not found' });
    try {
      // 新图保存到同一位置(同 teamId 子目录),文件名用新文件的唯一名
      const savePath = createSavePath(`inspirations/${req.team.id}`, req.file.filename);
      await saveUpload(req.file.path, savePath, req.file.mimetype);
      const url = getPublicUrl(savePath);
      // 只更新图的 url/bytes/mime;保留 category/visualStyle/designApproach/inspiration/analysisStatus 等分析字段
      const updated = await prisma.lAInspirationAsset.update({
        where: { id: owned.id },
        data: { url, thumbUrl: url, mime: req.file.mimetype, bytes: req.file.size },
      });
      res.json(updated);
    } catch (e) {
      console.error('[team-workbench] replace inspiration image failed:', e);
      res.status(500).json({ error: `替换失败: ${e.message}` });
    }
  });
});

router.post('/inspirations/:id/touch', asyncHandler(async (req, res) => {
  const owned = await findOwned(prisma.lAInspirationAsset, req.params.id, req.team.id);
  if (!owned) return res.status(404).json({ error: 'not found' });
  const row = await prisma.lAInspirationAsset.update({
    where: { id: owned.id },
    data: { useCount: { increment: 1 } },
    select: { id: true, useCount: true },
  });
  res.json(row);
}));

router.delete('/inspirations/:id', asyncHandler(async (req, res) => {
  const owned = await findOwned(prisma.lAInspirationAsset, req.params.id, req.team.id);
  if (!owned) return res.status(404).json({ error: 'not found' });
  await prisma.lAInspirationAsset.delete({ where: { id: owned.id } });
  res.json({ ok: true });
}));

/* ─── materials (面料·工艺·辅材·毛线·串珠) ─────────────────── */

router.get('/materials', asyncHandler(async (req, res) => {
  const { category } = req.query;
  const where = { teamId: req.team.id };
  if (category && category !== 'all') where.category = String(category);
  const rows = await prisma.lAMaterial.findMany({ where, orderBy: [{ category: 'asc' }, { name: 'asc' }] });
  res.json(rows);
}));

router.post('/materials', asyncHandler(async (req, res) => {
  const data = pickDefined(req.body ?? {}, [
    'slug', 'category', 'name', 'code', 'supplier', 'origin',
    'colors', 'composition', 'weight', 'texture', 'finish',
    'width', 'thickness', 'diameter', 'size', 'tex', 'shape',
    'originNote', 'care', 'uses', 'seasons', 'notes',
    'priceAmount', 'priceCur', 'priceUnit', 'priceNote',
    'image',
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
      image: data.image || null,
    },
  });
  res.status(201).json(mat);
}));

router.patch('/materials/:id', asyncHandler(async (req, res) => {
  const owned = await findOwned(prisma.lAMaterial, req.params.id, req.team.id);
  if (!owned) return res.status(404).json({ error: 'not found' });
  const data = pickDefined(req.body ?? {}, [
    'slug', 'category', 'name', 'code', 'supplier', 'origin',
    'colors', 'composition', 'weight', 'texture', 'finish',
    'width', 'thickness', 'diameter', 'size', 'tex', 'shape',
    'originNote', 'care', 'uses', 'seasons', 'notes',
    'priceAmount', 'priceCur', 'priceUnit', 'priceNote',
    'image',
  ]);
  const mat = await prisma.lAMaterial.update({ where: { id: owned.id }, data });
  res.json(mat);
}));

// POST /api/teams/:teamId/materials/:id/image —— 上传/替换材料参考图
// multipart form-data, field "file";写入材料的 image 字段
router.post('/materials/:id/image', (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      console.error('[team-workbench] material image multer error:', err.message);
      return res.status(400).json({ error: `上传失败: ${err.message}` });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'no file' });
    }
    const owned = await findOwned(prisma.lAMaterial, req.params.id, req.team.id);
    if (!owned) return res.status(404).json({ error: 'not found' });
    try {
      const savePath = createSavePath(`materials/${req.team.id}`, req.file.filename);
      await saveUpload(req.file.path, savePath, req.file.mimetype);
      const url = getPublicUrl(savePath);
      const updated = await prisma.lAMaterial.update({
        where: { id: owned.id },
        data: { image: url },
      });
      res.json({ id: updated.id, url });
    } catch (e) {
      console.error('[team-workbench] upload material image failed:', e);
      res.status(500).json({ error: `上传失败: ${e.message}` });
    }
  });
});

router.delete('/materials/:id', asyncHandler(async (req, res) => {
  const owned = await findOwned(prisma.lAMaterial, req.params.id, req.team.id);
  if (!owned) return res.status(404).json({ error: 'not found' });
  await prisma.lAMaterial.delete({ where: { id: owned.id } });
  res.json({ ok: true });
}));

/* ─── skills 知识库(团队级通用) ──────────────────────────────── */
/* 引入 10 phase taxonomy 的校验 + 旧 6 key 兼容 */
const {
  normalizeCategory, VALID_PHASE_SET, WRITEABLE_PHASE_SET,
} = require('../data/skill-phases');

router.get('/skills', asyncHandler(async (req, res) => {
  const { category } = req.query;
  const where = { teamId: req.team.id };
  if (category && category !== 'all') {
    // 兼容旧 Laisse Ancie 6 key（design/craft/...）：映射到新 phase id
    const normalized = normalizeCategory(category);
    if (!normalized) return res.status(400).json({ error: `unknown category: ${category}` });
    where.category = normalized;
  }
  const rows = await prisma.lASkillArticle.findMany({ where, orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }] });
  res.json(rows);
}));

router.post('/skills', asyncHandler(async (req, res) => {
  const data = pickDefined(req.body ?? {}, [
    'category', 'title', 'zhTitle', 'body', 'tags',
    'relatedProducts', 'relatedMaterials', 'systemHint', 'pinned',
  ]);
  if (!data.title || !data.zhTitle || !data.category) {
    return res.status(400).json({ error: 'title, zhTitle, category required' });
  }
  const normalized = normalizeCategory(data.category);
  if (!normalized) return res.status(400).json({ error: `unknown category: ${data.category}` });
  if (!WRITEABLE_PHASE_SET.has(normalized)) {
    return res.status(400).json({ error: `category is read-only (coming soon): ${normalized}` });
  }
  const a = await prisma.lASkillArticle.create({
    data: {
      teamId: req.team.id,
      category: normalized,
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
}));

router.patch('/skills/:id', asyncHandler(async (req, res) => {
  const owned = await findOwned(prisma.lASkillArticle, req.params.id, req.team.id);
  if (!owned) return res.status(404).json({ error: 'not found' });
  const data = pickDefined(req.body ?? {}, [
    'category', 'title', 'zhTitle', 'body', 'tags',
    'relatedProducts', 'relatedMaterials', 'systemHint', 'pinned',
  ]);
  if (data.category !== undefined) {
    const normalized = normalizeCategory(data.category);
    if (!normalized) return res.status(400).json({ error: `unknown category: ${data.category}` });
    if (!WRITEABLE_PHASE_SET.has(normalized)) {
      return res.status(400).json({ error: `category is read-only (coming soon): ${normalized}` });
    }
    data.category = normalized;
  }
  const a = await prisma.lASkillArticle.update({ where: { id: owned.id }, data });
  res.json(a);
}));

router.delete('/skills/:id', asyncHandler(async (req, res) => {
  const owned = await findOwned(prisma.lASkillArticle, req.params.id, req.team.id);
  if (!owned) return res.status(404).json({ error: 'not found' });
  await prisma.lASkillArticle.delete({ where: { id: owned.id } });
  res.json({ ok: true });
}));

/* ─── products (设计稿 → lookbook 总表) ─────────────────────── */

router.get('/products', asyncHandler(async (req, res) => {
  const { mode, status } = req.query;
  const where = { teamId: req.team.id };
  if (mode && mode !== 'all') where.mode = String(mode);
  if (status) where.status = String(status);
  const rows = await prisma.lAProduct.findMany({ where, orderBy: [{ updatedAt: 'desc' }] });
  res.json(rows);
}));

router.post('/products', asyncHandler(async (req, res) => {
  const data = req.body ?? {};
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
      // 设计工作流生成的图片数组:[{slot, label, url}]
      images: Array.isArray(data.images) ? data.images : [],
      html: typeof data.html === 'string' ? data.html : null,
      aiDraftRaw: data.aiDraftRaw || null,
      status,
      statusHistory: history,
    },
  });
  res.status(201).json(p);
}));

router.patch('/products/:id', asyncHandler(async (req, res) => {
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
}));

// POST /api/teams/:teamId/products/:id/advance
router.post('/products/:id/advance', asyncHandler(async (req, res) => {
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
}));

router.delete('/products/:id', asyncHandler(async (req, res) => {
  const owned = await findOwned(prisma.lAProduct, req.params.id, req.team.id);
  if (!owned) return res.status(404).json({ error: 'not found' });
  await prisma.lAProduct.delete({ where: { id: owned.id } });
  res.json({ ok: true });
}));

/* ─── collections (系列 / 专题) ──────────────────────────────── */

router.get('/collections', asyncHandler(async (req, res) => {
  const rows = await prisma.lACollection.findMany({
    where: { teamId: req.team.id },
    orderBy: [{ createdAt: 'desc' }],
    include: { products: { select: { id: true, title: true, status: true } } },
  });
  res.json(rows);
}));

router.post('/collections', asyncHandler(async (req, res) => {
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
}));

router.patch('/collections/:id', asyncHandler(async (req, res) => {
  const owned = await findOwned(prisma.lACollection, req.params.id, req.team.id);
  if (!owned) return res.status(404).json({ error: 'not found' });
  const data = pickDefined(req.body ?? {}, ['mode', 'title', 'occasion', 'theme', 'seasons', 'palette', 'designerNote']);
  const c = await prisma.lACollection.update({ where: { id: owned.id }, data });
  res.json(c);
}));

router.delete('/collections/:id', asyncHandler(async (req, res) => {
  const owned = await findOwned(prisma.lACollection, req.params.id, req.team.id);
  if (!owned) return res.status(404).json({ error: 'not found' });
  await prisma.lACollection.delete({ where: { id: owned.id } });
  res.json({ ok: true });
}));

/* ─── chat proxy → SSE 流式(设计主流程) ──────────────────────── */

// POST /api/teams/:teamId/chat   body: { system, prompt, model?, maxTokens? }
//
// SSE 流式 —— header 立即下发、8s 心跳、AbortController 硬超时。
// Events: chunk { text } · done { text, model } · error { error }
const CHAT_TIMEOUT_MS = Number.parseInt(process.env.LAISSE_ANCIE_CHAT_TIMEOUT_MS || '', 10) || 180000;
const CHAT_HEARTBEAT_MS = Number.parseInt(process.env.LAISSE_ANCIE_CHAT_HEARTBEAT_MS || '', 10) || 8000;

router.post('/chat', asyncHandler(async (req, res) => {
  const system = String(req.body.system || '');
  const prompt = String(req.body.prompt || '');
  const requestedModel = req.body.model || process.env.DEFAULT_AI_MODEL || 'ark';
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
    // 唯一文本模型: ARK 豆包
    const model = 'ark';
    console.log(`[team-workbench] chat stream: model=${model}, maxTokens=${maxTokens}, system=${system.length}c, prompt=${prompt.length}c, timeout=${CHAT_TIMEOUT_MS}ms`);
    await callArkStream(system, prompt, maxTokens, { onDelta, signal: controller.signal });
    sendSSE('done', { text: fullText, model });
    console.log(`[team-workbench] chat stream done: model=${model}, length=${fullText.length}`);
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
}));

module.exports = router;

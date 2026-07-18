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
const coins = require('../lib/coins');
const storage = require('../lib/storage');
const { createSavePath, saveUpload, getPublicUrl, deleteImageByUrl, TMP_DIR } = storage;
const designGeneratorRouter = require('./design-generator');
const {
  defaultBrand, findOwned, pickDefined, tryParseJson, slugify,
} = require('../lib/laisse-ancie-helpers');
const { isAdminUserId } = require('../lib/admin');

const router = express.Router();

// 上传单图大小上限:1 MB(前端+后端双端校验,超出直接拒收)
const MAX_UPLOAD_BYTES = 1 * 1024 * 1024;

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
  limits: { fileSize: MAX_UPLOAD_BYTES },
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
  limits: { fileSize: MAX_UPLOAD_BYTES },
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
      'logo', 'name', 'slogan', 'cnFont', 'enFont',
      'voice', 'audienceAgeMin', 'audienceAgeMax', 'priceMin', 'priceMax',
      'systemSnippet', 'statusConfig',
    ]);
    // statusConfig 必须是数组,否则忽略(前端 JSON 可控但服务端兜底)
    if (data.statusConfig !== undefined && !Array.isArray(data.statusConfig)) {
      delete data.statusConfig;
    }
    // create 路径:直接落用户提交值(列已可空,无值=空 brand,不再注入 demo 填充);
    // 仅补一个默认 systemSnippet 占位,避免 AI 侧拿到空串。
    const profile = await prisma.lABrandProfile.upsert({
      where: { teamId: req.team.id },
      update: data,
      create: { teamId: req.team.id, ...data, systemSnippet: data.systemSnippet || null },
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

// 把 multer 错误翻译成中文友好 JSON,供各 upload 回调复用
function multerError(res, err) {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: '图片过大,请上传不超过 1MB 的图片' });
  }
  if (err.message === 'unsupported mime') {
    return res.status(400).json({ error: '不支持的图片格式,请上传 JPG / PNG / WebP' });
  }
  return res.status(400).json({ error: `上传失败: ${err.message}` });
}

// POST /api/teams/:teamId/brand/logo —— 上传品牌标识图,直接写入 profile.logo 并返回 { id, url }
router.post('/brand/logo', (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) return multerError(res, err);
    if (!req.file) return res.status(400).json({ error: 'no file' });
    try {
      const savePath = createSavePath(`brands/${req.team.id}`, req.file.filename);
      await saveUpload(req.file.path, savePath, req.file.mimetype);
      const url = getPublicUrl(savePath);
      // upsert 前先取旧 logo,新 logo 写入成功后异步删旧对象,覆盖不留 COS 孤儿。
      const before = await prisma.lABrandProfile.findUnique({ where: { teamId: req.team.id }, select: { logo: true } });
      const oldLogo = before?.logo || null;
      const profile = await prisma.lABrandProfile.upsert({
        where: { teamId: req.team.id },
        update: { logo: url },
        create: { teamId: req.team.id, logo: url },
      });
      if (oldLogo && oldLogo !== url) {
        deleteImageByUrl(oldLogo).catch((e) =>
          console.warn(`[team-workbench] brand ${req.team.id} old-logo COS cleanup failed: ${e?.message || e}`));
      }
      res.json({ id: profile.id, url });
    } catch (e) {
      console.error('[team-workbench] upload brand logo failed:', e);
      res.status(500).json({ error: `上传失败: ${e.message}` });
    }
  });
});

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
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: '图片过大,请上传不超过 1MB 的图片' });
      }
      return res.status(400).json({ error: `上传失败: ${err.message}` });
    }
    if (!req.file) {
      console.error('[team-workbench] no file in request; content-type:', req.headers['content-type']);
      return res.status(400).json({ error: 'no file' });
    }
    try {
      // 把 multer 暂存文件落到最终位置(本地或 S3,由 storage 模块按 env 决定)
      // saveUpload 内部会压缩图片并返回压缩后大小
      const savePath = createSavePath(`inspirations/${req.team.id}`, req.file.filename);
      const finalSize = await saveUpload(req.file.path, savePath, req.file.mimetype);
      const url = getPublicUrl(savePath);
      const asset = await prisma.lAInspirationAsset.create({
        data: {
          teamId: req.team.id,
          url,
          thumbUrl: url,
          mime: req.file.mimetype,
          bytes: finalSize,
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
      void runInspirationAnalysis(asset.id, filePath, url, req.userId);
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
// userId:触发分析的用户,用于扣喵币(5 喵币/千 tokens,按固定单价扣)
async function runInspirationAnalysis(id, filePath, publicUrl, userId) {
  try {
    // 先扣喵币(余额不足 → 标记 failed:insufficient_coins,不送 AI)
    const cost = coins.getCost('inspiration_analyze');
    try {
      if (userId) await coins.consumeCoins(userId, cost, { refId: id, note: `灵感分析 ${cost} 🐾` });
    } catch (err) {
      if (err.code === 'INSUFFICIENT_COINS') {
        console.warn(`[team-workbench] inspiration ${id} skip: user ${userId} insufficient coins (need ${cost})`);
        await prisma.lAInspirationAsset.update({ where: { id }, data: { analysisStatus: 'failed', analysisError: 'insufficient_coins' } }).catch(() => {});
        return 'failed';
      }
      throw err;
    }

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
  // owned.url 是公网/相对 URL,必须作为 publicUrl(第 3 参数)传入,才能让 toAbsoluteImageUrl 拼出
  // Ark 可拉取的绝对 URL;若误作 filePath(第 2 参数)传入,publicUrl 为 undefined,会走本地文件兜底并
  // 因路径不存在而必然返回 error:'file',导致重试永远失败。
  // 重试分析同样扣喵币
  const status = await runInspirationAnalysis(owned.id, null, owned.url, req.userId);
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
    if (err) return multerError(res, err);
    if (!req.file) {
      return res.status(400).json({ error: 'no file' });
    }
    const owned = await findOwned(prisma.lAInspirationAsset, req.params.id, req.team.id);
    if (!owned) return res.status(404).json({ error: 'not found' });
    try {
      // 新图保存到同一位置(同 teamId 子目录),文件名用新文件的唯一名
      const savePath = createSavePath(`inspirations/${req.team.id}`, req.file.filename);
      const finalSize = await saveUpload(req.file.path, savePath, req.file.mimetype);
      const url = getPublicUrl(savePath);
      // 只更新图的 url/bytes/mime;保留 category/visualStyle/designApproach/inspiration/analysisStatus 等分析字段
      const updated = await prisma.lAInspirationAsset.update({
        where: { id: owned.id },
        data: { url, thumbUrl: url, mime: req.file.mimetype, bytes: finalSize },
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
  // 收集本产品持有的图片(url + thumbUrl),再删记录,最后异步清 COS(失败仅记日志,不阻塞/回退)。
  const imageUrls = [owned.url, owned.thumbUrl].filter((v) => typeof v === 'string' && v);
  await prisma.lAInspirationAsset.delete({ where: { id: owned.id } });
  if (imageUrls.length) {
    Promise.allSettled(imageUrls.map((u) => deleteImageByUrl(u)))
      .then((results) => {
        for (const r of results) {
          if (r.status === 'rejected') {
            console.warn(`[team-workbench] inspiration ${owned.id} COS cleanup failed: ${r.reason?.message || r.reason}`);
          }
        }
      });
  }
  res.json({ ok: true });
}));

/* ─── materials (面料·工艺·辅材·毛线·串珠) ─────────────────── */

router.get('/materials', asyncHandler(async (req, res) => {
  const { category } = req.query;
  const teamId = req.team.id;
  // 合并「本 team」+「管理员共享(shared=true)」,让所有用户可用
  const where = { OR: [{ teamId }, { shared: true }] };
  if (category && category !== 'all') {
    where.OR = where.OR.map((c) => ({ ...c, category: String(category) }));
  }
  const rows = await prisma.lAMaterial.findMany({ where, orderBy: [{ category: 'asc' }, { name: 'asc' }] });
  res.json(rows);
}));

router.post('/materials', asyncHandler(async (req, res) => {
  const data = pickDefined(req.body ?? {}, [
    'slug', 'category', 'name', 'code', 'supplier', 'origin',
    'colors', 'colorImages', 'composition', 'weight', 'texture', 'finish',
    'width', 'thickness', 'diameter', 'size', 'tex', 'shape',
    'originNote', 'care', 'uses', 'seasons', 'notes',
    'priceAmount', 'priceCur', 'priceUnit', 'priceNote',
    'image',
  ]);
  if (!data.name || !data.category) return res.status(400).json({ error: 'name,category required' });
  if (!data.slug) data.slug = `${data.category}-${slugify(data.name)}-${crypto.randomUUID().slice(0, 6)}`;
  let mat;
  try {
    mat = await prisma.lAMaterial.create({
      data: {
        teamId: req.team.id,
        slug: String(data.slug),
        category: String(data.category),
        name: String(data.name),
        code: data.code || null,
        supplier: data.supplier || null,
        origin: data.origin || null,
        colors: Array.isArray(data.colors) ? data.colors : [],
        colorImages: Array.isArray(data.colorImages) ? data.colorImages : [],
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
  } catch (eCreate) {
    console.error('[team-workbench] createMaterial failed:', eCreate?.message || eCreate);
    return res.status(500).json({ error: `[create] ${eCreate?.message || '创建失败'}` });
  }
  res.status(201).json(mat);
}));

router.patch('/materials/:id', asyncHandler(async (req, res) => {
  const owned = await findOwned(prisma.lAMaterial, req.params.id, req.team.id);
  if (!owned) return res.status(404).json({ error: 'not found' });
  const data = pickDefined(req.body ?? {}, [
    'slug', 'category', 'name', 'code', 'supplier', 'origin',
    'colors', 'colorImages', 'composition', 'weight', 'texture', 'finish',
    'width', 'thickness', 'diameter', 'size', 'tex', 'shape',
    'originNote', 'care', 'uses', 'seasons', 'notes',
    'priceAmount', 'priceCur', 'priceUnit', 'priceNote',
    'image',
  ]);
  let mat;
  try {
    mat = await prisma.lAMaterial.update({ where: { id: owned.id }, data });
  } catch (eUpdate) {
    console.error('[team-workbench] updateMaterial failed:', eUpdate?.message || eUpdate);
    return res.status(500).json({ error: `[update] ${eUpdate?.message || '更新失败'}` });
  }
  res.json(mat);
}));

// POST /api/teams/:teamId/materials/:id/image —— 上传/替换材料参考图
// multipart form-data, field "file";写入材料的 image 字段
router.post('/materials/:id/image', (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) return multerError(res, err);
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
      res.json({ id: updated.id, url, bytes: updated.bytes });
    } catch (e) {
      console.error('[team-workbench] upload material image failed:', e);
      res.status(500).json({ error: `上传失败: ${e.message}` });
    }
  });
});

// POST /api/teams/:teamId/materials/:id/color-image —— 上传某色卡单图
// multipart form-data: file(field="file"), body.idx(色卡 index, 可选, 默认 push 末尾)
// 写入材料的 colorImages[idx].url
router.post('/materials/:id/color-image', (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) return multerError(res, err);
    if (!req.file) return res.status(400).json({ error: 'no file' });
    const owned = await findOwned(prisma.lAMaterial, req.params.id, req.team.id);
    if (!owned) return res.status(404).json({ error: 'not found' });
    const idx = Number.parseInt(req.body?.idx, 10);
    const safeIdx = Number.isInteger(idx) && idx >= 0 ? idx : undefined;
    const savePath = createSavePath(`materials/${req.team.id}`, req.file.filename);
    try {
      await saveUpload(req.file.path, savePath, req.file.mimetype);
      const url = getPublicUrl(savePath);
      const list = Array.isArray(owned.colorImages) ? [...owned.colorImages] : [];
      const entry = list[safeIdx] ? { ...list[safeIdx] } : { hex: '', url: '' };
      entry.url = url;
      if (safeIdx === undefined) list.push(entry); else list[safeIdx] = entry;
      // 补齐到 safeIdx 长度(null→空对象占位),避免稀疏
      if (safeIdx !== undefined) while (list.length <= safeIdx) list.push({ hex: '', url: '' });
      const updated = await prisma.lAMaterial.update({ where: { id: owned.id }, data: { colorImages: list } });
      res.json({ id: updated.id, idx: safeIdx ?? list.length - 1, url });
    } catch (e) {
      console.error('[team-workbench] upload material color-image failed:', e);
      res.status(500).json({ error: `上传失败: ${e.message}` });
    }
  });
});

// DELETE /api/teams/:teamId/materials/:id/color-image —— 移除某色卡
// body.idx(色卡 index) → 删除该项
router.delete('/materials/:id/color-image', asyncHandler(async (req, res) => {
  const owned = await findOwned(prisma.lAMaterial, req.params.id, req.team.id);
  if (!owned) return res.status(404).json({ error: 'not found' });
  const idx = Number.parseInt(req.body?.idx, 10);
  if (!Number.isInteger(idx) || idx < 0) return res.status(400).json({ error: 'invalid idx' });
  const list = Array.isArray(owned.colorImages) ? owned.colorImages : [];
  // 先取被删色卡的 url(在 filter 之前),再更新,最后异步清 COS。
  const removedUrl = list[idx] && typeof list[idx] === 'object' ? list[idx].url : null;
  const newList = list.filter((_, i) => i !== idx);
  const updated = await prisma.lAMaterial.update({ where: { id: owned.id }, data: { colorImages: newList } });
  if (removedUrl && typeof removedUrl === 'string') {
    deleteImageByUrl(removedUrl).catch((e) =>
      console.warn(`[team-workbench] material ${owned.id} color-image COS cleanup failed: ${e?.message || e}`));
  }
  res.json({ ok: true, id: updated.id, colorImages: updated.colorImages });
}));

// PATCH /api/teams/:teamId/materials/:id/share —— 管理员开关 shared(跨团队共享)
// body.shared = true|false;仅管理员可调用;共享项仅管理员可改可删
router.patch('/materials/:id/share', asyncHandler(async (req, res) => {
  if (!await isAdminUserId(req.userId)) return res.status(403).json({ error: '仅管理员可共享' });
  const owned = await findOwned(prisma.lAMaterial, req.params.id, req.team.id);
  if (!owned) return res.status(404).json({ error: 'not found' });
  const shared = !!req.body?.shared;
  const updated = await prisma.lAMaterial.update({
    where: { id: owned.id },
    data: { shared, sharedById: shared ? req.userId : null },
  });
  res.json(updated);
}));

router.delete('/materials/:id', asyncHandler(async (req, res) => {
  const owned = await findOwned(prisma.lAMaterial, req.params.id, req.team.id);
  if (!owned) return res.status(404).json({ error: 'not found' });
  // 收集面料持有的图片(image + colorImages[].url),再删记录,最后异步清 COS(失败仅记日志,不阻塞/回退)。
  // colorImages 里的 url 是面料专属色卡(上传时 createSavePath(materials/...)),可随面料一起删除。
  const imageUrls = collectMaterialImageUrls(owned);
  await prisma.lAMaterial.delete({ where: { id: owned.id } });
  if (imageUrls.length) {
    Promise.allSettled(imageUrls.map((u) => deleteImageByUrl(u)))
      .then((results) => {
        for (const r of results) {
          if (r.status === 'rejected') {
            console.warn(`[team-workbench] material ${owned.id} COS cleanup failed: ${r.reason?.message || r.reason}`);
          }
        }
      });
  }
  res.json({ ok: true });
}));

/* ─── styles (款式参考图) ─────────────────────────────────────── */

router.get('/styles', asyncHandler(async (req, res) => {
  const { category } = req.query;
  const teamId = req.team.id;
  // 合并「本 team」+「管理员共享(shared=true)」,让所有用户可用
  const where = { OR: [{ teamId }, { shared: true }] };
  if (category && category !== 'all') {
    where.OR = where.OR.map((c) => ({ ...c, category: String(category) }));
  }
  const rows = await prisma.lAStyle.findMany({ where, orderBy: [{ category: 'asc' }, { name: 'asc' }] });
  res.json(rows);
}));

router.post('/styles', asyncHandler(async (req, res) => {
  const data = pickDefined(req.body ?? {}, ['slug', 'name', 'category', 'tags', 'image']);
  if (!data.name || !data.category) return res.status(400).json({ error: 'name,category required' });
  if (!data.slug) data.slug = `${slugify(data.name)}-${crypto.randomUUID().slice(0, 6)}`;
  const style = await prisma.lAStyle.create({
    data: {
      teamId: req.team.id,
      slug: String(data.slug),
      name: String(data.name),
      category: String(data.category),
      tags: Array.isArray(data.tags) ? data.tags : [],
      image: data.image || null,
    },
  });
  res.status(201).json(style);
}));

router.patch('/styles/:id', asyncHandler(async (req, res) => {
  const owned = await findOwned(prisma.lAStyle, req.params.id, req.team.id);
  if (!owned) return res.status(404).json({ error: 'not found' });
  const data = pickDefined(req.body ?? {}, ['slug', 'name', 'category', 'tags', 'image']);
  if (data.tags !== undefined) data.tags = Array.isArray(data.tags) ? data.tags : [];
  const style = await prisma.lAStyle.update({ where: { id: owned.id }, data });
  res.json(style);
}));

// POST /api/teams/:teamId/styles/:id/image —— 上传/替换款式参考图
router.post('/styles/:id/image', (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) return multerError(res, err);
    if (!req.file) return res.status(400).json({ error: 'no file' });
    const owned = await findOwned(prisma.lAStyle, req.params.id, req.team.id);
    if (!owned) return res.status(404).json({ error: 'not found' });
    try {
      const savePath = createSavePath(`styles/${req.team.id}`, req.file.filename);
      await saveUpload(req.file.path, savePath, req.file.mimetype);
      const url = getPublicUrl(savePath);
      const updated = await prisma.lAStyle.update({ where: { id: owned.id }, data: { image: url } });
      res.json({ id: updated.id, url });
    } catch (e) {
      console.error('[team-workbench] upload style image failed:', e);
      res.status(500).json({ error: `上传失败: ${e.message}` });
    }
  });
});

// PATCH /api/teams/:teamId/styles/:id/share —— 管理员开关 shared(跨团队共享)
// body.shared = true|false;仅管理员可调用;共享项仅管理员可改可删
router.patch('/styles/:id/share', asyncHandler(async (req, res) => {
  if (!await isAdminUserId(req.userId)) return res.status(403).json({ error: '仅管理员可共享' });
  const owned = await findOwned(prisma.lAStyle, req.params.id, req.team.id);
  if (!owned) return res.status(404).json({ error: 'not found' });
  const shared = !!req.body?.shared;
  const updated = await prisma.lAStyle.update({
    where: { id: owned.id },
    data: { shared, sharedById: shared ? req.userId : null },
  });
  res.json(updated);
}));

router.delete('/styles/:id', asyncHandler(async (req, res) => {
  const owned = await findOwned(prisma.lAStyle, req.params.id, req.team.id);
  if (!owned) return res.status(404).json({ error: 'not found' });
  // 收集款式参考图(image),再删记录,最后异步清 COS(失败仅记日志,不阻塞/回退)。
  const imageUrls = typeof owned.image === 'string' && owned.image ? [owned.image] : [];
  await prisma.lAStyle.delete({ where: { id: owned.id } });
  if (imageUrls.length) {
    Promise.allSettled(imageUrls.map((u) => deleteImageByUrl(u)))
      .then((results) => {
        for (const r of results) {
          if (r.status === 'rejected') {
            console.warn(`[team-workbench] style ${owned.id} COS cleanup failed: ${r.reason?.message || r.reason}`);
          }
        }
      });
  }
  res.json({ ok: true });
}));

/* ─── illustrations(插画:用户上传,可印/刺绣到衣服上) ───────────── */

router.get('/illustrations', asyncHandler(async (req, res) => {
  const where = { teamId: req.team.id };
  try {
    const rows = await prisma.lAIllustrationAsset.findMany({ where, orderBy: [{ createdAt: 'desc' }] });
    res.json(rows);
  } catch (e) {
    // 表尚未就绪(迁移未跑 / 表名修正迁移未应用)→ 返回空,避免首屏报错弹窗
    if (e?.code === 'P2021') {
      console.warn('[team-workbench] illustrations table not ready (P2021), returning empty');
      return res.json([]);
    }
    throw e;
  }
}));

router.post('/illustrations', asyncHandler(async (req, res) => {
  const data = pickDefined(req.body ?? {}, ['slug', 'name', 'tags', 'image']);
  if (!data.name) return res.status(400).json({ error: 'name required' });
  if (!data.slug) data.slug = `${slugify(data.name)}-${crypto.randomUUID().slice(0, 6)}`;
  let item;
  try {
    item = await prisma.lAIllustrationAsset.create({
      data: {
        teamId: req.team.id,
        slug: String(data.slug),
        name: String(data.name),
        tags: Array.isArray(data.tags) ? data.tags : [],
        image: data.image || null,
      },
    });
  } catch (eCreate) {
    // 表尚未就绪(迁移未跑 / 表名修正迁移未应用)→ 静默返回,避免弹窗
    if (eCreate?.code === 'P2021') {
      console.warn('[team-workbench] illustrations table not ready (P2021), create skipped');
      return res.status(503).json({ error: '插画表尚未就绪', code: 'TABLE_NOT_READY' });
    }
    console.error('[team-workbench] createIllustration failed:', eCreate?.message || eCreate);
    return res.status(500).json({ error: `[create] ${eCreate?.message || '创建失败'}` });
  }
  res.status(201).json(item);
}));

router.patch('/illustrations/:id', asyncHandler(async (req, res) => {
  let owned;
  try {
    owned = await findOwned(prisma.lAIllustrationAsset, req.params.id, req.team.id);
  } catch (eFind) {
    if (eFind?.code === 'P2021') {
      console.warn('[team-workbench] illustrations table not ready (P2021), update skipped');
      return res.status(503).json({ error: '插画表尚未就绪', code: 'TABLE_NOT_READY' });
    }
    throw eFind;
  }
  if (!owned) return res.status(404).json({ error: 'not found' });
  const data = pickDefined(req.body ?? {}, ['slug', 'name', 'tags', 'image']);
  if (data.tags !== undefined) data.tags = Array.isArray(data.tags) ? data.tags : [];
  let item;
  try {
    item = await prisma.lAIllustrationAsset.update({ where: { id: owned.id }, data });
  } catch (eUpdate) {
    if (eUpdate?.code === 'P2021') {
      console.warn('[team-workbench] illustrations table not ready (P2021), update skipped');
      return res.status(503).json({ error: '插画表尚未就绪', code: 'TABLE_NOT_READY' });
    }
    console.error('[team-workbench] updateIllustration failed:', eUpdate?.message || eUpdate);
    return res.status(500).json({ error: `[update] ${eUpdate?.message || '更新失败'}` });
  }
  res.json(item);
}));

// POST /api/teams/:teamId/illustrations/:id/image —— 上传/替换插画图
// multipart form-data, field "file";写入 image 字段
router.post('/illustrations/:id/image', (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) return multerError(res, err);
    if (!req.file) return res.status(400).json({ error: 'no file' });
    let owned;
    try {
      owned = await findOwned(prisma.lAIllustrationAsset, req.params.id, req.team.id);
    } catch (eFind) {
      if (eFind?.code === 'P2021') {
        console.warn('[team-workbench] illustrations table not ready (P2021), image upload skipped');
        return res.status(503).json({ error: '插画表尚未就绪', code: 'TABLE_NOT_READY' });
      }
      console.error('[team-workbench] find illustration for image upload failed:', eFind);
      return res.status(500).json({ error: `上传失败: ${eFind.message}` });
    }
    if (!owned) return res.status(404).json({ error: 'not found' });
    try {
      const savePath = createSavePath(`illustrations/${req.team.id}`, req.file.filename);
      await saveUpload(req.file.path, savePath, req.file.mimetype);
      const url = getPublicUrl(savePath);
      const updated = await prisma.lAIllustrationAsset.update({ where: { id: owned.id }, data: { image: url } });
      res.json({ id: updated.id, url });
    } catch (e) {
      if (e?.code === 'P2021') {
        console.warn('[team-workbench] illustrations table not ready (P2021), image upload skipped');
        return res.status(503).json({ error: '插画表尚未就绪', code: 'TABLE_NOT_READY' });
      }
      console.error('[team-workbench] upload illustration image failed:', e);
      res.status(500).json({ error: `上传失败: ${e.message}` });
    }
  });
});

router.delete('/illustrations/:id', asyncHandler(async (req, res) => {
  let owned;
  try {
    owned = await findOwned(prisma.lAIllustrationAsset, req.params.id, req.team.id);
  } catch (eFind) {
    if (eFind?.code === 'P2021') {
      console.warn('[team-workbench] illustrations table not ready (P2021), delete skipped');
      return res.status(503).json({ error: '插画表尚未就绪', code: 'TABLE_NOT_READY' });
    }
    throw eFind;
  }
  if (!owned) return res.status(404).json({ error: 'not found' });
  // 收集插画图片(image),异步清 COS(失败仅记日志,不阻塞/回退),再删记录。
  const imageUrls = typeof owned.image === 'string' && owned.image ? [owned.image] : [];
  if (imageUrls.length) {
    Promise.allSettled(imageUrls.map((u) => deleteImageByUrl(u)))
      .then((results) => {
        for (const r of results) {
          if (r.status === 'rejected') {
            console.warn(`[team-workbench] illustration ${owned.id} COS cleanup failed: ${r.reason?.message || r.reason}`);
          }
        }
      });
  }
  try {
    await prisma.lAIllustrationAsset.delete({ where: { id: owned.id } });
  } catch (eDelete) {
    if (eDelete?.code === 'P2021') {
      console.warn('[team-workbench] illustrations table not ready (P2021), delete skipped');
      return res.status(503).json({ error: '插画表尚未就绪', code: 'TABLE_NOT_READY' });
    }
    throw eDelete;
  }
  res.json({ ok: true });
}));

/* ─── models(服装模特) ─────────────────────────────────────────
 * 用户上传自己品牌的模特,每个模特 1-5 张图 + 形体数据(身高/三围/体重等);
 * 管理员可共享进系统模特库(shared=true → 所有 team 可见可用)。 */

const MAX_MODEL_IMAGES = 5;

// 收集模特的所有图片 URL(images[]),供删除时级联清 COS。
function collectModelImageUrls(m) {
  return Array.isArray(m?.images) ? m.images.filter((u) => typeof u === 'string') : [];
}

router.get('/models', asyncHandler(async (req, res) => {
  const teamId = req.team.id;
  // 合并「本 team」+「管理员共享(shared=true)」,让所有用户可用系统模特库
  const rows = await prisma.lAModel.findMany({
    where: { OR: [{ teamId }, { shared: true }] },
    orderBy: [{ createdAt: 'desc' }],
  });
  res.json(rows);
}));

router.post('/models', asyncHandler(async (req, res) => {
  const data = pickDefined(req.body ?? {}, [
    'slug', 'name', 'height', 'weight', 'bust', 'waist', 'hip', 'shoes', 'tags', 'images',
  ]);
  if (!data.name) return res.status(400).json({ error: 'name required' });
  if (!data.slug) data.slug = `${slugify(data.name)}-${crypto.randomUUID().slice(0, 6)}`;
  // images 必为字符串数组且不超过上限
  let images = [];
  if (Array.isArray(data.images)) {
    images = data.images.filter((u) => typeof u === 'string').slice(0, MAX_MODEL_IMAGES);
  }
  const model = await prisma.lAModel.create({
    data: {
      teamId: req.team.id,
      slug: String(data.slug),
      name: String(data.name),
      height: data.height != null ? Number(data.height) : null,
      weight: data.weight != null ? Number(data.weight) : null,
      bust: data.bust != null ? Number(data.bust) : null,
      waist: data.waist != null ? Number(data.waist) : null,
      hip: data.hip != null ? Number(data.hip) : null,
      shoes: data.shoes != null ? Number(data.shoes) : null,
      tags: Array.isArray(data.tags) ? data.tags : [],
      images,
    },
  });
  res.status(201).json(model);
}));

router.patch('/models/:id', asyncHandler(async (req, res) => {
  const owned = await findOwned(prisma.lAModel, req.params.id, req.team.id);
  if (!owned) return res.status(404).json({ error: 'not found' });
  const data = pickDefined(req.body ?? {}, [
    'slug', 'name', 'height', 'weight', 'bust', 'waist', 'hip', 'shoes', 'tags', 'images',
  ]);
  if (data.tags !== undefined) data.tags = Array.isArray(data.tags) ? data.tags : [];
  for (const k of ['height', 'weight', 'bust', 'waist', 'hip', 'shoes']) {
    if (data[k] !== undefined) data[k] = data[k] != null ? Number(data[k]) : null;
  }
  if (data.images !== undefined) {
    data.images = Array.isArray(data.images) ? data.images.filter((u) => typeof u === 'string').slice(0, MAX_MODEL_IMAGES) : [];
  }
  const model = await prisma.lAModel.update({ where: { id: owned.id }, data });
  res.json(model);
}));

// POST /api/teams/:teamId/models/:id/image —— 上传单张模特图(追加到 images,上限 5)
router.post('/models/:id/image', (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) return multerError(res, err);
    if (!req.file) return res.status(400).json({ error: 'no file' });
    const owned = await findOwned(prisma.lAModel, req.params.id, req.team.id);
    if (!owned) return res.status(404).json({ error: 'not found' });
    const current = Array.isArray(owned.images) ? owned.images.filter((u) => typeof u === 'string') : [];
    if (current.length >= MAX_MODEL_IMAGES) {
      return res.status(400).json({ error: `每个模特最多 ${MAX_MODEL_IMAGES} 张图片` });
    }
    try {
      const savePath = createSavePath(`models/${req.team.id}`, req.file.filename);
      await saveUpload(req.file.path, savePath, req.file.mimetype);
      const url = getPublicUrl(savePath);
      const images = [...current, url];
      const updated = await prisma.lAModel.update({ where: { id: owned.id }, data: { images } });
      res.json({ id: updated.id, url, images });
    } catch (e) {
      console.error('[team-workbench] upload model image failed:', e);
      res.status(500).json({ error: `上传失败: ${e.message}` });
    }
  });
});

// DELETE /api/teams/:teamId/models/:id/image —— 删除模特某张图(body.url),级联清 COS
router.delete('/models/:id/image', asyncHandler(async (req, res) => {
  const owned = await findOwned(prisma.lAModel, req.params.id, req.team.id);
  if (!owned) return res.status(404).json({ error: 'not found' });
  const url = req.body?.url;
  if (typeof url !== 'string') return res.status(400).json({ error: 'url required' });
  const current = Array.isArray(owned.images) ? owned.images.filter((u) => typeof u === 'string') : [];
  const images = current.filter((u) => u !== url);
  const updated = await prisma.lAModel.update({ where: { id: owned.id }, data: { images } });
  // 异步清 COS(失败仅记日志,不阻塞/回退)
  deleteImageByUrl(url).catch((e) =>
    console.warn(`[team-workbench] model ${owned.id} COS cleanup failed: ${e?.message || e}`));
  res.json({ ok: true, images: updated.images });
}));

// PATCH /api/teams/:teamId/models/:id/share —— 管理员开关 shared(共享进系统模特库)
router.patch('/models/:id/share', asyncHandler(async (req, res) => {
  if (!await isAdminUserId(req.userId)) return res.status(403).json({ error: '仅管理员可共享' });
  const owned = await findOwned(prisma.lAModel, req.params.id, req.team.id);
  if (!owned) return res.status(404).json({ error: 'not found' });
  const shared = !!req.body?.shared;
  const updated = await prisma.lAModel.update({
    where: { id: owned.id },
    data: { shared, sharedById: shared ? req.userId : null },
  });
  res.json(updated);
}));

router.delete('/models/:id', asyncHandler(async (req, res) => {
  const owned = await findOwned(prisma.lAModel, req.params.id, req.team.id);
  if (!owned) return res.status(404).json({ error: 'not found' });
  const imageUrls = collectModelImageUrls(owned);
  await prisma.lAModel.delete({ where: { id: owned.id } });
  if (imageUrls.length) {
    Promise.allSettled(imageUrls.map((u) => deleteImageByUrl(u)))
      .then((results) => {
        for (const r of results) {
          if (r.status === 'rejected') {
            console.warn(`[team-workbench] model ${owned.id} COS cleanup failed: ${r.reason?.message || r.reason}`);
          }
        }
      });
  }
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

// ─── 产品图片 URL 收集(用于删除时级联清 COS) ────────────────
// 仅收集「产品自己持有」的图片,不碰 sourceImages —— sourceImages 里的 style/fabric url
// 指向共享素材/款式资源(被多个产品引用),删除会连带破坏其他产品的参考图。
function collectProductImageUrls(p) {
  if (!p) return [];
  const urls = [];
  const maybePush = (v) => { if (typeof v === 'string' && v) urls.push(v); };

  maybePush(p.imageUrl);
  maybePush(p.patternUrl);
  maybePush(p.techPackUrl);
  maybePush(p.patternFinalUrl);

  // images: 设计工作流生成的图片数组 [{slot, label, url, originalUrl?}]
  if (Array.isArray(p.images)) {
    for (const im of p.images) {
      if (!im || typeof im !== 'object') continue;
      maybePush(im.url);
      maybePush(im.originalUrl);
    }
  }
  // 注意:跳过 sourceImages —— 它们是共享素材/款式资源的引用,不归本产品独享。
  return urls;
}

// ─── 面料图片 URL 收集(用于删除面料 / 删除色卡时级联清 COS) ──
// colorImages 是面料专属色卡(上传时 createSavePath(materials/{teamId}/...)),归面料持有,可随面料删除。
// 注意:不收集 colorImages[].hex 等非 url 字段。
function collectMaterialImageUrls(m) {
  if (!m) return [];
  const urls = [];
  const maybePush = (v) => { if (typeof v === 'string' && v) urls.push(v); };
  maybePush(m.image);
  if (Array.isArray(m.colorImages)) {
    for (const ci of m.colorImages) {
      if (!ci || typeof ci !== 'object') continue;
      maybePush(ci.url);
    }
  }
  return urls;
}

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
      // 生成图来源(与 images 按索引对齐):每张效果图的款式图 / 面料图(仅库来源有值,上传为 undefined)
      sourceImages: Array.isArray(data.sourceImages) ? data.sourceImages : [],
      html: typeof data.html === 'string' ? data.html : null,
      aiDraftRaw: data.aiDraftRaw || null,
      imageUrl: data.imageUrl || null,
      sections: data.sections && typeof data.sections === 'object' ? data.sections : null,
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
  // 空字符串 imageUrl 视为清除
  if ('imageUrl' in update && !update.imageUrl) update.imageUrl = null;
  const p = await prisma.lAProduct.update({ where: { id: owned.id }, data: update });
  res.json(p);
}));

// POST /api/teams/:teamId/products/outfits —— 将一条穿搭效果图追加到多个参与单品的 outfits 字段
// body:{ productIds:string[], outfit:{ id, url, originalUrl?, model, products, note?, createdAt } }
// 仅 team 自己拥有的单品可被写入;返回写入成功的产品 id 列表。
router.post('/products/outfits', asyncHandler(async (req, res) => {
  const productIds = Array.isArray(req.body?.productIds) ? req.body.productIds : [];
  const outfit = req.body?.outfit;
  if (!productIds.length || !outfit || !outfit.url) {
    return res.status(400).json({ error: 'productIds 与 outfit.url 必填' });
  }
  const teamId = req.team.id;
  const updatedIds = [];
  for (const pid of productIds) {
    const owned = await findOwned(prisma.lAProduct, pid, teamId);
    if (!owned) continue; // 跳过不存在或不属于本 team 的
    const outfits = Array.isArray(owned.outfits) ? owned.outfits : [];
    outfits.push(outfit);
    await prisma.lAProduct.update({ where: { id: owned.id }, data: { outfits } });
    updatedIds.push(owned.id);
  }
  res.json({ ok: true, updatedIds });
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

// POST /api/teams/:teamId/products/:id/image — multipart form-data, field "file"
// 可选 field "slot":
//   无 slot → 上传主图(slot="main"):图片默认主图;若已有主图则旧主图降级为效果图(render),
//     实现主图互换,imageUrl 同步为当前主图 url(派生兼容字段)。
//   有 slot → 替换 images[] 中对应 slot 的 url(线稿/效果图单张替换);找不到则追加一条。
// 返回更新后的产品。
const MAIN_SLOT = "main";
const RENDER_SLOT = "render";
router.post('/products/:id/image', (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) return multerError(res, err);
    if (!req.file) return res.status(400).json({ error: 'no file' });
    try {
      const owned = await findOwned(prisma.lAProduct, req.params.id, req.team.id);
      if (!owned) return res.status(404).json({ error: 'not found' });
      const savePath = createSavePath(`products/${req.team.id}`, req.file.filename);
      await saveUpload(req.file.path, savePath, req.file.mimetype);
      const url = getPublicUrl(savePath);

      const slot = req.body?.slot?.toString().trim();
      let p;
      if (slot) {
        // 替换 images[] 中对应 slot 的 url;找不到则追加一条
        const imgs = Array.isArray(owned.images) ? owned.images.map((im) => ({ ...im })) : [];
        const idx = imgs.findIndex((im) => im && im.slot === slot);
        if (idx >= 0) imgs[idx] = { ...imgs[idx], url };
        else imgs.push({ slot, label: slot, url });
        p = await prisma.lAProduct.update({ where: { id: owned.id }, data: { images: imgs } });
      } else {
        // 无 slot → 主图:已有主图则降级为 render,再追加新主图(原子互换);同步 imageUrl
        const imgs = (Array.isArray(owned.images) ? owned.images : [])
          .map((im) => (im && im.slot === MAIN_SLOT ? { ...im, slot: RENDER_SLOT } : im));
        const label = req.body?.label?.toString().trim() || "主图";
        imgs.push({ slot: MAIN_SLOT, label, url });
        p = await prisma.lAProduct.update({ where: { id: owned.id }, data: { images: imgs, imageUrl: url } });
      }
      res.status(201).json(p);
    } catch (e) {
      console.error('[team-workbench] product image save failed:', e);
      res.status(500).json({ error: `写入失败: ${e.message}` });
    }
  });
});

// POST /api/teams/:teamId/products/:id/status
// 自由切换到任意合法状态(前端下拉),追加 history 条目。body: { status, note? }
const PRODUCT_STATUSES = new Set([
  'draft','submitted','proto1','proto1_done','proto2','proto2_done',
  'bulk','bulk_done','finished','pending_list','live',
]);
router.post('/products/:id/status', async (req, res) => {
  const owned = await findOwned(prisma.lAProduct, req.params.id, req.team.id);
  if (!owned) return res.status(404).json({ error: 'not found' });
  const status = String(req.body.status || '');
  if (!PRODUCT_STATUSES.has(status)) return res.status(400).json({ error: `非法状态: ${status}` });
  const entry = {
    id: crypto.randomUUID(),
    status,
    at: new Date().toISOString(),
    actor: 'atelier',
    note: req.body.note || null,
  };
  const p = await prisma.lAProduct.update({
    where: { id: owned.id },
    data: { status, statusHistory: [...(owned.statusHistory || []), entry] },
  });
  res.json(p);
});

router.delete('/products/:id', asyncHandler(async (req, res) => {
  const owned = await findOwned(prisma.lAProduct, req.params.id, req.team.id);
  if (!owned) return res.status(404).json({ error: 'not found' });
  // 先收集本产品持有的图片 URL(删除后字段就没了),再删记录,最后异步清 COS。
  // COS 清理失败只记日志,不阻塞/回滚删除本身(记录已删,前端不再引用这些 URL)。
  const imageUrls = collectProductImageUrls(owned);
  await prisma.lAProduct.delete({ where: { id: owned.id } });
  if (imageUrls.length) {
    // fire-and-forget:不 await,避免 COS 抖动拖慢/阻塞删除响应
    Promise.allSettled(imageUrls.map((u) => deleteImageByUrl(u)))
      .then((results) => {
        for (const r of results) {
          if (r.status === 'rejected') {
            console.warn(`[team-workbench] product ${owned.id} COS cleanup failed: ${r.reason?.message || r.reason}`);
          }
        }
      });
  }
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

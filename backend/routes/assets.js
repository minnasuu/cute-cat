const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// 管理员邮箱白名单（与前端/其它路由保持一致）
const ADMIN_EMAILS = ['minhansu508@gmail.com'];

router.use(authMiddleware);

async function isAdminUserId(userId) {
  if (!userId) return false;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  return !!u?.email && ADMIN_EMAILS.includes(String(u.email).toLowerCase());
}

function parseScope(raw) {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (s === 'official' || s === 'mine' || s === 'all') return s;
  return 'all';
}

// ======================== Styles (design vibe) ========================

router.get('/styles', async (req, res) => {
  try {
    const scope = parseScope(req.query.scope);
    const aiEnabledOnly =
      req.query.aiEnabled === 'true' || req.query.aiEnabled === true;

    const where = {};
    if (scope === 'official') {
      where.isOfficial = true;
    } else if (scope === 'mine') {
      where.userId = req.userId;
    } else {
      // all = 官方 + 我的上传（不暴露他人私有资产）
      where.OR = [{ isOfficial: true }, { userId: req.userId }];
    }
    if (aiEnabledOnly) where.aiEnabled = true;

    const items = await prisma.vibeStyleItem.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: { items } });
  } catch (err) {
    console.error('[assets/styles] list error:', err);
    res.status(500).json({ success: false, error: '获取风格资产失败' });
  }
});

router.post('/styles', async (req, res) => {
  try {
    const { imageUrl, tags, colors, summary, designSummary, designPrompt, ownerName, aiEnabled } =
      req.body || {};
    if (!imageUrl || !designSummary || !designPrompt) {
      return res.status(400).json({ success: false, error: '缺少必要字段' });
    }

    const admin = await isAdminUserId(req.userId);
    const item = await prisma.vibeStyleItem.create({
      data: {
        userId: req.userId,
        isOfficial: admin,
        aiEnabled: typeof aiEnabled === 'boolean' ? aiEnabled : true,
        imageUrl,
        tags: Array.isArray(tags) ? tags : [],
        colors: Array.isArray(colors) ? colors : [],
        summary: typeof summary === 'string' ? summary : '',
        designSummary,
        designPrompt: String(designPrompt).trim(),
        ownerName: typeof ownerName === 'string' ? ownerName : '',
      },
    });

    res.json({ success: true, data: item });
  } catch (err) {
    console.error('[assets/styles] create error:', err);
    res.status(500).json({ success: false, error: '创建风格资产失败' });
  }
});

router.put('/styles/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const item = await prisma.vibeStyleItem.findUnique({ where: { id } });
    if (!item) return res.status(404).json({ success: false, error: '风格资产不存在' });

    const admin = await isAdminUserId(req.userId);
    const isOwner = item.userId && item.userId === req.userId;
    if (!admin && !isOwner) {
      return res.status(403).json({ success: false, error: '无权修改该资产' });
    }

    const { tags, colors, summary, designSummary, designPrompt, ownerName, aiEnabled } =
      req.body || {};

    const updated = await prisma.vibeStyleItem.update({
      where: { id },
      data: {
        ...(Array.isArray(tags) ? { tags } : {}),
        ...(Array.isArray(colors) ? { colors } : {}),
        ...(typeof summary === 'string' ? { summary } : {}),
        ...(designSummary ? { designSummary } : {}),
        ...(typeof designPrompt === 'string' ? { designPrompt: designPrompt.trim() } : {}),
        ...(typeof ownerName === 'string' ? { ownerName } : {}),
        ...(typeof aiEnabled === 'boolean' ? { aiEnabled } : {}),
      },
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    console.error('[assets/styles] update error:', err);
    res.status(500).json({ success: false, error: '更新风格资产失败' });
  }
});

router.delete('/styles/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const item = await prisma.vibeStyleItem.findUnique({ where: { id } });
    if (!item) return res.status(404).json({ success: false, error: '风格资产不存在' });

    const admin = await isAdminUserId(req.userId);
    const isOwner = item.userId && item.userId === req.userId;
    if (!admin && !isOwner) {
      return res.status(403).json({ success: false, error: '无权删除该资产' });
    }

    await prisma.vibeStyleItem.delete({ where: { id } });
    res.json({ success: true, data: { id } });
  } catch (err) {
    console.error('[assets/styles] delete error:', err);
    res.status(500).json({ success: false, error: '删除风格资产失败' });
  }
});

// ======================== Fonts ========================

function ensureDir(absPath) {
  fs.mkdirSync(absPath, { recursive: true });
}

const fontsAbsDir = path.join(__dirname, '..', 'uploads', 'vibe-assets', 'fonts');
ensureDir(fontsAbsDir);

const fontUploadStorage = multer.diskStorage({
  destination(_req, _file, cb) {
    cb(null, fontsAbsDir);
  },
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname || '').slice(0, 12) || '.woff2';
    cb(null, `${crypto.randomUUID()}-${Date.now()}${ext}`);
  },
});

const fontUpload = multer({
  storage: fontUploadStorage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
  fileFilter(_req, file, cb) {
    const okMime = [
      'font/ttf',
      'font/otf',
      'font/woff',
      'font/woff2',
      'application/font-woff',
      'application/font-woff2',
      'application/x-font-ttf',
      'application/x-font-opentype',
      'application/octet-stream', // 部分浏览器会这样上报
    ].includes(file.mimetype);
    const okExt = /\.(ttf|otf|woff|woff2)$/i.test(file.originalname || '');
    if (okMime || okExt) return cb(null, true);
    return cb(new Error('仅支持上传 .ttf/.otf/.woff/.woff2 字体文件'));
  },
});

router.post('/fonts/upload', (req, res) => {
  fontUpload.single('file')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ success: false, error: '字体文件过大（最大 25MB）' });
      }
      return res.status(400).json({ success: false, error: err.message || '上传失败' });
    }
    if (!req.file) return res.status(400).json({ success: false, error: '请选择字体文件' });
    const url = `/uploads/vibe-assets/fonts/${req.file.filename}`;
    res.json({
      success: true,
      data: {
        url,
        filename: req.file.filename,
        mimeType: req.file.mimetype || 'application/octet-stream',
        sizeBytes: req.file.size || 0,
      },
    });
  });
});

router.get('/fonts', async (req, res) => {
  try {
    const scope = parseScope(req.query.scope);
    const aiEnabledOnly =
      req.query.aiEnabled === 'true' || req.query.aiEnabled === true;

    const where = {};
    if (scope === 'official') {
      where.isOfficial = true;
    } else if (scope === 'mine') {
      where.userId = req.userId;
    } else {
      where.OR = [{ isOfficial: true }, { userId: req.userId }];
    }
    if (aiEnabledOnly) where.aiEnabled = true;

    const items = await prisma.vibeFontAsset.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: { items } });
  } catch (err) {
    console.error('[assets/fonts] list error:', err);
    res.status(500).json({ success: false, error: '获取字体资产失败' });
  }
});

router.post('/fonts', async (req, res) => {
  try {
    const { fileUrl, filename, mimeType, sizeBytes, family, tags, aiEnabled } =
      req.body || {};
    if (!fileUrl || !filename) {
      return res.status(400).json({ success: false, error: '缺少 fileUrl 或 filename' });
    }

    const admin = await isAdminUserId(req.userId);
    const item = await prisma.vibeFontAsset.create({
      data: {
        userId: req.userId,
        isOfficial: admin,
        aiEnabled: typeof aiEnabled === 'boolean' ? aiEnabled : true,
        fileUrl: String(fileUrl).trim(),
        filename: String(filename).trim(),
        mimeType: typeof mimeType === 'string' && mimeType.trim() ? mimeType.trim() : 'application/octet-stream',
        sizeBytes: Number.isFinite(Number(sizeBytes)) ? Number(sizeBytes) : 0,
        family: typeof family === 'string' ? family.trim() : '',
        tags: Array.isArray(tags) ? tags : [],
      },
    });

    res.json({ success: true, data: item });
  } catch (err) {
    console.error('[assets/fonts] create error:', err);
    res.status(500).json({ success: false, error: '创建字体资产失败' });
  }
});

router.put('/fonts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const item = await prisma.vibeFontAsset.findUnique({ where: { id } });
    if (!item) return res.status(404).json({ success: false, error: '字体资产不存在' });

    const admin = await isAdminUserId(req.userId);
    const isOwner = item.userId && item.userId === req.userId;
    if (!admin && !isOwner) {
      return res.status(403).json({ success: false, error: '无权修改该资产' });
    }

    const { family, tags, aiEnabled } = req.body || {};
    const updated = await prisma.vibeFontAsset.update({
      where: { id },
      data: {
        ...(typeof family === 'string' ? { family: family.trim() } : {}),
        ...(Array.isArray(tags) ? { tags } : {}),
        ...(typeof aiEnabled === 'boolean' ? { aiEnabled } : {}),
      },
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    console.error('[assets/fonts] update error:', err);
    res.status(500).json({ success: false, error: '更新字体资产失败' });
  }
});

router.delete('/fonts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const item = await prisma.vibeFontAsset.findUnique({ where: { id } });
    if (!item) return res.status(404).json({ success: false, error: '字体资产不存在' });

    const admin = await isAdminUserId(req.userId);
    const isOwner = item.userId && item.userId === req.userId;
    if (!admin && !isOwner) {
      return res.status(403).json({ success: false, error: '无权删除该资产' });
    }

    await prisma.vibeFontAsset.delete({ where: { id } });
    res.json({ success: true, data: { id } });
  } catch (err) {
    console.error('[assets/fonts] delete error:', err);
    res.status(500).json({ success: false, error: '删除字体资产失败' });
  }
});

module.exports = router;


const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.use(authMiddleware);

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function safeExtFromMime(mimetype) {
  if (mimetype === 'image/jpeg') return '.jpg';
  if (mimetype === 'image/png') return '.png';
  if (mimetype === 'image/webp') return '.webp';
  if (mimetype === 'image/gif') return '.gif';
  if (mimetype === 'image/svg+xml') return '.svg';
  return '';
}

const storage = multer.diskStorage({
  destination(req, _file, cb) {
    const runId = typeof req.body?.runId === 'string' && req.body.runId.trim() ? req.body.runId.trim() : null;
    const userId = String(req.userId || 'anonymous');
    const rel = runId ? path.join('uploads', userId, runId) : path.join('uploads', userId);
    const abs = path.join(__dirname, '..', rel);
    try {
      ensureDir(abs);
      cb(null, abs);
    } catch (err) {
      cb(err);
    }
  },
  filename(_req, file, cb) {
    const extFromName = path.extname(file.originalname || '').slice(0, 12);
    const ext = extFromName || safeExtFromMime(file.mimetype) || '';
    const name = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter(_req, file, cb) {
    if (!file.mimetype || !file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image uploads are allowed'));
    }
    cb(null, true);
  },
});

router.post('/image', upload.single('image'), async (req, res) => {
  try {
    const f = req.file;
    if (!f) return res.status(400).json({ error: '缺少图片文件 image' });

    // f.path: absolute path, we need a public URL under /uploads
    const absUploadsRoot = path.join(__dirname, '..', 'uploads') + path.sep;
    const absFile = f.path;
    if (!absFile.startsWith(absUploadsRoot)) {
      return res.status(500).json({ error: '上传路径异常' });
    }
    const rel = absFile.slice(absUploadsRoot.length).split(path.sep).join('/');
    const url = `/uploads/${rel}`;
    res.json({ url });
  } catch (err) {
    console.error('[uploads] image error:', err);
    res.status(500).json({ error: '图片上传失败' });
  }
});

module.exports = router;


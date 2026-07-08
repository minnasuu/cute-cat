const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { authMiddleware } = require('../middleware/auth');
const storage = require('../lib/storage');
const { createSavePath, saveUpload, getPublicUrl, TMP_DIR } = storage;

const router = express.Router();

router.use(authMiddleware);

function safeExtFromMime(mimetype) {
  if (mimetype === 'image/jpeg') return '.jpg';
  if (mimetype === 'image/png') return '.png';
  if (mimetype === 'image/webp') return '.webp';
  if (mimetype === 'image/gif') return '.gif';
  if (mimetype === 'image/svg+xml') return '.svg';
  return '';
}

// 所有上传先落到 tmp,由后续 saveUpload 路由到最终位置(本地或 S3),避免容器重建丢文件
const upload = multer({
  storage: multer.diskStorage({
    destination(_req, _file, cb) {
      fs.mkdirSync(TMP_DIR, { recursive: true });
      cb(null, TMP_DIR);
    },
    filename(_req, file, cb) {
      const extFromName = path.extname(file.originalname || '').slice(0, 12);
      const ext = extFromName || safeExtFromMime(file.mimetype) || '';
      const name = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
      cb(null, name);
    },
  }),
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
    const runId = typeof req.body?.runId === 'string' && req.body.runId.trim() ? req.body.runId.trim() : null;
    const folder = runId ? `workflow/${String(req.userId || 'anonymous')}/${runId}` : `workflow/${String(req.userId || 'anonymous')}`;

    const savePath = createSavePath(folder, f.filename);
    await saveUpload(f.path, savePath, f.mimetype);
    const url = getPublicUrl(savePath);
    res.json({ url });
  } catch (err) {
    console.error('[uploads] image error:', err);
    res.status(500).json({ error: '图片上传失败' });
  }
});

module.exports = router;

/**
 * storage.js —— 上传文件存储适配层。
 *
 * 两种后端:
 *   1. 'local' (默认,无额外 env) → 写入 backend/uploads/<folder>/<filename>,URL=/uploads/<folder>/<filename>
 *   2. 's3' (配 S3_* env)      → 写入 S3 兼容 bucket(R2/OSS/智谱 OSS/MinIO/AWS S3),
 *                                  URL 由 S3_PUBLIC_BASE_URL 拼接,本地不再存
 *
 * 用法(与 multer storage 搭配):
 *   const { createSavePath, getPublicUrl, saveUpload, default: storage } = require('./storage');
 *   const storage = multer.diskStorage({
 *     destination: (req, file, cb) => cb(null, storage.tmpDir),
 *     filename:   (req, file, cb) => { ... cb(null, uniqueName) },
 *   });
 *   // 上传完成后主动把文件落到最终位置:
 *   await saveUpload(absTmpPath, storage.createSavePath(folder, filename));
 *
 * 环境变量(s3 模式):
 *   S3_ENDPOINT        e.g. https://<account>.r2.cloudflarestorage.com   (R2) 或 https://oss-cn-beijing.aliyuncs.com (OSS)
 *   S3_BUCKET          bucket 名
 *   S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY
 *   S3_PUBLIC_BASE_URL e.g. https://cdn.example.com  或 https://<public>.r2.dev/<bucket>
 *   S3_FOLDER_PREFIX   optional, e.g. cute-cat
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');

/**
 * 解析上传根目录 —— 运行时探测,兼容两种部署目录结构:
 *   本地开发 / minna 部署:卷挂载在 /app/backend/uploads
 *   cucatopia 部署:        卷挂载在 /app/backend/uploads (index.js 在 /app/)
 * 返回已存在且有数据的目录(优先卷挂载点);都不存在时建在卷挂载位(首轮部署)。
 *
 * 导出供 index.js 静态服务使用 → 读写走同一路径,消除错位 404。
 */
function resolveUploadRoot() {
  const candidates = [
    '/app/backend/uploads', // minna 部署 / cucatopia 部署 / 本地开发:卷挂载点
    path.join(__dirname, '..', 'uploads'), // 兜底推算(本地开发非标准结构)
  ];
  // 优先返回已存在且有数据的目录(容器重启后命名卷数据仍在)
  for (const c of candidates) {
    try {
      if (fs.existsSync(c) && fs.statSync(c).isDirectory()) {
        // 有数据(至少一个子项)→ 认定是卷挂载点
        let entries;
        try { entries = fs.readdirSync(c); } catch { continue; }
        if (entries.length > 0) return c;
      }
    } catch { /* skip */ }
  }
  // 都不存在/都为空 → 选卷挂载位(创建目录,命名卷首次启动时落到卷里)
  const primary = candidates[0];
  try { fs.mkdirSync(primary, { recursive: true }); } catch { /* 不可写则回退 */ }
  return primary;
}

const UPLOAD_ROOT = resolveUploadRoot();
const TMP_DIR = path.join(UPLOAD_ROOT, '.tmp');

const mode = (process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY) ? 's3' : 'local';

// ─── local ───────────────────────────────────────────────────
function localSave(buf, relPath) {
  const abs = path.join(UPLOAD_ROOT, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, buf);
}
function localPublicUrl(relPath) {
  // relPath 不含 'uploads/' 前缀,静态挂载在 /uploads → UPLOAD_ROOT,这里要补齐
  return `/uploads/${relPath.split(path.sep).join('/')}`;
}
/** 清洗一个路径 segment:移除非安全字符(保留中文),单个 segment 限长 60。 */
function cleanSegment(seg) {
  return String(seg || '').replace(/[^a-zA-Z0-9_一-龥-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

/** 清洗 folder 路径:按 '/' 分段、逐段清洗后再拼回(保留层级,不压扁)。 */
function cleanFolderPath(folder) {
  const segs = String(folder || 'misc').split('/').map(cleanSegment).filter(Boolean);
  return segs.length ? segs.join('/') : 'misc';
}

function createLocalSavePath(folder, filename) {
  // 注意:不含 'uploads/' 前缀——UPLOAD_ROOT 已经是 ../uploads,localSave 做 join(UPLOAD_ROOT, relPath)
  // public URL 前缀 '/' 由 localPublicUrl 统一添加
  return `${cleanFolderPath(folder)}/${filename}`;
}

// ─── s3(SigV4 手写,零依赖) ─────────────────────────────────
const TE = { 'Content-Type': 'application/octet-stream' };

function sha256Hex(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}
function hmac(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest();
}
function uriEncode(str, encodeSlash = true) {
  return str.split('').map((c) => {
    if (/[A-Za-z0-9_.~-]/.test(c)) return c;
    if (c === '/' && !encodeSlash) return '/';
    return '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0');
  }).join('');
}
function canonKey(key) {
  // 去掉前导 /,每个 segment 独立 encode(S3 惯例)
  return key.replace(/^\/+/, '').split('/').map((seg) => uriEncode(seg, false)).join('/');
}
async function s3PutObject({ key, body, contentType }) {
  const endpoint = (process.env.S3_ENDPOINT || '').replace(/\/+$/, '');
  const bucket = process.env.S3_BUCKET;
  const region = process.env.S3_REGION || 'auto';
  const service = 's3';
  const now = new Date();
  const ymd = now.toISOString().slice(0, 10).replace(/-/g, '');
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const host = `${bucket}.${endpoint.replace(/^https?:\/\//, '')}`;
  const queryStr = '';
  const canonUri = '/' + canonKey(key);
  const payloadHash = sha256Hex(body);
  const canonHeaders = [
    `host:${host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${iso}`,
  ].sort().join('\n');
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonRequest = [
    'PUT',
    canonUri,
    queryStr,
    canonHeaders + '\n',
    signedHeaders,
    payloadHash,
  ].join('\n');
  const scope = `${ymd}/${region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', iso, scope, sha256Hex(canonRequest)].join('\n');
  const kDate = hmac(`AWS4${process.env.S3_SECRET_ACCESS_KEY}`, ymd);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, 'aws4_request');
  const sig = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');
  const auth = `AWS4-HMAC-SHA256 Credential=${process.env.S3_ACCESS_KEY_ID}/${scope}, SignedHeaders=${signedHeaders}, Signature=${sig}`;

  const url = `${endpoint}${canonUri}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType || TE['Content-Type'],
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': iso,
      Authorization: auth,
    },
    body,
  });
  if (!res.ok) {
    const t = await res.text().then((s) => s.slice(0, 300));
    throw new Error(`S3 PUT ${canonUri} → HTTP ${res.status}: ${t}`);
  }
}
function s3PublicUrl(key) {
  const base = (process.env.S3_PUBLIC_BASE_URL || '').replace(/\/+$/, '');
  if (base) return `${base}/${canonKey(key)}`;
  // 无自定义域名:拼虚拟主机样式(仅路径-style 兼容用户需配 PUBLIC_BASE_URL)
  const endpoint = (process.env.S3_ENDPOINT || '').replace(/\/+$/, '');
  return `${endpoint}/${process.env.S3_BUCKET}/${canonKey(key)}`;
}
function createS3SavePath(folder, filename) {
  const prefix = (process.env.S3_FOLDER_PREFIX || '').replace(/^\/+|\/+$/g, '');
  const key = prefix ? `${prefix}/${cleanFolderPath(folder)}/${filename}` : `${cleanFolderPath(folder)}/${filename}`;
  return key;
}

// ─── 图片压缩 ────────────────────────────────────────────────
// 压缩参数:偏小体积,适合服装/灵感/产品展示场景(视觉可接受,体积缩减 80%+)
const COMPRESS_MAX_EDGE = 1600;     // 长边上限,等比缩放,不放大小图
const COMPRESS_JPEG_QUALITY = 70;   // JPEG quality(mozjpeg 编码)
const COMPRESS_WEBP_QUALITY = 70;   // WebP quality

/**
 * 用 sharp 压缩图片 buffer。
 * 跳过 GIF(动画)/SVG(vector);压缩失败或体积未减小时退回原始 buffer。
 * 自动校正 EXIF 方向(手机竖拍 → 正确朝向)。
 */
async function compressImageBuffer(buffer, mimeType) {
  if (!mimeType || !mimeType.startsWith('image/')) return buffer;
  if (mimeType === 'image/gif' || mimeType === 'image/svg+xml') return buffer;
  try {
    let pipeline = sharp(buffer).rotate().resize({
      width: COMPRESS_MAX_EDGE,
      height: COMPRESS_MAX_EDGE,
      fit: 'inside',
      withoutEnlargement: true,
    });
    if (mimeType === 'image/png') {
      pipeline = pipeline.png({ compressionLevel: 9, quality: 80 });
    } else if (mimeType === 'image/webp') {
      pipeline = pipeline.webp({ quality: COMPRESS_WEBP_QUALITY });
    } else {
      // jpeg / 其他 → mozjpeg,体积更小
      pipeline = pipeline.jpeg({ quality: COMPRESS_JPEG_QUALITY, mozjpeg: true });
    }
    const out = await pipeline.toBuffer();
    if (out.length < buffer.length) return out;
    return buffer;
  } catch (err) {
    console.warn(`[storage] compress failed (${mimeType}, ${buffer.length}B): ${err.message}`);
    return buffer;
  }
}

// ─── public API ──────────────────────────────────────────────
async function saveUpload(absTmpPath, savePath, contentType) {
  let buf = fs.readFileSync(absTmpPath);
  buf = await compressImageBuffer(buf, contentType);
  if (mode === 's3') {
    await s3PutObject({ key: savePath, body: buf, contentType });
    fs.unlinkSync(absTmpPath); // 上传后清 tmp
  } else {
    localSave(buf, savePath);
    fs.unlinkSync(absTmpPath);
  }
  return buf.length; // 返回压缩后大小,供调用方写 DB
}
function getPublicUrl(savePath) {
  return mode === 's3' ? s3PublicUrl(savePath) : localPublicUrl(savePath);
}
function createSavePath(folder, filename) {
  return mode === 's3' ? createS3SavePath(folder, filename) : createLocalSavePath(folder, filename);
}

module.exports = {
  mode,
  UPLOAD_ROOT,
  TMP_DIR,
  resolveUploadRoot,
  saveUpload,
  getPublicUrl,
  createSavePath,
  compressImageBuffer,
  // 旧代码迁移期间保留的直接读写(废弃中,新接入统一走 saveUpload)
  _internal: { localSave, localPublicUrl },
};

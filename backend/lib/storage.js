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
 *  *   S3_ENDPOINT        e.g. https://<account>.r2.cloudflarestorage.com   (R2) 或 https://oss-cn-beijing.aliyuncs.com (OSS)
 *                                     或 https://cos.ap-beijing.myqcloud.com (腾讯云 COS)
 *   S3_BUCKET          bucket 名
 *   S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY
 *   S3_PUBLIC_BASE_URL e.g. https://cdn.example.com  或 https://<public>.r2.dev/<bucket>
 *                      或 https://<bucket>.cos.ap-beijing.myqcloud.com (COS 默认域名)
 *   S3_FOLDER_PREFIX   optional, e.g. cute-cat
 *   S3_REGION          optional, e.g. ap-beijing(COS 必填) / auto(R2 默认)
 *   S3_FORCE_PATH_STYLE  optional, 'true' 启用路径样式(host=endpoint,bucket 在 URL path 里);
 *                         默认虚拟主机样式(host=<bucket>.endpoint,与 COS 兼容)
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
  const out = [];
  for (const c of str) {
    if (/[A-Za-z0-9_.~-]/.test(c)) { out.push(c); continue; }
    if (c === '/' && !encodeSlash) { out.push('/'); continue; }
    // 非 ASCII(中文等):按 UTF-8 bytes 逐字节 %XX 编码,与 AWS SigV4 一致。
    // ASCII 字符 UTF-8 = 单字节,行为与旧版 charCodeAt 完全一致。
    for (const b of Buffer.from(c, 'utf8')) {
      out.push('%' + b.toString(16).toUpperCase().padStart(2, '0'));
    }
  }
  return out.join('');
}
function canonKey(key) {
  // 去掉前导 /,每个 segment 独立 encode(S3 惯例)
  return key.replace(/^\/+/, '').split('/').map((seg) => uriEncode(seg, false)).join('/');
}
/**
 * 统一构造 S3 请求位置(host 用于签名,urlBase 用于发起请求)。
 * 两种样式由 S3_FORCE_PATH_STYLE 控制,host 与 URL 始终保持一致:
 *
 *   虚拟主机样式 (默认,COS 推荐):
 *     host   = <bucket>.cos.ap-beijing.myqcloud.com
 *     urlBase = https://<bucket>.cos.ap-beijing.myqcloud.com
 *     canonUri = /<key>(不含 bucket,放在 URL path)
 *
 *   路径样式 (S3_FORCE_PATH_STYLE=true,旧 S3 兼容):
 *     host   = cos.ap-beijing.myqcloud.com
 *     urlBase = https://cos.ap-beijing.myqcloud.com/<bucket>
 *     canonUri = /<bucket>/<key>
 */
function buildS3Location() {
  const endpoint = (process.env.S3_ENDPOINT || '').replace(/\/+$/, '');
  const bucket = process.env.S3_BUCKET || '';
  const forcePath = String(process.env.S3_FORCE_PATH_STYLE || '').toLowerCase() === 'true';
  let u = null;
  try { u = new URL(endpoint); } catch { /* 下面兜底 */ }
  if (!u || forcePath) {
    const host = u ? u.host : endpoint.replace(/^https?:\/\//, '');
    const urlBase = bucket ? `${endpoint}/${bucket}` : endpoint;
    return { host, urlBase, pathPrefix: bucket ? `/${bucket}` : '' };
  }
  // 虚拟主机:host 带 bucket 前缀
  const host = bucket ? `${bucket}.${u.host}` : u.host;
  const urlBase = bucket ? `${u.protocol}//${bucket}.${u.host}` : endpoint;
  return { host, urlBase, pathPrefix: '' };
}

// COS/S3 单次 HTTP 请求超时(默认 60s)。
// 必须有超时:线上曾出现 PUT 请求无响应导致 saveUpload → persistTempFile → material-combo
// handler 卡在 await 上永远不返回,前端最终被网关切成 504,大模型请求根本没发出去。
// 上传的是 sharp 压缩后的图,一般 KB~几 MB,内网 COS 应在秒级内完成,60s 已足够宽松。
// 支持 env S3_REQUEST_TIMEOUT_MS 覆盖。
const S3_REQUEST_TIMEOUT_MS = Number.parseInt(process.env.S3_REQUEST_TIMEOUT_MS || '', 10) || 60000;

/**
 * 包一层带超时的 fetch —— COS/S3 出网请求必须有超时,否则一次网络异常就会
 * 无限 pending 拖挂上游 handler。超时时抛出可辨识的错误(name=AbortError → 转成明确文案)。
 */
async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    if (e?.name === 'AbortError') {
      const err = new Error(`S3 request timeout ${timeoutMs}ms: ${init?.method || 'GET'} ${url}`);
      err.code = 'S3_TIMEOUT';
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function s3PutObject({ key, body, contentType }) {
  const region = process.env.S3_REGION || 'auto';
  const service = 's3';
  const now = new Date();
  const ymd = now.toISOString().slice(0, 10).replace(/-/g, '');
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const { host, urlBase, pathPrefix } = buildS3Location();
  const canonUri = `${pathPrefix}/${canonKey(key)}`;
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
    '',  // queryStr
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

  const url = `${urlBase}/${canonKey(key)}`;
  const t0 = Date.now();
  const res = await fetchWithTimeout(url, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType || TE['Content-Type'],
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': iso,
      Authorization: auth,
    },
    body,
  }, S3_REQUEST_TIMEOUT_MS);
  if (!res.ok) {
    const t = await res.text().then((s) => s.slice(0, 300));
    throw new Error(`S3 PUT ${canonUri} → HTTP ${res.status}: ${t}`);
  }
  const cost = Date.now() - t0;
  // 慢请求告警:超过 5s 打日志,便于线上定位 COS 上传耗时异常(前置排查 504 根因)
  if (cost > 5000) console.warn(`[storage] slow S3 PUT ${canonUri} cost=${cost}ms size=${body?.length || 0}B`);
}
/**
 * SigV4 签名删除 COS 对象 —— 与 s3PutObject 共享同一签名流水线,
 * 仅 method=DELETE、payload=UNSIGNED-PAYLOAD、无 body。
 * 幂等:204(已删) 和 404(不存在) 都视为成功,其余 HTTP 码抛错。
 */
async function s3DeleteObject(key) {
  const region = process.env.S3_REGION || 'auto';
  const service = 's3';
  const now = new Date();
  const ymd = now.toISOString().slice(0, 10).replace(/-/g, '');
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const { host, urlBase, pathPrefix } = buildS3Location();
  const canonUri = `${pathPrefix}/${canonKey(key)}`;
  const payloadHash = 'UNSIGNED-PAYLOAD'; // DELETE 无 body
  const canonHeaders = [
    `host:${host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${iso}`,
  ].sort().join('\n');
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonRequest = [
    'DELETE',
    canonUri,
    '',  // queryStr
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

  const url = `${urlBase}/${canonKey(key)}`;
  const res = await fetchWithTimeout(url, {
    method: 'DELETE',
    headers: {
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': iso,
      Authorization: auth,
    },
  }, S3_REQUEST_TIMEOUT_MS);
  // 204 No Content = 已删;404 Not Found = 已不存在 → 都视为成功(幂等)
  if (res.ok || res.status === 404) return;
  const t = await res.text().then((s) => s.slice(0, 300));
  throw new Error(`S3 DELETE ${canonUri} → HTTP ${res.status}: ${t}`);
}

/**
 * 从「运行时拼出的绝对 URL」反推出 COS object key —— s3PublicUrl 的精确逆运算。
 *   优先用 S3_PUBLIC_BASE_URL,否则用 buildS3Location 派生的 urlBase(与生成时完全一致)。
 * 逐段 decodeURIComponent 抵消 canonKey 的 percent-encoding,回收原始 key。
 * 不是我们的 URL(前缀不匹配)时返回 null → 调用方应跳过,避免误删外部资源。
 */
function keyFromUrl(url) {
  if (!url || typeof url !== 'string') return null;
  // 去掉 query string(?...) 和 hash(#...)
  const pathname = String(url).split('?')[0].split('#')[0];
  const base = (process.env.S3_PUBLIC_BASE_URL || '').replace(/\/+$/, '');
  const fallbackBase = buildS3Location().urlBase.replace(/\/+$/, '');
  let residual = null;
  if (base && pathname.startsWith(base + '/')) residual = pathname.slice(base.length + 1);
  else if (fallbackBase && pathname.startsWith(fallbackBase + '/')) residual = pathname.slice(fallbackBase.length + 1);
  if (!residual) return null; // 不是我们的域名 → 拒绝
  return residual.split('/').map((s) => decodeURIComponent(s)).join('/');
}

function s3PublicUrl(key) {
  const base = (process.env.S3_PUBLIC_BASE_URL || '').replace(/\/+$/, '');
  if (base) return `${base}/${canonKey(key)}`;
  // 无自定义域名:与 s3PutObject 完全一致的虚拟/路径样式
  const { urlBase } = buildS3Location();
  return `${urlBase}/${canonKey(key)}`;
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

/**
 * 原样落盘(不压缩)—— 专用于存量迁移等「源文件已是最终形态」的场景。
 * 路由逻辑与 saveUpload 一致(localSave / s3PutObject),只是跳过 compressImageBuffer。
 * 返回写入后的大小(s3 模式为 body.length)。
 */
async function putBuffer({ absPath, savePath, contentType }) {
  const buf = fs.readFileSync(absPath);
  if (mode === 's3') {
    await s3PutObject({ key: savePath, body: buf, contentType });
  } else {
    localSave(buf, savePath);
  }
  return buf.length;
}

/**
 * 保存 AI 生成图片的「原图 + 压缩图」两份。
 * 原图路径 = 在同目录下加 -orig 后缀(保留 .png 扩展名)。
 * 返回 { url, originalUrl } —— url 为压缩图(供前端展示),originalUrl 为原图(供下载)。
 */
async function saveAIGeneratedImage(absTmpPath, savePath, contentType) {
  const raw = fs.readFileSync(absTmpPath);

  // 1. 原图:直接落盘,不压缩
  // savePath 形如 "design/<team>/<filename>.png" → 原图 "design/<team>/<filename>-orig.png"
  const dotIdx = savePath.lastIndexOf('.');
  const origSavePath = dotIdx === -1 ? `${savePath}-orig` : `${savePath.slice(0, dotIdx)}-orig${savePath.slice(dotIdx)}`;
  if (mode === 's3') {
    await s3PutObject({ key: origSavePath, body: raw, contentType });
  } else {
    localSave(raw, origSavePath);
  }

  // 2. 压缩图:走现有压缩逻辑
  const compressed = await compressImageBuffer(raw, contentType);
  if (mode === 's3') {
    await s3PutObject({ key: savePath, body: compressed, contentType });
  } else {
    localSave(compressed, savePath);
  }

  fs.unlinkSync(absTmpPath);
  return { url: getPublicUrl(savePath), originalUrl: getPublicUrl(origSavePath) };
}
function getPublicUrl(savePath) {
  return mode === 's3' ? s3PublicUrl(savePath) : localPublicUrl(savePath);
}
function createSavePath(folder, filename) {
  return mode === 's3' ? createS3SavePath(folder, filename) : createLocalSavePath(folder, filename);
}

/**
 * 按「运行时拼出的绝对 URL」删除对应存储对象 —— 删除产品/素材等记录时级联清存储。
 *   s3 模式:keyFromUrl 反推 key → s3DeleteObject(幂等,404 视为成功)。
 *   local 模式:URL 形如 /uploads/<relPath>,定位到 UPLOAD_ROOT/<relPath> 后 unlink(不存在则忽略)。
 * 返回 true 表示已尝试删除(含 404 已不存在);false 表示不是我们的 URL / 路径,跳过。
 * 单个删除失败抛错,由调用方决定是中断还是仅记日志。
 */
async function deleteImageByUrl(url) {
  if (!url || typeof url !== 'string') return false;
  if (mode === 's3') {
    const key = keyFromUrl(url);
    if (!key) return false; // 不是我们的域名 → 跳过,避免误删外部资源
    await s3DeleteObject(key);
    return true;
  }
  // local: 仅处理 /uploads/<relPath>
  const m = /^\/(uploads\/.*)$/.exec(url.split('?')[0].split('#')[0]);
  if (!m) return false;
  const abs = path.join(UPLOAD_ROOT, m[1]);
  try {
    fs.unlinkSync(abs);
  } catch (e) {
    if (e.code === 'ENOENT') return false; // 不存在 → 跳过
    throw e;
  }
  return true;
}

module.exports = {
  mode,
  UPLOAD_ROOT,
  TMP_DIR,
  resolveUploadRoot,
  saveUpload,
  saveAIGeneratedImage,
  putBuffer,
  getPublicUrl,
  createSavePath,
  deleteImageByUrl,
  compressImageBuffer,
};

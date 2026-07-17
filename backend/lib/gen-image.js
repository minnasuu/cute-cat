/**
 * gen-image —— 文生图公共 helper,单 provider。
 *
 * provider:
 *   'maizi' —— MaiziTech v2 (maizitech.xyz),gpt-image-2
 *   文档: https://www.maizitech.xyz/docs/images-v2
 *   协议: /v2/images/generations,b64_json 响应(非 OpenAI URL 格式)
 *
 * 文本/视觉解析模型仍走火山方舟(workflow-executor / analyze-inspiration),与生图模块无关。
 *
 * generateImage(prompt, { teamId, aspectRatio, safeName, provider }) →
 *   成功 { url, prompt, model }
 *   失败 { error }(具体错误信息,便于前端/日志定位)
 *
 * v2 响应直接返回 b64 图片数据 → 解码落盘,供设计工作流/旧流水线共用。
 * 兼容回退:若响应仍为 url 形式,走原有下载流程。
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const storage = require('./storage');

// 本地静态挂载前缀 —— localPublicUrl 拼出 "/uploads/<relPath>",这里用于反向剥离
const LOCAL_UPLOAD_PREFIX = '/uploads/';
// 扩展名 → MIME,用于本地文件转 base64 data URI
const EXT_MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.gif': 'image/gif', '.bmp': 'image/bmp',
};

/**
 * 把本地相对路径(/uploads/<relPath>)读回文件并转成 data URI。
 * Maizi 的 images 只接受 URL 或 data URI,本地模式 public url 是相对路径,
 * 外部拉不到,必须回退成 base64 data URI 才能作为参考图使用。
 * 读取失败 / 非本地路径时返回 null。
 * 依赖"保留本地副本做热缓存"决策 —— 切到 COS 后老图仍留在 backend/uploads/,
 * 本函数 fs.existsSync 仍能读到,老参考图不会断。
 */
function localUrlToDataUri(localUrl) {
  if (!localUrl || typeof localUrl !== 'string' || !localUrl.startsWith(LOCAL_UPLOAD_PREFIX)) return null;
  const relPath = localUrl.slice(LOCAL_UPLOAD_PREFIX.length);
  const absPath = path.join(storage.UPLOAD_ROOT, relPath);
  try {
    if (!fs.existsSync(absPath)) return null;
    const buf = fs.readFileSync(absPath);
    const ext = path.extname(absPath).toLowerCase();
    const mime = EXT_MIME[ext] || 'image/png';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch (e) {
    console.warn(`[gen-image] read local ref image failed: ${absPath} (${e?.message || e})`);
    return null;
  }
}

/**
 * 把远程图片 URL(本服务 COS/S3 或任意 http(s))拉取后转成 base64 data URI。
 * 用途:Maizi images 字段要求 URL 可被其服务器公网拉取;若 COS 配了防盗链/私有读取,
 * Maizi 拉不到 → 请求 hang / 大模型后台收不到请求。改由本服务后端拉取并内嵌 base64,
 * 保证 Maizi 一定能拿到参考图内容(COS 迁移前的本地模式正是靠 data URI 工作的)。
 * 拉取失败返回 null(由调用方 filter 掉,退化为无参考图的纯文生图)。
 */
async function remoteUrlToDataUri(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) {
      console.warn(`[gen-image] fetch ref image failed: HTTP ${res.status} ${url.slice(0, 80)}`);
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const ct = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const ext = path.extname(url.split('?')[0]).toLowerCase();
    const mime = ct || EXT_MIME[ext] || 'image/png';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch (e) {
    console.warn(`[gen-image] fetch ref image error: ${url.slice(0, 80)} (${e?.message || e})`);
    return null;
  }
}

/**
 * 归一化参考图条目: data URI 原样;本地 /uploads/... 路径同步转 data URI;
 * http(s) URL(COS/S3 或外部)异步拉取后转 data URI,确保下游 provider 能直接消费
 * (避免 Maizi 拉取受限导致参考图缺失 / 请求 hang)。
 */
async function normalizeRefImage(url) {
  if (!url || typeof url !== 'string') return null;
  if (/^data:/i.test(url)) return url;
  if (/^https?:\/\//.test(url)) return remoteUrlToDataUri(url);
  return localUrlToDataUri(url);
}

/* ─── provider 配置 ─────────────────────────────────────────── */
// 当前仅支持 maizi(MaiziTech v2,gpt-image-2) —— 唯一生图模型。
// 文档: https://www.maizitech.xyz/docs/images-v2
// 新增模型只加一项即可。
const PROVIDERS = {
  maizi: {
    apiKey: () => process.env.MAIZI_API_KEY,
    missingKeyError: 'MAIZI_API_KEY not set',
    // v2 端点(注意:是 /v2 不是 /v1)
    baseUrl: () => process.env.MAIZI_BASE_URL || 'https://www.maizitech.xyz/v2',
    defaultModel: () => process.env.MAIZI_IMAGE_MODEL || 'gpt-image-2',
    // gpt-image-2 支持 3 种标准尺寸;这里把设计工作流比例就近映射到可用水晶球
    //   1:1 → 1024x1024   3:4/9:16(竖) → 832x1216   4:3/16:9(横) → 1216x832
    sizeMap: { '1:1': '1024x1024', '3:4': '832x1216', '4:3': '1216x832', '9:16': '832x1216', '16:9': '1216x832' },
    fallbackSize: '1024x1024',
    // 1K ≈ 1000px 级别,与上面尺寸匹配;可选 standard/low

    defaultResolution: () => process.env.MAIZI_RESOLUTION || '1K',
    // quality: standard/low/high/medium
    defaultQuality: () => process.env.MAIZI_QUALITY || 'medium',
    // referenceImages 被忽略(gpt-image-2 纯文生图) —— 调用方需在 prompt 中自行描述材料信息
    buildBody: (model, prompt, size, _referenceImages, cfg) => ({
      model, prompt, size, n: 1,
      resolution: cfg.defaultResolution(),
      quality: cfg.defaultQuality(),
      response_format: 'b64_json',
    }),
    // v2 响应为 b64_json:解出图片 Buffer(不再走 URL 下载)
    extractImage: (data) => {
      const b64 = data?.data?.[0]?.b64_json || data?.data?.[0]?.url || null;
      if (!b64) return null;
      // 兼容 url 形式(某些配置下仍可能返回 url)
      if (/^https?:\/\//.test(b64)) return { url: b64 };
      return { buffer: Buffer.from(b64, 'base64') };
    },
    label: 'MaiziTech',
  },

  // ─── 图像编辑 provider:原生多图参考(图生图) ─────────────────────
  // imageRef:true —— provider 真正消费 referenceImages,按参考图生图。
  // 关键假设(占位,以 MaiziTech 真实文档为准,联调时只改 buildBody 这一处):
  //   · 字段名 image 接受 URL 数组(多图原生参考)—— 若端点只接受单图或改用
  //     multipart / base64 编码,只需调整下方 buildBody 与 extractImage。
  // 模型 id 走 env MAIZI_IMAGE_EDIT_MODEL,便于切到不同版本无需改代码。
  'maizi-image-edit': {
    apiKey: () => process.env.MAIZI_API_KEY,
    missingKeyError: 'MAIZI_API_KEY not set',
    baseUrl: () => process.env.MAIZI_BASE_URL || 'https://www.maizitech.xyz/v2',
    // 图生图端点路径。默认 /images/generations(与文生图同路径、由 model 区分);
    // 若 Maizi 要求独立的编辑端点(如 /images/edits),改 env MAIZI_IMAGE_EDIT_PATH。
    path: () => process.env.MAIZI_IMAGE_EDIT_PATH || '/images/generations',
    // 图生模型 id。gpt-image-edit 是占位,Maizi 实际会拒绝(不可用/不支持图片生成);
    // 正确 id 以控制台为准,通过 env MAIZI_IMAGE_EDIT_MODEL 注入(默认回落到文生图 gpt-image-2)。
    defaultModel: () => process.env.MAIZI_IMAGE_EDIT_MODEL || 'gpt-image-2',
    imageRef: true,
    sizeMap: { '1:1': '1024x1024', '3:4': '832x1216', '4:3': '1216x832', '9:16': '832x1216', '16:9': '1216x832' },
    fallbackSize: '1024x1024',
    defaultResolution: () => process.env.MAIZI_RESOLUTION || '1K',
    defaultQuality: () => process.env.MAIZI_QUALITY || 'medium',
    // buildBody: 多图原生参考 —— images 传 URL / data URI 数组(图1,图2, ...)。
    // Maizi 只接受 http(s) URL 或 data:image/...;base64,...;本地模式 public url
    // 为相对路径 /uploads/...,外部拉不到,须回退成 data URI 再传入。
    // 注:referenceImages 在调用 buildBody 前已由 generateImage 归一化为 data URI 数组,
    // 这里只做组装,不再调用 normalizeRefImage(保持 buildBody 同步)。
    buildBody: (model, prompt, size, referenceImages, cfg) => {
      const images = (Array.isArray(referenceImages) ? referenceImages : []).filter(Boolean);
      return {
        model,
        prompt,
        size,
        n: 1,
        images: images.length ? images : undefined,
        resolution: cfg.defaultResolution(),
        quality: cfg.defaultQuality(),
        response_format: 'b64_json',
      };
    },
    extractImage: (data) => {
      const b64 = data?.data?.[0]?.b64_json || data?.data?.[0]?.url || null;
      if (!b64) return null;
      if (/^https?:\/\//.test(b64)) return { url: b64 };
      return { buffer: Buffer.from(b64, 'base64') };
    },
    label: 'Maizi-ImageEdit',
  },
};

/**
 * 解析本次请求使用的 provider。
 * 内置 'maizi'(文生图) 与 'maizi-image-edit'(图像编辑 / 多图参考);
 * 传其它值一律回退到 maizi。
 */
function resolveProvider(opts) {
  const p = (opts?.provider || process.env.IMAGE_PROVIDER || 'maizi').toLowerCase();
  if (!PROVIDERS[p]) {
    console.warn(`[gen-image] unknown provider="${p}", fall back to maizi`);
    return 'maizi';
  }
  return p;
}

/**
 * 调用指定 provider 生成一张图片。
 * @param {string} prompt 英文 prompt
 * @param {object} opts
 * @param {string} opts.teamId 团队 ID(用作 uploads 子目录)
 * @param {string} [opts.aspectRatio='1:1'] 设计工作流比例
 * @param {string} [opts.safeName='image'] 文件名前缀
 * @param {string} [opts.provider='maizi'] 生图模型提供商('maizi' 文生图 | 'maizi-image-edit' 多图参考)
 * @param {string} [opts.model] 覆盖 provider 默认模型 ID
 * @param {string[]} [opts.referenceImages] 参考图数组(材料图等),顺序即图序号(图1, 图2, ...)。
 *   每项接受 http(s) URL、data URI,以及本地模式相对路径 /uploads/...(自动回退为 data URI)。
 *   若 provider 声明 imageRef:true → 走图生图/真·参考图请求体;
 *   否则 → 被忽略(纯文生图供应商),调用方应在 prompt 中自行描述。
 * @param {string} [opts.referenceImageUrl] @deprecated 单参考图旧写法,等价于 referenceImages:[url]。
 *   为 pixel-image / lineart 等调用方保留,新代码请用 referenceImages。
 * @returns {Promise<{ url: string, prompt: string, model: string } | { error: string }>}
 */
async function generateImage(prompt, opts) {
  const { teamId, aspectRatio = '1:1', safeName = 'image', model: modelOverride, referenceImageUrl, referenceImages } = opts || {};
  if (!prompt || !prompt.trim()) {
    return { error: 'empty prompt' };
  }
  // 归一化参考图:优先用 referenceImages(数组),回退旧单图 referenceImageUrl,再过滤空串。
  // 顺序即图序号(图1, 图2, ...),与 prompt 中的「图1换成图2的面料花样」对齐。
  const refs = (Array.isArray(referenceImages) && referenceImages.length)
    ? referenceImages.filter(Boolean)
    : (referenceImageUrl ? [referenceImageUrl] : []);
  if (!teamId) {
    return { error: 'teamId required' };
  }

  const provider = resolveProvider(opts);
  const cfg = PROVIDERS[provider];

  const apiKey = cfg.apiKey();
  if (!apiKey) {
    return { error: cfg.missingKeyError };
  }

  const effectivePrompt = prompt;

  const baseUrl = cfg.baseUrl();
  const model = modelOverride || cfg.defaultModel();
  const size = cfg.sizeMap[String(aspectRatio)] || cfg.fallbackSize;
  const source = `${provider}:${model}/${size}`;

  // 归一化参考图(一次性,重试时复用):
  //   - data URI 原样
  //   - 本地 /uploads/... 同步转 data URI
  //   - http(s) URL(COS/S3 等)后端拉取后转 data URI
  //     切到 COS 后参考图是 https URL,若 Maizi 拉不到(防盗链/私有读)会 hang,
  //     改由本服务拉取并内嵌 base64,恢复本地模式下的可靠行为。
  //   imageRef:false 的 provider(纯文生图)会忽略 refs,这里仍归一化(开销小,保持一致)。
  const normalizedRefs = cfg.imageRef
    ? (await Promise.all(refs.map(normalizeRefImage))).filter(Boolean)
    : refs;

  // 单张生成超时(默认 180s / 3 分钟)——gpt-image-2 大尺寸图生成常超 120s
  const IMAGE_TIMEOUT_MS = Number.parseInt(process.env.IMAGE_TIMEOUT_MS || '', 10) || 180000;

  // 对可重试的错误(网络/超时/5xx)自动重试 1 次
  const MAX_RETRIES = 1;
  let lastError = null;
  let _imageUrl = null;
  let _imageBuffer = null;
  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    // 每次尝试新建 controller/计时器
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);
    try {
      // 图生图 endpoint:默认 /images/generations,可通过 cfg.path()(env MAIZI_IMAGE_EDIT_PATH) 切到 /images/edits 等独立编辑端点
      const url = `${baseUrl}${cfg.path ? cfg.path() : '/images/generations'}`;
      console.log(`[gen-image] attempt ${attempt}: POST ${url} model=${model}, size=${size}${normalizedRefs.length ? `, refImages=${normalizedRefs.length}×${String(normalizedRefs[0]).slice(0, 40)}…` : ''}, prompt=${effectivePrompt.slice(0, 60)}…`);
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(cfg.buildBody(model, effectivePrompt, size, normalizedRefs, cfg)),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error(`[gen-image] ${cfg.label} API ${res.status} (attempt ${attempt}, ${source}): ${errText.slice(0, 300)}`);
        // 5xx / 429 可重试,4xx(参数错误)不重试
        if (attempt < MAX_RETRIES + 1 && (res.status >= 500 || res.status === 429)) {
          lastError = `${cfg.label} HTTP ${res.status}: ${errText.slice(0, 200)}`;
          await new Promise((r) => setTimeout(r, 2000 * attempt)); // 退避:2s
          continue;
        }
        return { error: `${cfg.label} HTTP ${res.status}: ${errText.slice(0, 200)}` };
      }

      const data = await res.json();
      const extracted = cfg.extractImage(data);
      if (!extracted) {
        console.error(`[gen-image] ${cfg.label} returned no image (attempt ${attempt}):`, JSON.stringify(data).slice(0, 200));
        if (attempt < MAX_RETRIES + 1) {
          lastError = '返回无图片数据';
          await new Promise((r) => setTimeout(r, 2000 * attempt));
          continue;
        }
        return { error: `${cfg.label} 返回无图片数据: ${JSON.stringify(data).slice(0, 120)}` };
      }
      // 成功 — 跳出循环进入下载阶段
      // b64 模式:直接拿到 buffer; url 模式:记录 url 后续下载
      _imageUrl = extracted.url || null;
      _imageBuffer = extracted.buffer || null;
      break;
    } catch (e) {
      const isTimeout = e?.name === 'AbortError';
      const msg = isTimeout ? `生成超时(${IMAGE_TIMEOUT_MS}ms)` : (e?.message || String(e));
      console.error(`[gen-image] ${cfg.label} call failed (attempt ${attempt}):`, msg);
      // 超时或网络错误可重试
      if (attempt < MAX_RETRIES + 1 && (isTimeout || e?.name === 'TypeError' || /network|ECONN|socket/i.test(msg))) {
        lastError = msg;
        await new Promise((r) => setTimeout(r, 2000 * attempt));
        continue;
      }
      return { error: msg };
    } finally {
      clearTimeout(timer);
    }
  }

  // 优先使用 b64 直接解码的 buffer;否则走 url 下载
  let buf = _imageBuffer || null;
  if (!buf) {
    const imageUrl = _imageUrl;
    if (!imageUrl) {
      return { error: lastError || `${cfg.label} 生成失败(已重试 ${MAX_RETRIES} 次)` };
    }
    // 返回的 URL 是临时的,立即下载并持久化到 storage(本地或 S3)
    try {
      const imgRes = await fetch(imageUrl);
      if (!imgRes.ok) {
        console.error(`[gen-image] download image failed: HTTP ${imgRes.status}`);
        return { error: `下载图片失败(HTTP ${imgRes.status})` };
      }
      buf = Buffer.from(await imgRes.arrayBuffer());
    } catch (e) {
      console.error('[gen-image] download image error:', e?.message || String(e));
      return { error: `下载图片失败: ${e?.message || e}` };
    }
  }

  if (!buf) {
    return { error: lastError || `${cfg.label} 生成失败(已重试 ${MAX_RETRIES} 次)` };
  }

  try {

    // tmp 落盘(由 saveUpload 再路由到最终位置,统一本地/S3 两条路径)
    const cleanSafe = String(safeName || 'image').replace(/[^a-zA-Z0-9一-龥_-]+/g, '-').slice(0, 60) || 'image';
    const filename = `${Date.now()}-${cleanSafe}-${crypto.randomBytes(6).toString('hex')}.png`;
    const tmpPath = path.join(storage.TMP_DIR, filename);
    fs.mkdirSync(storage.TMP_DIR, { recursive: true });
    fs.writeFileSync(tmpPath, buf);
    const savePath = storage.createSavePath(`design/${String(teamId)}`, filename);
    // 同时保存原图(-orig 后缀) + 压缩图,前端展示压缩图,下载按钮取原图
    const { url, originalUrl } = await storage.saveAIGeneratedImage(tmpPath, savePath, 'image/png');

    console.log(`[gen-image] done: ${source}, mode=${storage.mode}, saved=${filename}, url=${url}, original=${originalUrl}`);
    return { url, originalUrl, prompt, model };
  } catch (e) {
    console.error('[gen-image] save image failed:', e?.message || String(e));
    return { error: `保存图片失败: ${e?.message || e}` };
  }
}

module.exports = { generateImage, PROVIDERS, resolveProvider };

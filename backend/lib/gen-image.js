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
    // referenceImageUrl 被忽略(gpt-image-2 纯文生图) —— 调用方需在 prompt 中自行描述材料信息
    buildBody: (model, prompt, size, _referenceImageUrl, cfg) => ({
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
};

/**
 * imageRef —— 占位扩展点:声明一个支持「真·参考图」的供应商(如 Maizi 图像编辑 / FLUX)。
 * 当 provider 匹配到此配置且传入 referenceImageUrl 时,走参考图请求体;
 * 未配置时 resolveProvider 会回退到 maizi。
 *
 * 启用方式:在 PROVIDERS 中补充该 provider 的apiKey / baseUrl / sizeMap / buildBody(需带上 image)。
 * 例:
 *   'maizi-image-edit': {
 *     apiKey: () => process.env.MAIZI_API_KEY,
 *     baseUrl: () => process.env.MAIZI_BASE_URL || 'https://www.maizitech.xyz/v2',
 *     defaultModel: () => process.env.MAIZI_IMAGE_EDIT_MODEL || 'gpt-image-edit-...',
 *     imageRef: true,
 *     sizeMap: { '1:1': '1024x1024', ... },
 *     fallbackSize: '1024x1024',
 *     defaultResolution: () => '1K',
 *     defaultQuality: () => 'medium',
 *     buildBody: (model, prompt, size, referenceImageUrl, cfg) => ({
 *       model, prompt, image: referenceImageUrl, size,
 *       resolution: cfg.defaultResolution(), quality: cfg.defaultQuality(),
 *       response_format: 'b64_json',
 *     }),
 *     extractImage: (data) => { const b64 = data?.data?.[0]?.b64_json; return b64 ? { buffer: Buffer.from(b64, 'base64') } : null; },
 *     label: 'Maizi-ImageEdit',
 *   },
 */

/**
 * 解析本次请求使用的 provider。
 * 当前全局唯一 provider 为 'maizi'(MaiziTech);保留入参/env 仅为向后兼容,
 * 传入其它值一律回退到 maizi。
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
 * @param {string} [opts.provider='maizi'] 生图模型提供商('maizi')
 * @param {string} [opts.model] 覆盖 provider 默认模型 ID
 * @param {string} [opts.referenceImageUrl] 参考图 URL(材料图等)
 *   若 provider 声明 imageRef:true → 走图生图/参考图请求体(真·参考图);
 *   否则 → 将材料视觉信息以文字形式追加到 prompt(降级),保证所有供应商可用
 * @returns {Promise<{ url: string, prompt: string, model: string } | { error: string }>}
 */
async function generateImage(prompt, opts) {
  const { teamId, aspectRatio = '1:1', safeName = 'image', model: modelOverride, referenceImageUrl } = opts || {};
  if (!prompt || !prompt.trim()) {
    return { error: 'empty prompt' };
  }
  if (!teamId) {
    return { error: 'teamId required' };
  }

  const provider = resolveProvider(opts);
  const cfg = PROVIDERS[provider];

  const apiKey = cfg.apiKey();
  if (!apiKey) {
    return { error: cfg.missingKeyError };
  }

  // 文字降级:provider 不支持参考图时,把「参考图」降级为 prompt 末尾的材料描述
  // (调用方也可在调之前就写好材料描述;此处仅在未显式描述时追加一句提示,避免重复)
  const effectivePrompt = prompt;

  const baseUrl = cfg.baseUrl();
  const model = modelOverride || cfg.defaultModel();
  const size = cfg.sizeMap[String(aspectRatio)] || cfg.fallbackSize;
  const source = `${provider}:${model}/${size}`;

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
      console.log(`[gen-image] attempt ${attempt}: ${source}, prompt=${effectivePrompt.slice(0, 60)}…${referenceImageUrl ? `, refImage=${referenceImageUrl.slice(0, 40)}…` : ''}`);
      const res = await fetch(`${baseUrl}/images/generations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(cfg.buildBody(model, effectivePrompt, size, referenceImageUrl, cfg)),
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
    await storage.saveUpload(tmpPath, savePath, 'image/png');

    const url = storage.getPublicUrl(savePath);
    console.log(`[gen-image] done: ${source}, mode=${storage.mode}, saved=${filename}, url=${url}`);
    return { url, prompt, model };
  } catch (e) {
    console.error('[gen-image] save image failed:', e?.message || String(e));
    return { error: `保存图片失败: ${e?.message || e}` };
  }
}

module.exports = { generateImage, PROVIDERS, resolveProvider };

/**
 * gen-image —— 文生图公共 helper,单 provider。
 *
 * provider:
 *   'ark'(默认)  —— 火山方舟 SeedDream,doubao-seedream-5-0-pro-260628
 *
 * generateImage(prompt, { teamId, aspectRatio, safeName, provider }) →
 *   成功 { url, prompt, model }
 *   失败 { error }(具体错误信息,便于前端/日志定位)
 *
 * 返回临时 URL → 下载落盘,供设计工作流/旧流水线共用。
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const storage = require('./storage');

/* ─── provider 配置 ─────────────────────────────────────────── */
// 当前仅支持 ark(火山方舟 SeedDream) —— 唯一生图模型。
// 新增模型只加一项即可。
const PROVIDERS = {
  ark: {
    apiKey: () => process.env.ARK_API_KEY,
    missingKeyError: 'ARK_API_KEY not set',
    baseUrl: () => process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3',
    defaultModel: () => process.env.ARK_IMAGE_MODEL || 'doubao-seedream-5-0-pro-260628',
    // SeedDream 支持 "2K" 或 "WxH" 字符串;这里按设计工作流比例给固定尺寸
    sizeMap: { '1:1': '1024x1024', '3:4': '864x1152', '4:3': '1152x864', '9:16': '768x1344', '16:9': '1344x768' },
    fallbackSize: '2K',
    // referenceImageUrl 被忽略(SeedDream 纯文生图) —— 调用方需在 prompt 中自行描述材料信息
    buildBody: (model, prompt, size, _referenceImageUrl) => ({ model, prompt, size, output_format: 'png', watermark: false }),
    extractUrl: (data) => data?.data?.[0]?.url,
    label: 'SeedDream',
  },
};

/**
 * imageRef —— 占位扩展点:声明一个支持「真·参考图」的供应商(如 Ark 图像编辑 / FLUX)。
 * 当 provider 匹配到此配置且传入 referenceImageUrl 时,走参考图请求体;
 * 未配置时 resolveProvider 会回退到 ark。
 *
 * 启用方式:在 PROVIDERS 中补充该 provider 的apiKey / baseUrl / sizeMap / buildBody(需带上 image)。
 * 例:
 *   'ark-image-edit': {
 *     apiKey: () => process.env.ARK_API_KEY,
 *     baseUrl: () => process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3',
 *     defaultModel: () => process.env.ARK_IMAGE_EDIT_MODEL || 'doubao-seededit-...',
 *     imageRef: true,
 *     sizeMap: { '1:1': '1024x1024', ... },
 *     fallbackSize: '1024x1024',
 *     buildBody: (model, prompt, size, referenceImageUrl) => ({
 *       model, prompt, image: referenceImageUrl, size, ...     // 具体视 Ark 图像编辑文档
 *     }),
 *     extractUrl: (data) => data?.data?.[0]?.url,
 *     label: 'Ark-ImageEdit',
 *   },
 */

/**
 * 解析本次请求使用的 provider。
 * 优先级:opts.provider > env IMAGE_PROVIDER > 'ark'(默认)。
 */
function resolveProvider(opts) {
  const p = (opts?.provider || process.env.IMAGE_PROVIDER || 'ark').toLowerCase();
  if (!PROVIDERS[p]) {
    console.warn(`[gen-image] unknown provider="${p}", fall back to ark`);
    return 'ark';
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
 * @param {string} [opts.provider='ark'] 生图模型提供商('ark')
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

  // 单张生成超时(默认 120s)——CogView 30~90s,SeedDream 可能更长
  const IMAGE_TIMEOUT_MS = Number.parseInt(process.env.IMAGE_TIMEOUT_MS || '', 10) || 120000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);

  let imageUrl;
  try {
    console.log(`[gen-image] generating: ${source}, prompt=${effectivePrompt.slice(0, 60)}…${referenceImageUrl ? `, refImage=${referenceImageUrl.slice(0, 40)}…` : ''}`);
    const res = await fetch(`${baseUrl}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(cfg.buildBody(model, effectivePrompt, size, referenceImageUrl)),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[gen-image] ${cfg.label} API ${res.status} (${source}): ${errText.slice(0, 300)}`);
      return { error: `${cfg.label} HTTP ${res.status}: ${errText.slice(0, 200)}` };
    }

    const data = await res.json();
    imageUrl = cfg.extractUrl(data) || null;
    if (!imageUrl) {
      console.error(`[gen-image] ${cfg.label} returned no image URL:`, JSON.stringify(data).slice(0, 200));
      return { error: `${cfg.label} 返回无图片 URL: ${JSON.stringify(data).slice(0, 120)}` };
    }
  } catch (e) {
    const msg = e?.name === 'AbortError' ? `生成超时(${IMAGE_TIMEOUT_MS}ms)` : (e?.message || String(e));
    console.error(`[gen-image] ${cfg.label} call failed:`, msg);
    return { error: msg };
  } finally {
    clearTimeout(timer);
  }

  // 返回的 URL 是临时的,立即下载并持久化到 storage(本地或 S3)
  try {
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) {
      console.error(`[gen-image] download image failed: HTTP ${imgRes.status}`);
      return { error: `下载图片失败(HTTP ${imgRes.status})` };
    }
    const buf = Buffer.from(await imgRes.arrayBuffer());

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

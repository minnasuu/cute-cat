/**
 * gen-image —— 智谱 CogView 文生图公共 helper。
 *
 * generateImage(prompt, { teamId, aspectRatio, safeName }) →
 *   成功 { url, prompt, model }
 *   失败 { error }(具体错误信息,便于前端/日志定位)
 *
 * 接口:OpenAI 兼容 /images/generations (智谱开放平台),返回临时 URL → 下载落盘。
 * 供设计工作流/旧流水线共用。
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * 把设计工作流的 aspectRatio 映射到 CogView 支持的 size。
 * CogView-3/3-Plus 常用:1024x1024 / 864x1152(3:4) / 1440x720(≈16:9) / 768x1344 等。
 * 未匹配到的退回 1024x1024(全模型支持)。
 */
function aspectRatioToSize(aspectRatio) {
  const map = {
    '1:1': '1024x1024',
    '3:4': '864x1152',
    '4:3': '1152x864',
    '9:16': '768x1344',
    '16:9': '1440x720',
  };
  return map[String(aspectRatio)] || '1024x1024';
}

/**
 * 调用 CogView 生成一张图片。
 * @param {string} prompt 英文 prompt
 * @param {object} opts
 * @param {string} opts.teamId 团队 ID(用作 uploads 子目录)
 * @param {string} [opts.aspectRatio='1:1'] 设计工作流比例(自动映射到 CogView size)
 * @param {string} [opts.safeName='image'] 文件名前缀
 * @param {number} [opts.numberOfImages=1] 张数(CogView 单张生成,>1 时只取 1)
 * @returns {Promise<{ url: string, prompt: string, model: string } | { error: string }>}
 */
async function generateImage(prompt, opts) {
  const { teamId, aspectRatio = '1:1', safeName = 'image', numberOfImages = 1 } = opts || {};
  if (!prompt || !prompt.trim()) {
    return { error: 'empty prompt' };
  }
  const apiKey = process.env.GLM_API_KEY;
  if (!apiKey) {
    return { error: 'GLM_API_KEY not set' };
  }
  if (!teamId) {
    return { error: 'teamId required' };
  }

  const baseUrl = process.env.GLM_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4';
  const model = process.env.GLM_IMAGE_MODEL || 'cogview-3';
  const size = aspectRatioToSize(aspectRatio);
  // CogView 单张生成;调用方 numberOfImages 通常为 1
  const n = Math.min(Math.max(Number(numberOfImages) || 1, 1), 1);
  const source = `${model}/${size}`;

  // 单张生成超时(默认 120s)——CogView 通常 30~90s
  const IMAGE_TIMEOUT_MS = Number.parseInt(process.env.IMAGE_TIMEOUT_MS || '', 10) || 120000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);

  let imageUrl;
  try {
    console.log(`[gen-image] generating: model=${model}, size=${size}, prompt=${prompt.slice(0, 60)}…`);
    const res = await fetch(`${baseUrl}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, prompt, size, n, response_format: 'url' }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[gen-image] CogView API ${res.status} (${source}): ${errText.slice(0, 300)}`);
      return { error: `CogView HTTP ${res.status}: ${errText.slice(0, 200)}` };
    }

    const data = await res.json();
    imageUrl = data?.data?.[0]?.url || null;
    if (!imageUrl) {
      console.error('[gen-image] CogView returned no image URL:', JSON.stringify(data).slice(0, 200));
      return { error: `CogView 返回无图片 URL: ${JSON.stringify(data).slice(0, 120)}` };
    }
  } catch (e) {
    const msg = e?.name === 'AbortError' ? `生成超时(${IMAGE_TIMEOUT_MS}ms)` : (e?.message || String(e));
    console.error('[gen-image] CogView call failed:', msg);
    return { error: msg };
  } finally {
    clearTimeout(timer);
  }

  // CogView 返回的 URL 是临时的,立即下载落盘到本地 uploads,保持与旧逻辑一致的 /uploads/… 服务
  try {
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) {
      console.error(`[gen-image] download image failed: HTTP ${imgRes.status}`);
      return { error: `下载图片失败(HTTP ${imgRes.status})` };
    }
    const buf = Buffer.from(await imgRes.arrayBuffer());

    const uploadsRoot = path.join(__dirname, '..', 'uploads');
    const outDir = path.join(uploadsRoot, String(teamId), 'design');
    fs.mkdirSync(outDir, { recursive: true });

    const cleanSafe = String(safeName || 'image').replace(/[^a-zA-Z0-9一-龥_-]+/g, '-').slice(0, 60) || 'image';
    const filename = `${Date.now()}-${cleanSafe}-${crypto.randomBytes(6).toString('hex')}.png`;
    const absPath = path.join(outDir, filename);
    fs.writeFileSync(absPath, buf);

    const url = `/uploads/${teamId}/design/${filename}`;
    console.log(`[gen-image] done: ${source}, saved=${filename}`);
    return { url, prompt, model };
  } catch (e) {
    console.error('[gen-image] save image failed:', e?.message || String(e));
    return { error: `保存图片失败: ${e?.message || e}` };
  }
}

module.exports = { generateImage };

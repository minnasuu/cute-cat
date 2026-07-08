/**
 * gen-image —— Imagen 文生图公共 helper。
 *
 * generateImage(prompt, { teamId, aspectRatio, safeName }) → 成功 { url, prompt, model }
 * 失败返回 null(不抛异常)。
 *
 * 复用 pixel-image.js 的 Imagen 调用逻辑 + 文件落盘,供设计工作流/旧流水线共用。
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let _GoogleGenAI = null;
async function getGoogleGenAI() {
  if (!_GoogleGenAI) {
    const mod = await import('@google/genai');
    _GoogleGenAI = mod.GoogleGenAI;
  }
  return _GoogleGenAI;
}

async function createGeminiClient() {
  const GoogleGenAI = await getGoogleGenAI();
  const baseUrl = process.env.GEMINI_BASE_URL;
  const opts = { apiKey: process.env.GEMINI_API_KEY };
  if (baseUrl) opts.httpOptions = { baseUrl };
  return new GoogleGenAI(opts);
}

/**
 * 调用 Imagen 生成一张图片。
 * @param {string} prompt 英文 prompt
 * @param {object} opts
 * @param {string} opts.teamId 团队 ID(用作 uploads 子目录)
 * @param {string} [opts.aspectRatio='1:1'] Imagen 比例
 * @param {string} [opts.safeName='image'] 文件名前缀
 * @param {number} [opts.numberOfImages=1] 张数(默认 1)
 * @returns {Promise<{ url: string, prompt: string, model: string } | null>}
 */
async function generateImage(prompt, opts) {
  const { teamId, aspectRatio = '1:1', safeName = 'image', numberOfImages = 1 } = opts || {};
  if (!prompt || !prompt.trim()) {
    console.warn('[gen-image] empty prompt');
    return null;
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('[gen-image] GEMINI_API_KEY not set');
    return null;
  }
  if (!teamId) {
    console.warn('[gen-image] teamId required');
    return null;
  }

  let ai;
  try {
    ai = await createGeminiClient();
  } catch (e) {
    console.error('[gen-image] createGeminiClient failed:', e.message);
    return null;
  }

  const model = process.env.IMAGEN_MODEL || 'imagen-4.0-generate-001';

  let response;
  try {
    response = await ai.models.generateImages({
      model,
      prompt,
      config: { numberOfImages, aspectRatio },
    });
  } catch (e) {
    console.error('[gen-image] Imagen call failed:', e?.message || String(e));
    return null;
  }

  const first = response?.generatedImages?.[0];
  const imgBytesB64 = first?.image?.imageBytes || first?.imageBytes || null;
  if (!imgBytesB64) {
    console.error('[gen-image] Imagen returned empty image data');
    return null;
  }

  const uploadsRoot = path.join(__dirname, '..', 'uploads');
  const outDir = path.join(uploadsRoot, String(teamId), 'design');
  fs.mkdirSync(outDir, { recursive: true });

  const cleanSafe = String(safeName || 'image').replace(/[^a-zA-Z0-9一-龥_-]+/g, '-').slice(0, 60) || 'image';
  const filename = `${Date.now()}-${cleanSafe}-${crypto.randomBytes(6).toString('hex')}.png`;
  const absPath = path.join(outDir, filename);
  fs.writeFileSync(absPath, Buffer.from(String(imgBytesB64), 'base64'));

  const url = `/uploads/${teamId}/design/${filename}`;
  return { url, prompt, model };
}

module.exports = { generateImage };

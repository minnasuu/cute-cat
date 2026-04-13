'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { runWithAIStream, extractUpstreamText } = require('../_framework');

// 延迟加载 Google GenAI（ESM-only 包）
let _GoogleGenAI = null;
async function getGoogleGenAI() {
  if (!_GoogleGenAI) {
    const mod = await import('@google/genai');
    _GoogleGenAI = mod.GoogleGenAI;
  }
  return _GoogleGenAI;
}

async function createGeminiClient(apiKey) {
  const GoogleGenAI = await getGoogleGenAI();
  const baseUrl = process.env.GEMINI_BASE_URL;
  const opts = { apiKey };
  if (baseUrl) opts.httpOptions = { baseUrl };
  return new GoogleGenAI(opts);
}

function ensureDir(absDir) {
  fs.mkdirSync(absDir, { recursive: true });
}

function safeNameFrom(text) {
  const s = String(text || '').trim().slice(0, 40);
  const cleaned = s.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-');
  return cleaned || 'image';
}

module.exports = async function runPixelImage(ctx) {
  const upstream = extractUpstreamText(ctx.merged);
  const userInput = String(ctx.context?.userInput || '').trim();
  const workflowName = String(ctx.context?.workflowName || '').trim();
  const runId = String(ctx.context?.runId || '').trim();

  // 1) 让文本模型先产出英文 prompt（Imagen 对英文更稳定）
  const translateSystem = `你是资深视觉提示词工程师。
把用户的中文需求整理成「英文」图片生成 prompt（适配 Imagen 文生图）。
要求：
- 只输出英文 prompt（一段即可），不要解释，不要加引号，不要加 Markdown。
- 具体、可视化、包含材质/配色/风格/光照/构图要点
- 不要出现裸露/未成年人/侵权品牌商标等敏感内容
- 如果是商品图：用干净背景，强调主体细节`;

  const translateUser = [
    workflowName ? `任务：${workflowName}` : null,
    userInput ? `用户输入：${userInput}` : null,
    upstream ? `上游信息：${upstream}` : null,
  ].filter(Boolean).join('\n');

  const promptResult = await runWithAIStream(
    'pixel-image',
    ctx,
    translateSystem,
    translateUser || '请生成一段英文图片提示词',
    { maxTokens: 512 },
  );

  if (!promptResult.success) return promptResult;
  const prompt = String(promptResult.data?.text || '').trim();
  if (!prompt) {
    return {
      success: false,
      status: 'error',
      data: { text: '' },
      summary: '[pixel-image] prompt 生成失败（空）',
    };
  }

  // 2) 调用 Imagen 生成图片（返回 base64 bytes）
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      success: false,
      status: 'error',
      data: { text: '' },
      summary: 'GEMINI_API_KEY not set（无法生成图片）',
    };
  }

  const ai = await createGeminiClient(apiKey);
  const model = process.env.IMAGEN_MODEL || 'imagen-4.0-generate-001';

  let response;
  try {
    response = await ai.models.generateImages({
      model,
      prompt,
      config: {
        numberOfImages: 1,
        // 视觉工作流默认 1:1；未来可从 step.params 透传
        aspectRatio: '1:1',
      },
    });
  } catch (e) {
    return {
      success: false,
      status: 'error',
      data: { text: '' },
      summary: `[pixel-image] Imagen 调用失败: ${e?.message || String(e)}`,
    };
  }

  const imgBytesB64 =
    response?.generatedImages?.[0]?.image?.imageBytes ||
    response?.generatedImages?.[0]?.imageBytes ||
    null;

  if (!imgBytesB64) {
    return {
      success: false,
      status: 'error',
      data: { text: '' },
      summary: '[pixel-image] Imagen 返回空图片数据',
    };
  }

  // 3) 落盘到 /uploads，返回可访问 URL
  const uploadsRoot = path.join(__dirname, '..', '..', '..', 'uploads');
  const userScope = String(ctx.userEmail || 'anonymous')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .slice(0, 64) || 'anonymous';
  const outDir = runId
    ? path.join(uploadsRoot, userScope, runId)
    : path.join(uploadsRoot, userScope);
  ensureDir(outDir);

  const filename = `${Date.now()}-${safeNameFrom(workflowName)}-${crypto.randomBytes(6).toString('hex')}.png`;
  const absPath = path.join(outDir, filename);
  const buffer = Buffer.from(String(imgBytesB64), 'base64');
  fs.writeFileSync(absPath, buffer);

  const rel = runId ? `${userScope}/${runId}/${filename}` : `${userScope}/${filename}`;
  const url = `/uploads/${rel}`;

  return {
    success: true,
    status: 'success',
    data: {
      text: url,
      _resultType: 'image',
      imageUrl: url,
      prompt,
      model,
    },
    summary: `已生成图片：${url}`,
  };
};


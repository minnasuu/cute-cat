/**
 * analyze-inspiration —— 用 AI 视觉模型分析灵感图片,提取归类 + 设计信息。
 *
 * 输入:图片 buffer + mime。
 * 输出:{ result, error }:
 *   - 成功 → { result: {...}, error: null }
 *   - 失败 → { result: null, error: 'key' | 'mime' | 'file' | 'api:xxx' | 'json:...' | 'empty' }
 *
 * provider(INSPIRATION_AI_PROVIDER):
 *   - openai(LONGCAT_BASE_URL/LONGCAT_API_KEY/LONGCAT_MODEL 或 OPENAI_BASE_URL/OPENAI_API_KEY/OPENAI_MODEL)
 *   - qwen(QWEN_BASE_URL/QWEN_API_KEY/QWEN_MODEL)
 *   - gemini(GEMINI_BASE_URL/GEMINI_API_KEY/GEMINI_MODEL)  -- 通过 @google/genai SDK,支持 inline image
 * 默认:打开可用 key 的第一个(qwen → gemini → openai)
 */

'use strict';

const PROMPT = `你是一位时尚品牌 Laisse Ancie (来兮·安兮)的资深设计研究员。仔细观察这张图片,从服装设计专业视角输出 JSON 分析。

要求:
- category: 图片主体分类 —— 上装 | 下装 | 连衣裙 | 外套 | 配饰 | 印花 | 灵感 | 其他
- silhouette: 整体廓形 — A字 | H字 | O型 | 茧型 | 修身 | 宽松 | 直筒 | 鱼尾 | 层叠 | 其他
- colors: 图片中的主要配色(Hex 数组,最多 4 个),如 ["#1f3a44","#d8c9a3"]
- designHighlights(3-5 条): 设计亮点 — 结构、面料、工艺、细节元素上的突出之处
- styleFeatures(2-3 条): 整体风格关键词 — 如 极简、浪漫、前卫、东方、街头、松弛、华丽
- brandAnalysis: 100 字以内的整体设计语言叙述,告诉设计师"这件产品讲了一个什么样的故事"

只输出 JSON,不要寒暄,不要代码块标记:`;

function extractJson(text) {
  if (!text) return '';
  const fence = text.match(/`{3}(?:json)?\s*([\s\S]*?)\s*`{3}/);
  if (fence) return fence[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) return text.slice(start, end + 1);
  return text;
}

function mediaTypeToExtension(mimeType) {
  return mimeType === 'image/jpeg' ? 'jpeg'
    : mimeType === 'image/png' ? 'png'
    : mimeType === 'image/webp' ? 'webp'
    : mimeType === 'image/gif' ? 'gif'
    : null;
}

// ─── OpenAI‑compatible (Qwen/LongCat/OpenAI) ───────────────────
async function analyzeOpenAi({ baseUrl, apiKey, model, dataUrl, mimeType, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model, max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: dataUrl } },
            { type: 'text', text: PROMPT },
          ],
        }],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const t = (await res.text()).replace(/\s+/g, ' ').slice(0, 200);
      return { error: `api:${res.status}:${t}` };
    }
    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content || '';
    if (!raw) return { error: 'empty' };
    return { raw };
  } catch (err) {
    if (err.name === 'AbortError') return { error: `net:timeout(${timeoutMs}ms)` };
    return { error: `net:${err.name || 'unknown'}` };
  } finally {
    clearTimeout(timer);
  }
}

// ─── Gemini (原生 SDK,内联 base64 小图) ───────────────────────
async function analyzeGemini({ apiKey, model, imageBuffer, mimeType, timeoutMs }) {
  let GoogleGenAI;
  try {
    GoogleGenAI = (await import('@google/genai')).GoogleGenAI;
  } catch (e) {
    return { error: `no-sdk:@google/genai` };
  }
  const ext = mediaTypeToExtension(mimeType);
  if (!ext) return { error: 'mime' };
  const client = new GoogleGenAI({ apiKey });

  const timer = setTimeout(() => {}, timeoutMs);
  try {
    const resp = await client.models.generateContent({
      model,
      contents: [
        { inlineData: { mimeType, data: imageBuffer.toString('base64') } },
        { text: PROMPT },
      ],
      generationConfig: { maxOutputTokens: 1024, temperature: 0.7 },
    });
    const raw = resp?.text || '';
    if (!raw) return { error: 'empty' };
    return { raw };
  } catch (err) {
    if (err.name === 'AbortError') return { error: `net:timeout(${timeoutMs}ms)` };
    return { error: `net:${err.name || 'unknown'}:${(err.message || '').slice(0, 100)}` };
  } finally {
    clearTimeout(timer);
  }
}

async function analyzeInspiration(imageBuffer, mimeType) {
  if (!imageBuffer || !imageBuffer.length) {
    return { result: null, error: 'file' };
  }
  const ext = mediaTypeToExtension(mimeType);
  if (!ext) {
    return { result: null, error: 'mime' };
  }
  const timeoutMs = Number.parseInt(process.env.INSPIRATION_AI_TIMEOUT_MS || '', 10) || 30000;

  /** @type {Array<{name:string,run:Function}>} */
  const providers = [];

  // 优先级 1: INSPIRATION_AI_PROVIDER 显式指定
  const forced = (process.env.INSPIRATION_AI_PROVIDER || '').toLowerCase().trim();

  // openai 大类 (qwen/openai/longcat 都走同一路径,只是 env var 名不同)
  const openVariants = [
    { name: 'qwen',  base: process.env.QWEN_BASE_URL,  key: process.env.QWEN_API_KEY,  model: process.env.QWEN_MODEL },
    { name: 'openai', base: process.env.OPENAI_BASE_URL, key: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL },
    { name: 'longcat', base: process.env.LONGCAT_BASE_URL, key: process.env.LONGCAT_API_KEY, model: process.env.LONGCAT_MODEL },
  ].filter((v) => v.key && v.base);
  // 没配 base 的 openai/openai 默认补 https://api.openai.com
  for (const v of openVariants) {
    if (!v.base) v.base = 'https://api.openai.com';
  }
  // 显式模型名优先级最高
  const explicitModel = (process.env.INSPIRATION_AI_MODEL || '').trim();

  for (const v of openVariants) {
    const model = explicitModel || v.model || (v.name === 'openai' ? 'gpt-4o-mini' : '');
    if (!model) continue;
    providers.push({
      name: v.name,
      run: () => analyzeOpenAi({ baseUrl: v.base, apiKey: v.key, model, dataUrl: `data:${mimeType};base64,${imageBuffer.toString('base64')}`, mimeType, timeoutMs }),
    });
  }

  // gemini
  if (process.env.GEMINI_API_KEY) {
    providers.push({
      name: 'gemini',
      run: () => analyzeGemini({
        apiKey: process.env.GEMINI_API_KEY,
        model: explicitModel || process.env.GEMINI_MODEL || 'gemini-2.0-flash',
        imageBuffer, mimeType, timeoutMs,
      }),
    });
  }

  if (forced) {
    const match = providers.filter((p) => p.name === forced);
    if (match.length === 0) {
      return { result: null, error: `no-provider:${forced}` };
    }
    providers.splice(0, providers.length, ...match);
  }

  if (providers.length === 0) {
    console.warn('[analyze-inspiration] no AI provider (qwen/openai/gemini) configured with both key + base');
    return { result: null, error: 'key' };
  }

  let lastError = 'key';
  for (const p of providers) {
    try {
      console.log(`[analyze-inspiration] try provider=${p.name}`);
      const { raw, error } = await p.run();
      if (error) {
        lastError = `${p.name}:${error}`;
        console.warn(`[analyze-inspiration] provider=${p.name} failed: ${error}`);
        continue;
      }
      try {
        const parsed = JSON.parse(extractJson(raw));
        console.log(`[analyze-inspiration] done via ${p.name}: category=${parsed.category}`);
        return { result: parsed, error: null };
      } catch (e) {
        console.error(`[analyze-inspiration] provider=${p.name} JSON parse fail: ${e.message}; raw=${raw.slice(0, 120)}`);
        lastError = `${p.name}:json`;
        continue;
      }
    } catch (err) {
      lastError = `${p.name}:exception:${err.message}`;
      console.error(`[analyze-inspiration] provider=${p.name} threw: ${err.message}`);
    }
  }
  return { result: null, error: lastError };
}

module.exports = { analyzeInspiration };

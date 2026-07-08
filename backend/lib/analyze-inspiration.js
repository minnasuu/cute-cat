/**
 * analyze-inspiration —— 用 AI 视觉模型分析灵感图片,提取归类 + 设计信息。
 *
 * 输入:图片 buffer + mime。
 * 输出:{ result, error }:
 *   - 成功 → { result: {...}, error: null }
 *   - 失败 → { result: null, error: 'key' | 'mime' | 'file' | 'api:xxx' | 'json' | 'empty' }
 *     调用方可把 error 记录到 DB 并反馈给用户,用于排错。
 *
 * 模型:复用 LongCat(OpenAI 兼容,走 /v1/chat/completions + Bearer <REDACTED>),通过 image_url data-URI 传图。
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
  const fence = text.match(/`{3}(?:json)?\s*([\s\S]*?)\s*`{3}/);
  if (fence) return fence[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) return text.slice(start, end + 1);
  return text;
}

async function analyzeInspiration(imageBuffer, mimeType) {
  const apiKey = process.env.LONGCAT_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn('[analyze-inspiration] LONGCAT_API_KEY/OPENAI_API_KEY not set, skip AI analysis');
    return { result: null, error: 'key' };
  }

  const baseUrl = (process.env.LONGCAT_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.openai.com').replace(/\/+$/, '');
  const model = process.env.INSPIRATION_AI_MODEL || process.env.LONGCAT_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const maxTokens = 1024;
  const timeoutMs = Number.parseInt(process.env.INSPIRATION_AI_TIMEOUT_MS || '', 10) || 30000;

  const mediaType = mimeType === 'image/jpeg' ? 'image/jpeg'
    : mimeType === 'image/png' ? 'image/png'
    : mimeType === 'image/webp' ? 'image/webp'
    : mimeType === 'image/gif' ? 'image/gif'
    : null;
  if (!mediaType) {
    console.warn(`[analyze-inspiration] unsupported mime: ${mimeType}`);
    return { result: null, error: 'mime' };
  }

  const b64 = imageBuffer.toString('base64');
  const dataUrl = `data:${mediaType};base64,${b64}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    console.log(`[analyze-inspiration] analyzing image (${imageBuffer.length} bytes, ${mediaType}, model=${model}, baseUrl=${baseUrl})`);
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
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
      const errText = await res.text();
      // 把响应体裁到 200 字符内,拼进 error 里——前端可以直接看到 API 真实拒绝原因
      const reason = errText.replace(/\s+/g, ' ').slice(0, 200);
      console.error(`[analyze-inspiration] API ${res.status}: ${errText}`);
      return { result: null, error: `api:${res.status}:${reason}` };
    }

    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content || '';
    if (!raw) {
      console.error('[analyze-inspiration] model returned empty content');
      return { result: null, error: 'empty' };
    }

    const parsed = JSON.parse(extractJson(raw));
    console.log(`[analyze-inspiration] done: category=${parsed.category}, style=${parsed.styleFeatures && parsed.styleFeatures.join('/')}`);
    return { result: parsed, error: null };
  } catch (err) {
    const reason = err.name === 'AbortError' ? `timeout(${timeoutMs}ms)` : err.message;
    console.error('[analyze-inspiration] failed:', reason);
    if (err instanceof SyntaxError) return { result: null, error: 'json' };
    return { result: null, error: `net:${err.name || 'unknown'}` };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { analyzeInspiration };

/**
 * analyze-inspiration —— 用 AI 视觉模型分析灵感图片,提取归类 + 设计信息。
 *
 * 输入:图片 buffer + mime。
 * 输出:{ result, error }:
 *   - 成功 → { result: {...}, error: null }
 *   - 失败 → { result: null, error: 'key' | 'mime' | 'file' | 'api:xxx' | 'json:...' | 'empty' }
 *
 * provider:火山方舟(Ark) Seed 视觉模型,调用 /responses 新接口。
 *   环境变量:
 *     ARK_API_KEY           必需 —— 方舟 API Key(与生图共用同一 Key)
 *     ARK_BASE_URL          可选 —— 默认 https://ark.cn-beijing.volces.com/api/v3
 *     INSPIRATION_AI_MODEL  可选 —— 视觉模型 ID,默认 doubao-seed-2-1-pro-260628
 *   注意:图片以 base64 data URL 形式通过 input_image.image_url 传入;若 Ark
 *   未来版本拒绝 data URL,需在此之前先把图片上传到可访问的公开 URL。
 */

'use strict';

const PROMPT = `你是一位时尚生活方式品牌「Laisse Ancie 来兮·安兮」的资深设计研究员。仔细观察这张图片 —— 它可能是一件服装(T恤、连衣裙、外套...)、一件配饰(包袋、鞋履、首饰...)、一个时尚单品(手机壳、玩偶挂件...)、一张插画或平面作品,甚至任何激发时尚灵感的物件。

请按以下 4 个维度输出 JSON 分析:

1. category(字符串): 图片主体是什么 —— 用简短的名词短语描述,如「T恤」、「托特包」、「油画风插画」、「亚克力手机壳」、「羊毛针织帽」,避免笼统写「服装」或「单品」
2. visualStyle(字符串,1-2 句): 视觉风格定位 —— 如「手绘日系插画风,线条轻盈,低饱和莫兰迪色」、「Y2K 未来主义,金属质感搭配高饱和渐变」、「法式田园油画感,柔和的笔触和暖色调光影」
3. designApproach(字符串,1-2 句): 设计思路 —— 核心创意、构图手法、色彩策略、材质运用、最巧妙的设计决策是什么,要用设计师能读懂的语言描述(举例格式:「巧妙地把气球轮廓作为领口镂空的图形语言,形成正负形的趣味转换」)
4. inspiration(数组,3-5 条): 设计启发 —— 从这张图可以提取哪些可复用的设计方法,每条一行,可操作、可落地,如「可尝试将植物叶脉纹理用作绗缝走线图案」「高饱和撞色方案值得在春夏系列中沿用」

注意:
- 如果图片是插画/平面作品,designApproach 聚焦构图、配色、线条、图形语言的妙处
- 如果图片是产品/实物,designApproach 聚焦造型、材质、工艺、结构的妙处
- 只输出一个合法 JSON 对象,不要寒暄,不要代码块标记,不要任何前后说明文字:`;

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

// ─── Ark Seed 视觉模型 (POST /responses) ─────────────────────
async function analyzeArk({ apiKey, baseUrl, model, dataUrl, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(`${baseUrl}/responses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        input: [{
          role: 'user',
          content: [
            { type: 'input_image', image_url: dataUrl },
            { type: 'input_text', text: PROMPT },
          ],
        }],
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') return { error: `net:timeout(${timeoutMs}ms)` };
    return { error: `net:${err.name || 'unknown'}` };
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const t = (await res.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300);
    return { error: `api:${res.status}:${t}` };
  }

  let data;
  try {
    data = await res.json();
  } catch (e) {
    return { error: 'api:invalid-json' };
  }

  // Ark /responses 输出格式(兜底多种可能):
  //   { output: [ { type:'message', content: [ { type:'output_text', text:'...' } ] } ] }
  // 或 { output_text: '...' } 等 —— 逐级尝试。
  const candidates = [];
  if (typeof data === 'string') candidates.push(data);
  if (data?.output_text) candidates.push(data.output_text);
  if (Array.isArray(data?.output)) {
    for (const item of data.output) {
      if (typeof item?.text === 'string') candidates.push(item.text);
      if (Array.isArray(item?.content)) {
        for (const c of item.content) {
          if (typeof c?.text === 'string') candidates.push(c.text);
        }
      }
    }
  }
  const raw = candidates.find((t) => t && t.trim()) || '';

  if (!raw) {
    const dbg = JSON.stringify(data).slice(0, 400);
    console.warn(`[analyze-inspiration] Ark /responses returned no parseable text: ${dbg}`);
    // 把完整结构顺带带出,方便调用方排查
    return { raw: '', error: `empty:${dbg}` };
  }
  return { raw };
}

async function analyzeInspiration(imageBuffer, mimeType) {
  if (!imageBuffer || !imageBuffer.length) {
    return { result: null, error: 'file' };
  }
  const ext = mediaTypeToExtension(mimeType);
  if (!ext) {
    return { result: null, error: 'mime' };
  }
  // 视觉分析需要更长的超时:图片 base64 传输 + 视觉模型推理 + 4 维度 JSON 生成 (默认 90s)
  const timeoutMs = Number.parseInt(process.env.INSPIRATION_AI_TIMEOUT_MS || '', 10) || 90000;

  const apiKey = (process.env.ARK_API_KEY || '').trim();
  if (!apiKey) {
    console.warn('[analyze-inspiration] ARK_API_KEY not set');
    return { result: null, error: 'key' };
  }
  const baseUrl = (process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/+$/, '');
  const model = (process.env.INSPIRATION_AI_MODEL || 'doubao-seed-2-1-pro-260628').trim();
  const dataUrl = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;

  let lastError = 'key';
  try {
    console.log(`[analyze-inspiration] Ark model=${model}`);
    const { raw, error } = await analyzeArk({ apiKey, baseUrl, model, dataUrl, timeoutMs });
    if (error) {
      if (error.startsWith('empty:')) {
        // Ark 返回了但没提取到文本——携带响应结构到 error 里,便于排查
        return { result: null, error: `ark-empty` };
      }
      return { result: null, error };
    }
    try {
      const parsed = JSON.parse(extractJson(raw));
      console.log(`[analyze-inspiration] done: category=${parsed.category}`);
      return { result: parsed, error: null };
    } catch (e) {
      console.error(`[analyze-inspiration] JSON parse fail: ${e.message}; raw=${raw.slice(0, 200)}`);
      return { result: null, error: `json:${e.message}` };
    }
  } catch (err) {
    lastError = `exception:${err.message}`;
    console.error(`[analyze-inspiration] Ark threw: ${err.message}`);
  }
  return { result: null, error: lastError };
}

module.exports = { analyzeInspiration };

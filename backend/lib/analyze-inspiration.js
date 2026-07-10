/**
 * analyze-inspiration —— 用 AI 视觉模型分析灵感图片,提取归类 + 设计信息。
 *
 * 输入:图片 buffer + mime,或 imageUrl(http(s) URL / base64 data URL)。
 * 输出:{ result, error }:
 *   - 成功 → { result: {...}, error: null }
 *   - 失败 → { result: null, error: 'key' | 'mime' | 'file' | 'api:xxx' | 'json:...' | 'empty' }
 *
 * provider:火山方舟(Ark) Seed 视觉模型,调用 /chat/completions 视觉接口(流式)。
 *   请求体格式(messages[].content 混合 image_url + text):
 *     { model, stream:true, messages:[{ role:"system", content:[{type:"text",text:SYSTEM_PROMPT}] },
 *                                    { role:"user",   content:[{type:"image_url",image_url:{url:<图片URL或data:>}},
 *                                                           {type:"text",text:PROMPT}] } ] }
 *   环境变量:
 *     ARK_API_KEY      必需 —— 方舟 API Key(全局 2 个豆包模型共用同一 Key)
 *     ARK_BASE_URL     可选 —— 默认 https://ark.cn-beijing.volces.com/api/v3
 *     ARK_TEXT_MODEL   可选 —— 文本/视觉解析模型 ID,默认 doubao-seed-2-1-pro-260628
 *                        (与 workflow-executor 文本生成共用同一变量)
 *   注意:image_url 支持 http(s) URL 与 base64 data URL;优先外部 URL(省 base64 传输),
 *        无 URL 时把 buffer 编码为 data URL 兜底。
 */

'use strict';

const SYSTEM_PROMPT = `你是 Laisse Ancie (来兮·安兮)的 AI 设计研究员。基于用户给的灵感图片做归类分析 + 设计解读,只输出严格的 JSON(不要 Markdown 代码块、不要寒暄、不要前后说明文字)。`;

const PROMPT = `仔细观察这张图片 —— 它可能是一件服装(T恤、连衣裙、外套...)、一件配饰(包袋、鞋履、首饰...)、一个时尚单品(手机壳、玩偶挂件...)、一张插画或平面作品,甚至任何激发时尚灵感的物件。

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

// ─── Ark Seed 视觉模型 (POST /chat/completions,流式,视觉接口) ──
// 请求体格式(messages[].content 混合 image_url + text):
//   { model, stream:true,
//     messages:[{ role:"system", content:[{type:"text",text:SYSTEM_PROMPT}] },
//                { role:"user",  content:[{type:"image_url",image_url:{url:imageRef}},
//                                       {type:"text",text:PROMPT}] } ] }
async function analyzeArk({ apiKey, baseUrl, model, imageRef, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        stream: true,
        temperature: 0.7,
        max_tokens: 2048,
        messages: [
          { role: 'system', content: [{ type: 'text', text: SYSTEM_PROMPT }] },
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: imageRef } },
              { type: 'text', text: PROMPT },
            ],
          },
        ],
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

  // 流式解析:SSE data: {choices:[{delta:{content:"..."}}]} → 拼接 fullText
  const reader = res.body;
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  try {
    for await (const chunk of reader) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (!trimmed.startsWith('data: ')) continue;
        try {
          const json = JSON.parse(trimmed.slice(6));
          const delta = json.choices?.[0]?.delta?.content || '';
          if (delta) fullText += delta;
        } catch { /* skip malformed line */ }
      }
    }
  } catch (e) {
    return { error: `net:stream-read:${e.message}` };
  }

  if (!fullText.trim()) {
    return { error: `empty:stream-returned-no-text` };
  }
  return { raw: fullText };
}

/**
 * AI 视觉分析灵感图片。
 * 两种二选一输入(优先 imageUrl):
 *   - imageUrl: 图片 HTTP(S) URL 或 base64 data URL,直接给 Ark 服务端拉取(推荐,省 base64 传输)
 *   - imageBuffer + mimeType: 本地 buffer → base64 data URL(兜底)
 * 返回 { result, error }(error 为 'file'|'mime'|'key'|'api:..' 等,供前端/重试接口定位)
 */
async function analyzeInspiration(imageBuffer, mimeType, imageUrl) {
  // 视觉分析需要更长的超时:图片 base64 传输 + 视觉模型推理 + 4 维度 JSON 生成 (默认 90s)
  const timeoutMs = Number.parseInt(process.env.INSPIRATION_AI_TIMEOUT_MS || '', 10) || 90000;

  const apiKey = (process.env.ARK_API_KEY || '').trim();
  if (!apiKey) {
    console.warn('[analyze-inspiration] ARK_API_KEY not set');
    return { result: null, error: 'key' };
  }
  const baseUrl = (process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/+$/, '');
  const model = (process.env.ARK_TEXT_MODEL || 'doubao-seed-2-1-pro-260628').trim();

  // 决定给 Ark 的图片引用:优先外部 URL,否则把 buffer 编码为 base64 data URL
  let imageRef;
  if (imageUrl) {
    imageRef = imageUrl;
  } else {
    if (!imageBuffer || !imageBuffer.length) {
      return { result: null, error: 'file' };
    }
    const ext = mediaTypeToExtension(mimeType);
    if (!ext) {
      return { result: null, error: 'mime' };
    }
    imageRef = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;
  }

  let lastError = 'key';
  try {
    // 诊断:截断打印 imageRef 前 60 字符,排查空 URL / 错误格式(400 MissingParameter 时直接对照)
    console.log(`[analyze-inspiration] Ark model=${model}, via=${imageUrl ? 'url' : 'base64'}, imageRef=${imageRef.slice(0, 60)}…`);
    const { raw, error } = await analyzeArk({ apiKey, baseUrl, model, imageRef, timeoutMs });
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

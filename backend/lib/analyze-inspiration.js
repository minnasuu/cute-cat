/**
 * analyze-inspiration —— 用 AI 视觉模型分析灵感图片,提取归类 + 设计信息。
 *
 * 输入:图片 buffer + mime。
 * 输出:{ result, error }:
 *   - 成功 → { result: {...}, error: null }
 *   - 失败 → { result: null, error: 'key' | 'mime' | 'file' | 'api:xxx' | 'json:...' | 'empty' }
 *
 * provider(INSPIRATION_AI_PROVIDER):
 *   - longcat(LONGCAT_BASE_URL/LONGCAT_API_KEY/LONGCAT_MODEL)
 *   - qwen(QWEN_BASE_URL/QWEN_API_KEY/QWEN_MODEL)
 *   - openai(OPENAI_BASE_URL/OPENAI_API_KEY/OPENAI_MODEL)
 * 默认:打开可用 key 的第一个(longcat → qwen → openai)
 */

'use strict';

const PROMPT = `你是一位时尚生活方式品牌「Laisse Ancie 来兮·安兮」的资深设计研究员。仔细观察这张图片 —— 它可能是一件服装(T恤、连衣裙、外套...)、一件配饰(包袋、鞋履、首饰...)、一个数码周边(手机壳、拼图...)、一张插画或平面作品,甚至任何激发时尚灵感的物件。

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

// ─── OpenAI‑compatible (Qwen/LongCat/OpenAI) ───────────────────
async function analyzeOpenAi({ endpoint, apiKey, model, dataUrl, mimeType, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model, max_tokens: 2048,
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

async function analyzeInspiration(imageBuffer, mimeType) {
  if (!imageBuffer || !imageBuffer.length) {
    return { result: null, error: 'file' };
  }
  const ext = mediaTypeToExtension(mimeType);
  if (!ext) {
    return { result: null, error: 'mime' };
  }
  // 视觉分析需要更长的超时:图片 base64 传输 + vision 模型推理 + 4 维度 JSON 生成 (默认 90s)
  const timeoutMs = Number.parseInt(process.env.INSPIRATION_AI_TIMEOUT_MS || '', 10) || 90000;

  /** @type {Array<{name:string,run:Function}>} */
  const providers = [];

  // 优先级 1: INSPIRATION_AI_PROVIDER 显式指定
  const forced = (process.env.INSPIRATION_AI_PROVIDER || '').toLowerCase().trim();
  const explicitModel = (process.env.INSPIRATION_AI_MODEL || '').trim();

  // 组合出完整 OpenAI 端点:如果 base 已经以 /v1 结尾,只追加 /chat/completions;否则追加 /v1/chat/completions
  function openAiEndpoint(base) {
    const b = base.replace(/\/+$/, '');
    return b.endsWith('/v1') ? `${b}/chat/completions` : `${b}/v1/chat/completions`;
  }

  // 默认顺序:longcat 优先(Anthropic 兼容,vision 稳),再 qwen/openai
  // 注意:GLM 没有视觉理解能力,不参与 analyze-inspiration
  // longcat 上游若 403 会自动回退到下一个可用 key

  // 视觉模型列表 (仅支持 image_url 输入的模型)
  const openVariants = [
    { name: 'longcat', base: process.env.LONGCAT_BASE_URL, key: process.env.LONGCAT_API_KEY, model: process.env.LONGCAT_MODEL },
    { name: 'qwen',  base: process.env.QWEN_BASE_URL,  key: process.env.QWEN_API_KEY,  model: process.env.QWEN_MODEL },
    { name: 'openai', base: process.env.OPENAI_BASE_URL, key: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL },
  ].filter((v) => v.key && v.base); // 仅保留配置了 key+base 的

  // 防御:如果 INSPIRATION_AI_PROVIDER 被误设为 glm,直接拒绝
  if (forced === 'glm') {
    console.warn('[analyze-inspiration] INSPIRATION_AI_PROVIDER=glm 不合法,GLM 不支持视觉理解');
    return { result: null, error: 'no-provider:glm (GLM 不支持视觉理解)' };
  }
  for (const v of openVariants) {
    if (!v.base) v.base = 'https://api.openai.com';
  }

  for (const v of openVariants) {
    const model = explicitModel || v.model || (v.name === 'openai' ? 'gpt-4o-mini' : '');
    if (!model) continue;
    providers.push({
      name: v.name,
      run: () => analyzeOpenAi({
        endpoint: openAiEndpoint(v.base),
        apiKey: v.key, model,
        dataUrl: `data:${mimeType};base64,${imageBuffer.toString('base64')}`,
        mimeType, timeoutMs,
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
    console.warn('[analyze-inspiration] no AI provider (longcat/qwen/openai) configured with both key + base');
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

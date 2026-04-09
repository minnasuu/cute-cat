'use strict';

const { runWithAI, extractUpstreamText, resolveSystemPrompt } = require('../_framework');

const FALLBACK_LANDING_CONTENT_MODEL = JSON.stringify({
  version: 1,
  meta: {
    language: 'zh',
    industry: '通用',
    audience: '通用用户',
    conversionGoal: '咨询/购买/报名',
    brandTone: ['清晰', '可信', '现代'],
  },
  sections: [
    {
      id: 'hero',
      type: 'hero',
      headline: '一句话说清楚你的价值',
      subhead: '用清晰的卖点与可信的背书促成转化',
      bullets: ['卖点一（短）', '卖点二（短）', '卖点三（短）'],
      cta: { primary: '立即咨询', secondary: '查看案例' },
    },
    { id: 'benefits', type: 'benefits', headline: '核心卖点', bullets: ['点1', '点2', '点3'] },
    { id: 'proof', type: 'socialProof', headline: '口碑与信任', bullets: ['数据/Logo墙', '用户证言'] },
    { id: 'faq', type: 'faq', headline: '常见问题', faq: [{ q: 'Q1', a: 'A1' }, { q: 'Q2', a: 'A2' }] },
    { id: 'footerCta', type: 'footerCta', headline: '现在就开始', subhead: '给用户一个明确的下一步', cta: { primary: '开始使用' } },
  ],
  constraints: {
    selfContained: true,
    noExternalImages: true,
    editableText: true,
    mobileFirst: true,
  },
  variantsHint: {
    candidateCount: 3,
    preferHighDiversity: true,
  },
});

const SYSTEM_PROMPT = `你是落地页策划/产品架构师，将用户一句话需求转化为「静态单页落地页」的内容模型 JSON（对象）。

## 🚨🚨🚨 最高优先级：短而完整、必须可解析 🚨🚨🚨

- **宁可 sections 少一点、字段少一点，也必须在一次回复内输出完整、可解析的 JSON**，禁止写到一半截断。
- sections 控制在 **5～8 段**；每段 bullets/FAQ 等列表 **最多 3 条**，避免超长。
- 若需求复杂：只保留转化主路径（Hero→卖点/场景→信任→FAQ/价格择一→Footer CTA），其余省略。

## 🚨🚨🚨 只输出 JSON 🚨🚨🚨

你的回复必须**只包含 JSON 对象本身**，不允许包含任何其他内容：
- 回复的第一个字符必须是 \`{\`
- 回复的最后一个字符必须是 \`}\`
- **绝对禁止**在 JSON 前面或后面写任何文字
- **绝对禁止**使用 markdown 代码块 \`\`\`json ... \`\`\` 包裹
- **绝对禁止**输出任何非 JSON 的解释、说明、总结、注释

## 🚨 禁止追问与澄清（与「只输出 JSON」同等重要）

- **绝对禁止**向用户提问、索要补充信息、列举「您可能指的是 A/B/C」、或输出任何对话式引导。
- 即使用户只给了一个词、短语或行业名，也**必须**立刻推断并输出完整 JSON 树。
- 信息不足时：用**精简**通用落地页结构（首屏→卖点→信任→CTA→页脚），**不要**用文字说明「假设」或「待确认」。

## 输出 schema（必须遵守）

{
  "version": 1,
  "meta": {
    "language": "zh",
    "industry": "…",
    "audience": "…",
    "conversionGoal": "…",
    "brandTone": ["…", "…"]
  },
  "sections": [
    {
      "id": "hero",
      "type": "hero",
      "headline": "…",
      "subhead": "…",
      "bullets": ["…", "…"],
      "cta": { "primary": "…", "secondary": "…" }
    }
    // ... 其它 section（5~8 段内）
  ],
  "constraints": {
    "selfContained": true,
    "noExternalImages": true,
    "editableText": true,
    "mobileFirst": true
  },
  "variantsHint": {
    "candidateCount": 3,
    "preferHighDiversity": true
  }
}

## 通用规则

- sections：单页上的独立模块（section），从上到下阅读顺序
- 文案用中文，短句优先；避免技术术语堆砌
- 必须是「静态单页落地页」：**绝对禁止** Tab、多页面、路由、后台管理台、数据看板、列表管理等 IA

## 输出格式

- 仅返回纯 JSON 对象，以 { 开头 } 结尾
- 禁止 markdown、代码块、注释、说明文字
- 字段仅限 schema 中列出的字段（允许某些可选字段缺省）`;

function repairUnclosedJsonContainers(s) {
  let t = String(s || '').trim();
  const start = t.indexOf('[');
  if (start < 0) return t;
  t = t.slice(start);
  let inString = false;
  let escape = false;
  const stack = [];
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (c === '\\') escape = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === '{') {
      stack.push('{');
      continue;
    }
    if (c === '[') {
      stack.push('[');
      continue;
    }
    if (c === '}') {
      if (stack.length && stack[stack.length - 1] === '{') stack.pop();
      continue;
    }
    if (c === ']') {
      if (stack.length && stack[stack.length - 1] === '[') stack.pop();
      continue;
    }
  }
  let out = t.replace(/,\s*$/, '');
  while (stack.length) {
    const top = stack.pop();
    out += top === '{' ? '}' : ']';
  }
  return out.replace(/,\s*([\]}])/g, '$1');
}

function tryParseJsonArray(text) {
  try {
    const v = JSON.parse(text);
    return Array.isArray(v) ? text.trim() : null;
  } catch {
    return null;
  }
}

function tryParseJsonObject(text) {
  try {
    const v = JSON.parse(text);
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    return JSON.stringify(v);
  } catch {
    return null;
  }
}

function normalizeProductArchitectJson(raw) {
  let text = String(raw || '').trim();
  const codeMatch = text.match(/```(?:json|JSON)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeMatch) text = codeMatch[1].trim();

  // 优先提取数组；若工作流要求 JSON 对象（如 Hero 结构）则允许对象直通
  const bracketStart = text.indexOf('[');
  if (bracketStart >= 0) {
    if (bracketStart > 0) text = text.substring(bracketStart);
    const bracketEnd = text.lastIndexOf(']');
    if (bracketEnd >= 0) text = text.substring(0, bracketEnd + 1);
  } else {
    const braceStart = text.indexOf('{');
    if (braceStart > 0) text = text.substring(braceStart);
    const braceEnd = text.lastIndexOf('}');
    if (braceEnd >= 0) text = text.substring(0, braceEnd + 1);
  }

  let repairedBrackets = false;
  const commaFixed = text.replace(/,\s*([\]}])/g, '$1');
  let ok = tryParseJsonArray(commaFixed);
  if (ok) {
    return { text: ok, usedFallback: false, repairedBrackets };
  }

  const objOk = tryParseJsonObject(commaFixed);
  if (objOk) {
    return { text: objOk, usedFallback: false, repairedBrackets };
  }

  const repaired = repairUnclosedJsonContainers(text);
  if (repaired !== text) repairedBrackets = true;
  const repairedComma = repaired.replace(/,\s*([\]}])/g, '$1');
  ok = tryParseJsonArray(repairedComma);
  if (ok) {
    return { text: ok, usedFallback: false, repairedBrackets };
  }

  const repairedObjOk = tryParseJsonObject(repairedComma);
  if (repairedObjOk) {
    return { text: repairedObjOk, usedFallback: false, repairedBrackets };
  }

  return {
    text: FALLBACK_LANDING_CONTENT_MODEL,
    usedFallback: true,
    repairedBrackets,
  };
}

module.exports = async function runProductArchitect(ctx) {
  const { merged } = ctx;
  const userText = extractUpstreamText(merged).trim() || '请根据需求生成落地页模块大纲（JSON 树）';

  const result = await runWithAI('product-architect', ctx, resolveSystemPrompt(SYSTEM_PROMPT, ctx), userText, {
    maxTokens: 8192,
  });

  if (result.success && result.data?.text) {
    const { text, usedFallback, repairedBrackets } = normalizeProductArchitectJson(result.data.text);
    result.data.text = text;
    if (usedFallback) {
      result.status = 'warning';
      result.summary =
        '模型输出未能解析为合法 JSON，已自动使用精简兜底模块大纲（仍可继续生成落地页）';
    } else if (repairedBrackets) {
      result.status = result.status === 'warning' ? 'warning' : 'success';
      result.summary = `落地页模块大纲已生成（${text.length} 字符，已自动补全未闭合括号）`;
    } else {
      result.summary = `落地页模块大纲已生成（${text.length} 字符）`;
    }
  }

  return result;
};

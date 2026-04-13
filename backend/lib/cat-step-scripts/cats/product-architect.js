'use strict';

const { runWithAI, extractUpstreamText, resolveSystemPrompt } = require('../_framework');

const FALLBACK_LANDING_OUTLINE_MD = `## 落地页架构（兜底）

### 1) Hero（首屏）
- **目的**：一句话讲清价值与对象，建立第一印象
- **内容要点**：主标题 / 副标题 / 3 条卖点
- **CTA**：立即咨询（主）｜查看案例（次）

### 2) 核心卖点
- **目的**：把价值拆成可感知的 3 点
- **内容要点**：能力/优势/结果（各 1 条）

### 3) 场景与流程（或 产品如何工作）
- **目的**：让用户快速代入使用场景，降低理解成本
- **内容要点**：3 步流程 / 典型场景 / 适用人群

### 4) 信任背书（社会证明）
- **目的**：消除风险与不确定性
- **内容要点**：关键数据 / 客户 Logo（文字占位）/ 证言（1-2 条）

### 5) FAQ（或 价格/保障 二选一）
- **目的**：回答关键疑虑，推动决策
- **内容要点**：2-3 个最关键问题（短问短答）

### 6) 页脚 CTA
- **目的**：明确下一步行动
- **内容要点**：一句强化承诺 + 联系方式占位
- **CTA**：开始使用 / 预约演示`;

const SYSTEM_PROMPT = `你是落地页策划/产品架构师。将用户一句话需求转化为「静态单页落地页」的页面架构大纲（不要求严格 JSON）。

## 最高优先级：结构清晰、可直接落地

- 输出必须能让下游直接生成页面：section 顺序明确、每段目标明确、内容要点精炼。
- sections 控制在 **5～8 段**；每段要点 **最多 3 条**，避免超长。
- 若需求复杂：只保留转化主路径（Hero→卖点/场景→信任→FAQ/价格择一→Footer CTA），其余省略。

## 🚨只输出 Markdown 大纲（禁止寒暄/总结）

- 直接从标题开始（例如：\`## 落地页架构\`）
- 禁止在正文前后输出任何客套话
- 禁止输出代码块包裹整段内容

## 输出格式（必须遵守）

## 落地页架构

### 1) <SectionName>
- **目的**：一句话
- **内容要点**：要点1；要点2；要点3（最多3条）
- **CTA**：主CTA（可选）｜次CTA（可选）

（重复到 5~8 段）

## 通用规则
- 必须是单页：**禁止** Tab、多页面、路由、后台管理、列表管理
- 文案中文、短句优先；避免术语堆砌`;

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

  // 兼容：若模型仍然输出了 JSON（对象/数组），尽量提取出来；否则直接按 Markdown 大纲原样返回
  const braceStart0 = text.indexOf('{');
  const bracketStart0 = text.indexOf('[');
  const firstNonSpace = text.match(/\S/)?.[0] || '';
  const looksLikeJson =
    firstNonSpace === '{' ||
    firstNonSpace === '[' ||
    (braceStart0 >= 0 && braceStart0 < 10) ||
    (bracketStart0 >= 0 && bracketStart0 < 10);

  if (looksLikeJson) {
    // 尝试对象
    if (braceStart0 >= 0) {
      const t = braceStart0 > 0 ? text.substring(braceStart0) : text;
      const braceEnd = t.lastIndexOf('}');
      if (braceEnd >= 0) {
        const slice = t.substring(0, braceEnd + 1);
        const objOk = tryParseJsonObject(slice.replace(/,\s*([\]}])/g, '$1'));
        if (objOk) return { text: objOk, usedFallback: false, repairedBrackets: false };
      }
    }
    // 尝试数组（含轻修补）
    if (bracketStart0 >= 0) {
      const t = bracketStart0 > 0 ? text.substring(bracketStart0) : text;
      const bracketEnd = t.lastIndexOf(']');
      if (bracketEnd >= 0) {
        const slice = t.substring(0, bracketEnd + 1);
        const commaFixed = slice.replace(/,\s*([\]}])/g, '$1');
        const ok = tryParseJsonArray(commaFixed);
        if (ok) return { text: ok, usedFallback: false, repairedBrackets: false };
        const repaired = repairUnclosedJsonContainers(slice);
        const ok2 = tryParseJsonArray(repaired.replace(/,\s*([\]}])/g, '$1'));
        if (ok2) return { text: ok2, usedFallback: false, repairedBrackets: true };
      }
    }
  }

  // Markdown / 自由文本：不做 parse，只要结构清晰即可
  return { text: text.trim(), usedFallback: false, repairedBrackets: false };
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
      result.summary = '已使用兜底落地页架构（仍可继续生成网页）';
    } else if (repairedBrackets) {
      result.status = result.status === 'warning' ? 'warning' : 'success';
      result.summary = `落地页架构已生成（${text.length} 字符，已自动补全未闭合括号）`;
    } else {
      result.summary = `落地页架构已生成（${text.length} 字符）`;
    }
  }

  return result;
};

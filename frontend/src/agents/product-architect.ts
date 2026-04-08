import type { AgentContext, AgentResult } from './types';
import { runWithAI } from './_framework';

/** 模型完全不可解析时使用，保证下游始终拿到合法 JSON 数组 */
const FALLBACK_LANDING_MODULES =
  '[{"id":"1","title":"首屏"},{"id":"2","title":"核心卖点"},{"id":"3","title":"案例与口碑"},{"id":"4","title":"FAQ"},{"id":"5","title":"页脚CTA"}]';

const SYSTEM_PROMPT = `你是落地页策划/产品架构师，将用户一句话需求转化为「静态单页落地页」的模块大纲 JSON 树。

## 🚨🚨🚨 最高优先级：短而完整、必须可解析 🚨🚨🚨

- **宁可模块少一点、子节点少一点，也必须在一次回复内输出完整、可解析的 JSON**，禁止写到一半截断。
- **绝对禁止**超长罗列：一级模块 **4～6 个**（**不要超过 7 个**）；需要 children 时，每个模块下 **0～2 条**子节点即可，不要展开长列表。
- 若需求复杂：只保留转化主路径（首屏→卖点/价值→信任→FAQ/价格择一→CTA→页脚），其余省略。

## 🚨🚨🚨 只输出 JSON 🚨🚨🚨

你的回复必须**只包含 JSON 数组本身**，不允许包含任何其他内容：
- 回复的第一个字符必须是 \`[\`
- 回复的最后一个字符必须是 \`]\`
- **绝对禁止**在 JSON 前面或后面写任何文字
- **绝对禁止**使用 markdown 代码块 \`\`\`json ... \`\`\` 包裹
- **绝对禁止**输出任何非 JSON 的解释、说明、总结、注释

## 🚨 禁止追问与澄清（与「只输出 JSON」同等重要）

- **绝对禁止**向用户提问、索要补充信息、列举「您可能指的是 A/B/C」、或输出任何对话式引导。
- 即使用户只给了一个词、短语或行业名，也**必须**立刻推断并输出完整 JSON 树。
- 信息不足时：用**精简**通用落地页结构（首屏→卖点→信任→CTA→页脚），**不要**用文字说明「假设」或「待确认」。

正确示例（精简、可解析；你应控制在与示例相近的长度量级）：
[{"id":"1","title":"首屏","children":[{"id":"1-1","title":"主标题"},{"id":"1-2","title":"主CTA"}]},{"id":"2","title":"核心卖点"},{"id":"3","title":"案例"},{"id":"4","title":"FAQ"},{"id":"5","title":"页脚CTA"}]

## 通用规则

- 一级节点：单页上的独立模块（section），从上到下阅读顺序
- 最多 2 层（一级模块 → 子条目）；子条目能省则省
- 用户视角命名，禁用技术词汇，节点标题 ≤ 8 字
- 必须是「静态单页落地页」：**绝对禁止** Tab、多页面、路由、后台管理台、数据看板、列表管理等 IA

## 输出格式

- 仅返回纯 JSON 数组，以 [ 开头 ] 结尾
- 禁止 markdown、代码块、注释、说明文字
- 节点字段：id（如"1","1-1"）、title、children（可选）`;

/** 跳过字符串内容，统计未闭合的 { [，用于截断输出时补全括号 */
function repairUnclosedJsonContainers(s: string): string {
  let t = s.trim();
  const start = t.indexOf('[');
  if (start < 0) return t;
  t = t.slice(start);
  let inString = false;
  let escape = false;
  const stack: ('{' | '[')[] = [];
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
    const top = stack.pop()!;
    out += top === '{' ? '}' : ']';
  }
  return out.replace(/,\s*([\]}])/g, '$1');
}

function tryParseJsonArray(text: string): string | null {
  try {
    const v = JSON.parse(text);
    return Array.isArray(v) ? text : null;
  } catch {
    return null;
  }
}

/**
 * 清洗并尽量修复模型输出的 JSON 数组；失败则返回兜底，保证始终可 parse。
 */
export function normalizeProductArchitectJson(raw: string): {
  text: string;
  usedFallback: boolean;
  repairedBrackets: boolean;
} {
  let text = raw.trim();
  const codeMatch = text.match(/```(?:json|JSON)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeMatch) text = codeMatch[1].trim();

  const bracketStart = text.indexOf('[');
  if (bracketStart > 0) text = text.substring(bracketStart);
  const bracketEnd = text.lastIndexOf(']');
  if (bracketEnd >= 0) text = text.substring(0, bracketEnd + 1);

  let repairedBrackets = false;
  const commaFixed = text.replace(/,\s*([\]}])/g, '$1');
  let ok = tryParseJsonArray(commaFixed);
  if (ok) {
    text = ok;
    return { text: text.trim(), usedFallback: false, repairedBrackets };
  }

  const repaired = repairUnclosedJsonContainers(text);
  if (repaired !== text) repairedBrackets = true;
  const repairedComma = repaired.replace(/,\s*([\]}])/g, '$1');
  ok = tryParseJsonArray(repairedComma);
  if (ok) {
    return { text: ok.trim(), usedFallback: false, repairedBrackets };
  }

  return {
    text: FALLBACK_LANDING_MODULES,
    usedFallback: true,
    repairedBrackets,
  };
}

export default async function runProductArchitect(ctx: AgentContext): Promise<AgentResult> {
  const result = await runWithAI('product-architect', ctx, SYSTEM_PROMPT, {
    maxTokens: 8192,
    onChunk: ctx.onChunk,
    maxExtraRetries: 2,
    timeoutMs: 120_000,
  });

  if (result.success && result.data) {
    const { text, usedFallback, repairedBrackets } = normalizeProductArchitectJson(
      result.data.text,
    );
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
}

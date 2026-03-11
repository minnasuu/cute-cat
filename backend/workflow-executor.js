/**
 * 后端工作流执行引擎
 *
 * 在服务器端执行工作流步骤，替代前端浏览器中的执行逻辑。
 * 每个 skill 最终映射到后端已有的能力（AI 调用、RSS 爬取、邮件发送等）。
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// 延迟加载 Google GenAI
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

// ─── Qwen 调用 ───
async function callQwen(systemPrompt, userText, maxTokens = 4096) {
  const apiKey = process.env.QWEN_API_KEY;
  if (!apiKey) throw new Error('QWEN_API_KEY not set');
  const baseUrl = process.env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
  const model = process.env.QWEN_MODEL || 'qwen-plus';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userText }],
        max_tokens: maxTokens,
        temperature: 0.7,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Qwen API ${response.status}: ${errText}`);
    }
    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Gemini 调用 ───
async function callGemini(systemPrompt, userText, maxTokens = 4096) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');
  const ai = await createGeminiClient(apiKey);
  const response = await ai.models.generateContent({
    model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
    contents: userText,
    config: { systemInstruction: systemPrompt, maxOutputTokens: maxTokens, temperature: 0.7 },
  });
  return response.text || '';
}

// ─── 通用 AI 调用 ───
async function callAI(systemPrompt, userText, model, maxTokens = 4096) {
  const selectedModel = model || process.env.DEFAULT_AI_MODEL || 'qwen';
  if (selectedModel === 'qwen') return callQwen(systemPrompt, userText, maxTokens);
  return callGemini(systemPrompt, userText, maxTokens);
}

// ─── RSS/URL 爬取 ───
async function crawlSources(sources, keyword, maxItems) {
  const limit = Math.min(Number(maxItems) || 20, 100);
  const keywords = keyword ? keyword.split(/[,，、\s]+/).filter(Boolean).map(k => k.toLowerCase()) : [];
  const allItems = [];

  for (const src of sources.slice(0, 10)) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      const resp = await fetch(src, {
        signal: controller.signal,
        headers: { 'User-Agent': 'CuteCat-Crawler/1.0', 'Accept': 'application/rss+xml, application/xml, application/atom+xml, text/xml, text/html, */*' },
      });
      clearTimeout(timer);
      if (!resp.ok) { allItems.push({ source: src, error: `HTTP ${resp.status}` }); continue; }
      const contentType = resp.headers.get('content-type') || '';
      const body = await resp.text();

      if (contentType.includes('xml') || contentType.includes('rss') || body.trimStart().startsWith('<?xml') || body.trimStart().startsWith('<rss') || body.trimStart().startsWith('<feed')) {
        allItems.push(...parseRSSItems(body, src, limit));
      } else if (contentType.includes('json')) {
        try {
          const json = JSON.parse(body);
          const arr = Array.isArray(json) ? json : (json.items || json.data || json.results || json.articles || [json]);
          for (const item of arr.slice(0, limit)) {
            allItems.push({ title: item.title || '(无标题)', summary: item.summary || item.description || item.content || '', link: item.link || item.url || src, pubDate: item.pubDate || item.published || item.date || '', source: src });
          }
        } catch { allItems.push({ source: src, error: 'JSON 解析失败' }); }
      } else {
        const titleMatch = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        const descMatch = body.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) || body.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
        allItems.push({ title: titleMatch ? titleMatch[1].trim() : '(无标题)', summary: descMatch ? descMatch[1].trim() : body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500), link: src, pubDate: '', source: src });
      }
    } catch (err) {
      allItems.push({ source: src, error: err.name === 'AbortError' ? '请求超时 (15s)' : (err.message || String(err)) });
    }
  }

  let filtered = allItems;
  if (keywords.length > 0) {
    filtered = allItems.filter(item => { if (item.error) return true; const text = `${item.title || ''} ${item.summary || ''}`.toLowerCase(); return keywords.some(k => text.includes(k)); });
  }
  return { items: filtered.slice(0, limit), total: filtered.length, sourcesCount: sources.length, keyword: keyword || null };
}

function parseRSSItems(xml, source, limit) {
  const items = [];
  const rssItems = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
  const atomEntries = xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  const entries = rssItems.length > 0 ? rssItems : atomEntries;
  for (const entry of entries.slice(0, limit)) {
    const getTag = (tag) => { const m = entry.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i')); return m ? m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim() : ''; };
    const getLinkHref = () => { const m = entry.match(/<link[^>]+href=["']([^"']*)["']/i); return m ? m[1] : getTag('link'); };
    items.push({ title: getTag('title') || '(无标题)', summary: getTag('description') || getTag('summary') || getTag('content') || '', link: getLinkHref() || getTag('link') || '', pubDate: getTag('pubDate') || getTag('published') || getTag('updated') || '', source });
  }
  return items;
}

// ─── 邮件发送 ───
let _transporter = null;
function getTransporter() {
  if (!_transporter) {
    const nodemailer = require('nodemailer');
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT) || 465;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (!host || !user || !pass) throw new Error('SMTP 环境变量未配置');
    _transporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
  }
  return _transporter;
}

async function sendEmailDirect({ to, subject, html, text }) {
  const transport = getTransporter();
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const info = await transport.sendMail({ from: `"猫猫团队 🐱" <${from}>`, to, subject, text: text || '', html: html || '' });
  return { success: true, messageId: info.messageId, to, subject };
}

// ─── Markdown → HTML 轻量转换（后端邮件用，不依赖外部库） ───
function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function simpleMarkdownToHtml(md) {
  if (!md) return '';

  // ── 0. 预处理：统一换行符，确保正则能正确匹配行首/行尾 ──
  let text = md
    .replace(/\r\n/g, '\n')   // Windows → Unix
    .replace(/\r/g, '\n')     // old Mac → Unix
    .replace(/\\n/g, '\n');   // JSON 转义的 \n 也还原

  // ── 1. 代码块 ```...``` ──
  text = text.replace(/```[\w]*\n?([\s\S]*?)```/g, (_m, code) => {
    return `\n<pre style="background:#3E2723;color:#FFCCBC;padding:16px;border-radius:8px;overflow-x:auto;font-size:13px;line-height:1.5;margin:10px 0"><code>${escapeHtml(code.trim())}</code></pre>\n`;
  });

  // ── 2. 行内代码 `...` ──
  text = text.replace(/`([^`]+)`/g, '<code style="background:#F5F0EB;padding:2px 6px;border-radius:4px;font-size:13px;color:#D84315;font-family:Menlo,Consolas,monospace">$1</code>');

  // ── 3. 逐行处理（标题、列表、分隔线） ──
  const lines = text.split('\n');
  const outputLines = [];
  let inUl = false;
  let inOl = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // 已经是 HTML 标签的行直接输出
    if (trimmed.startsWith('<pre') || trimmed.startsWith('<code') || trimmed.startsWith('</')) {
      if (inUl) { outputLines.push('</ul>'); inUl = false; }
      if (inOl) { outputLines.push('</ol>'); inOl = false; }
      outputLines.push(trimmed);
      continue;
    }

    // 分隔线 --- 或 ___
    if (/^[-_]{3,}\s*$/.test(trimmed)) {
      if (inUl) { outputLines.push('</ul>'); inUl = false; }
      if (inOl) { outputLines.push('</ol>'); inOl = false; }
      outputLines.push('<hr style="border:none;border-top:1px dashed #E0D6CC;margin:16px 0">');
      continue;
    }

    // 标题 ### / ## / #
    const h3 = trimmed.match(/^###\s+(.+)/);
    if (h3) {
      if (inUl) { outputLines.push('</ul>'); inUl = false; }
      if (inOl) { outputLines.push('</ol>'); inOl = false; }
      outputLines.push(`<h3 style="font-size:15px;font-weight:600;color:#6D4C41;margin:16px 0 6px;line-height:1.4">${applyInlineStyles(h3[1])}</h3>`);
      continue;
    }
    const h2 = trimmed.match(/^##\s+(.+)/);
    if (h2) {
      if (inUl) { outputLines.push('</ul>'); inUl = false; }
      if (inOl) { outputLines.push('</ol>'); inOl = false; }
      outputLines.push(`<h2 style="font-size:17px;font-weight:700;color:#5D4037;margin:18px 0 8px;line-height:1.4">${applyInlineStyles(h2[1])}</h2>`);
      continue;
    }
    const h1 = trimmed.match(/^#\s+(.+)/);
    if (h1) {
      if (inUl) { outputLines.push('</ul>'); inUl = false; }
      if (inOl) { outputLines.push('</ol>'); inOl = false; }
      outputLines.push(`<h1 style="font-size:20px;font-weight:700;color:#4E342E;margin:20px 0 10px;line-height:1.4">${applyInlineStyles(h1[1])}</h1>`);
      continue;
    }

    // 无序列表 - item  或  * item
    const ulMatch = trimmed.match(/^[-*]\s+(.+)/);
    if (ulMatch) {
      if (inOl) { outputLines.push('</ol>'); inOl = false; }
      if (!inUl) { outputLines.push('<ul style="margin:8px 0;padding-left:20px">'); inUl = true; }
      outputLines.push(`<li style="margin:4px 0;line-height:1.7">${applyInlineStyles(ulMatch[1])}</li>`);
      continue;
    }

    // 有序列表 1. item
    const olMatch = trimmed.match(/^\d+[.)]\s+(.+)/);
    if (olMatch) {
      if (inUl) { outputLines.push('</ul>'); inUl = false; }
      if (!inOl) { outputLines.push('<ol style="margin:8px 0;padding-left:20px">'); inOl = true; }
      outputLines.push(`<li style="margin:4px 0;line-height:1.7">${applyInlineStyles(olMatch[1])}</li>`);
      continue;
    }

    // 空行
    if (!trimmed) {
      if (inUl) { outputLines.push('</ul>'); inUl = false; }
      if (inOl) { outputLines.push('</ol>'); inOl = false; }
      continue;
    }

    // 普通段落
    if (inUl) { outputLines.push('</ul>'); inUl = false; }
    if (inOl) { outputLines.push('</ol>'); inOl = false; }
    outputLines.push(`<p style="margin:8px 0;line-height:1.8">${applyInlineStyles(trimmed)}</p>`);
  }

  // 闭合未关闭的列表
  if (inUl) outputLines.push('</ul>');
  if (inOl) outputLines.push('</ol>');

  return outputLines.join('\n');
}

/** 处理行内 Markdown 样式：粗体、斜体、链接 */
function applyInlineStyles(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a style="color:#E65100;text-decoration:underline" href="$2">$1</a>');
}

function buildCatEmailHtml(subject, bodyHtml) {
  const now = new Date().toLocaleString('zh-CN');
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0 auto; padding: 24px; background: #FFF9F0;">
      <div style="background: linear-gradient(135deg, #FFE0B2, #FFCCBC); border-radius: 16px; padding: 24px 28px; margin-bottom: 20px;">
        <h2 style="margin: 0 0 6px; color: #4E342E; font-size: 20px;">${subject}</h2>
        <p style="margin: 0; color: #8D6E63; font-size: 13px;">${now}</p>
      </div>
      <div style="padding: 0 4px; margin-bottom: 4px;">
        <p style="color: #5D4037; font-size: 15px; margin: 0;">老大！</p>
      </div>
      <div style="background: #fff; border: 1px solid #E0D6CC; border-radius: 12px; padding: 24px; line-height: 1.9; color: #333; font-size: 14px;">
        ${bodyHtml}
      </div>
      <div style="text-align: right; padding: 16px 8px 0; color: #8D6E63; font-size: 13px; line-height: 1.6;">
        <p style="margin: 0;">🐾 喵~</p>
        <p style="margin: 4px 0 0;">你的猫咪军团 发出</p>
      </div>
      <div style="text-align: center; margin-top: 20px; padding-top: 12px; border-top: 1px dashed #E0D6CC;">
        <p style="color: #BCAAA4; font-size: 11px; margin: 0;">🏠 来自 CuCaTopia.com ✨</p>
      </div>
    </div>
  `;
}

// ─── Skill → 系统提示词 映射 ───
const SKILL_PROMPTS = {
  'ai-chat': '你是一只友善的猫猫助手 CAT，团队的万能基础成员。请根据用户输入完成对应的文本任务。用简洁清晰的中文回答。',
  'generate-article': '你是一位专业的内容创作者。请根据提供的素材和要求，撰写一篇高质量的文章。用中文回复，内容详实、逻辑清晰。',
  'generate-outline': '你是一位大纲规划专家。请根据主题生成详细的文章大纲，包含标题、各段要点。用中文回复。',
  'assign-task': '你是一位项目任务拆解助手。从前序输出中提取最重要、最可执行的任务。返回 JSON 数组。',
  'meeting-notes': '你是一位会议纪要撰写助手。根据提供的内容生成结构化的会议纪要。用中文回复。',
  'task-log': '你是一位工作日志助手。根据提供的任务信息，生成结构化的工作日志。用中文回复。',
  'content-review': '你是一位内容审核专家。请审核内容的准确性和合规性。用中文回复。',
  'team-review': '你是一位团队绩效分析师。请根据提供的数据给出团队评估报告。用中文回复。',
};

// ─── 系统注入 key 白名单 ───
const SYSTEM_KEYS = {
  'user.email': true,
  'user.name': true,
  'workflow.name': true,
  'timestamp': true,
};

// ─── 单步执行：根据 skillId 分发到对应的后端能力 ───
async function executeStep(step, prevResults, userEmail, catSystemPrompt, context = {}) {
  const { skillId, action, params } = step;

  // 合并上游结果 + 当前步骤参数
  const merged = { ...prevResults };
  if (action) merged._action = action;
  if (params && params.length > 0) {
    const pv = {};
    for (const p of params) {
      const source = p.valueSource || 'static';

      if (source === 'upstream') {
        // 从上游步骤输出中自动提取主体内容（无需指定字段名）
        let found = undefined;
        if (prevResults != null) {
          if (typeof prevResults === 'string') {
            found = prevResults;
          } else if (typeof prevResults === 'object') {
            found = prevResults.text ?? prevResults.summary ?? prevResults.notes ?? prevResults.content ?? prevResults.result ?? prevResults.html ?? prevResults.body ?? prevResults.data;
            // 如果没有匹配到已知字段，将整个对象 JSON 序列化
            if (found === undefined) found = JSON.stringify(prevResults);
          }
        }
        // 回退到 static value 或 defaultValue
        pv[p.key] = found !== undefined ? found : (p.value ?? p.defaultValue);
        if (found === undefined) {
          console.warn(`[executor] param "${p.key}" upstream: no content found in prevResults, falling back to static value`);
        }
      } else if (source === 'system') {
        // 从系统上下文注入
        const sysKey = p.systemKey || '';
        if (!SYSTEM_KEYS[sysKey]) {
          console.warn(`[executor] param "${p.key}" unknown systemKey "${sysKey}", falling back to static value`);
          pv[p.key] = p.value ?? p.defaultValue;
        } else if (sysKey === 'user.email') {
          pv[p.key] = userEmail || p.value || p.defaultValue || '';
        } else if (sysKey === 'user.name') {
          pv[p.key] = context.userName || p.value || p.defaultValue || '';
        } else if (sysKey === 'workflow.name') {
          pv[p.key] = context.workflowName || p.value || p.defaultValue || '';
        } else if (sysKey === 'timestamp') {
          pv[p.key] = new Date().toISOString();
        } else {
          pv[p.key] = p.value ?? p.defaultValue;
        }
      } else {
        // static：取用户填写的值或默认值
        if (p.value !== undefined) pv[p.key] = p.value;
        else if (p.defaultValue !== undefined) pv[p.key] = p.defaultValue;
      }
    }
    if (Object.keys(pv).length > 0) {
      merged._params = pv;
      // 同时将 _params 中的值平铺到 merged 顶层（用于邮件等技能的兼容读取）
      Object.assign(merged, pv);
    }
  }

  try {
    // ─── 爬取类技能 ───
    if (skillId === 'crawl-news') {
      const p = merged._params || merged;
      let sources = [];
      if (Array.isArray(p.sources)) sources = p.sources.map(String).filter(Boolean);
      else if (typeof p.sources === 'string' && p.sources.trim()) sources = p.sources.split(/[,，\s]+/).filter(Boolean);
      if (sources.length === 0) return { success: false, data: null, summary: '未提供 RSS / URL 源', status: 'error' };
      const data = await crawlSources(sources, String(p.keyword || ''), Number(p.maxItems) || 20);
      const errorItems = (data.items || []).filter(i => i.error);
      const successCount = (data.total || 0) - errorItems.length;
      return { success: true, data, summary: `成功爬取 ${successCount} 条资讯`, status: 'success' };
    }

    // ─── Craft 类技能（直接传递数据，不走 AI 通道） ───
    if (skillId === 'create-craft' || skillId === 'view-crafts') {
      // create-craft / view-crafts 是前端技能，后端无 /api/crafts 路由
      // 在工作流中作为数据传递节点：直接将上游 craft 数据原样输出
      // 这样下游步骤可以获取到完整的 craft 对象
      const p = merged._params || {};

      // 尝试从上游结果中提取 craft 数据
      let craftData = null;
      if (merged.name && merged.htmlCode) {
        // 上游直接传递了 craft 对象字段
        const { _action, _params, ...rest } = merged;
        craftData = rest;
      } else if (typeof p.jsonData === 'string' || typeof p.content === 'string' || typeof p.text === 'string' || typeof merged.text === 'string') {
        // 上游传递了 JSON 字符串
        const raw = String(p.jsonData || p.content || p.text || merged.text || '');
        try {
          // 尝试从文本中提取 JSON
          let jsonStr = raw.trim();
          // 去掉 markdown 代码块包裹
          const codeMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
          if (codeMatch) jsonStr = codeMatch[1].trim();
          // 尝试找到 JSON 对象/数组
          const start = Math.min(
            jsonStr.indexOf('{') >= 0 ? jsonStr.indexOf('{') : Infinity,
            jsonStr.indexOf('[') >= 0 ? jsonStr.indexOf('[') : Infinity
          );
          if (start < Infinity) {
            const openChar = jsonStr[start];
            const closeChar = openChar === '{' ? '}' : ']';
            const end = jsonStr.lastIndexOf(closeChar);
            if (end > start) jsonStr = jsonStr.substring(start, end + 1);
          }
          craftData = JSON.parse(jsonStr);
        } catch {
          // JSON 解析失败，将原始文本作为 summary 传递
          return { success: true, data: { text: raw }, summary: `Craft 数据（待解析）: ${raw.substring(0, 200)}...`, status: 'success' };
        }
      }

      if (craftData) {
        const items = Array.isArray(craftData) ? craftData : [craftData];
        const names = items.map(i => i.name || '未命名').join(', ');
        return { success: true, data: craftData, summary: `Craft 数据已准备: ${names}`, status: 'success' };
      }

      return { success: true, data: merged, summary: 'Craft 数据传递完成', status: 'success' };
    }

    // ─── 邮件类技能 ───
    if (skillId === 'send-email') {
      const p = merged._params || {};
      // 收件人：_params.to > merged.to > userEmail
      const to = p.to || merged.to || userEmail || '';
      // 主题（初始值）
      let subject = p.subject || merged.subject || '【猫猫邮件】';
      // 正文（原始 Markdown）
      let text = p.body || merged.notes || merged.text || merged.summary || '这是一封来自猫猫团队的邮件 🐱';

      // ── 预处理：统一换行符 ──
      text = text.replace(/\\n/g, '\n').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

      // ── 从正文中提取并移除 Subject 行（AI 可能把 Subject 混在正文里） ──
      const subjectLineMatch = text.match(/^Subject\s*[:：]\s*(.+)/im);
      if (subjectLineMatch) {
        // 如果 subject 还是默认值，则用提取的 Subject
        if (subject === '【猫猫邮件】') {
          subject = subjectLineMatch[1].trim();
        }
        // 从正文中移除 Subject 行
        text = text.replace(/^Subject\s*[:：]\s*.+\n?/im, '').trim();
      }

      // ── 移除称呼开头语（如「你好~嗯~」等寒暄，已在模板中有「老大！」） ──
      text = text.replace(/^(你好[~～！!]*|嗨[~～！!]*|Hi[~～！!]*)\s*\n*/i, '').trim();

      if (!to) return { success: false, data: null, summary: '未配置收件人邮箱', status: 'error' };
      try {
        // 将 Markdown 正文转为带内联样式的 HTML 邮件
        const bodyHtml = simpleMarkdownToHtml(text);
        const html = buildCatEmailHtml(subject, bodyHtml);
        const result = await sendEmailDirect({ to, subject, html, text });
        return { success: true, data: { messageId: result.messageId, to, subject }, summary: `邮件已发送至 ${to}`, status: 'success' };
      } catch (err) {
        return { success: false, data: null, summary: `邮件发送失败: ${err.message}`, status: 'error' };
      }
    }

    // ─── AI 类技能（大部分技能走这里）───
    // 优先注入猫猫的性格 prompt，再叠加技能专用 prompt
    const skillPrompt = SKILL_PROMPTS[skillId] || '你是一位专业的 AI 助手，请用中文回复。';
    const systemPrompt = catSystemPrompt
      ? `${catSystemPrompt}\n\n${skillPrompt}`
      : skillPrompt;
    let taskPrompt = action ? `当前任务：${action}\n请围绕以上任务要求完成工作。` : '';
    let inputText = '';

    // 收集上游文本数据
    const parts = [];
    if (merged.text) parts.push(String(merged.text));
    if (merged.summary) parts.push(String(merged.summary));
    if (merged.analysis) parts.push(String(merged.analysis));
    if (merged.notes) parts.push(String(merged.notes));
    // 爬取结果特殊处理
    if (merged.items && Array.isArray(merged.items)) {
      parts.push(merged.items.filter(it => !it.error).map((it, i) => `[${i + 1}] ${it.title}\n${it.summary || ''}\n${it.link || ''}`).join('\n\n'));
    }
    if (parts.length === 0) {
      const rest = Object.entries(merged).filter(([k]) => !['_action', '_params', 'text', 'summary', 'analysis', 'notes', 'items', 'to', 'subject'].includes(k));
      if (rest.length > 0) parts.push(JSON.stringify(Object.fromEntries(rest), null, 2));
    }
    inputText = parts.join('\n\n');

    const fullPrompt = `${systemPrompt}\n${taskPrompt}`;
    const userText = inputText || action || '请执行任务';

    const answer = await callAI(fullPrompt, userText, 'qwen');
    return {
      success: true,
      data: { text: answer },
      summary: answer,
      status: 'success',
    };
  } catch (err) {
    return { success: false, data: null, summary: `步骤执行异常: ${err.message}`, status: 'error' };
  }
}

// ─── 执行整个工作流（DAG 分层并行执行） ───
async function executeWorkflow(workflow, triggeredBy) {
  const startTime = Date.now();
  const stepsData = [];

  // 检查日志上限并创建 run 记录
  const runCount = await prisma.workflowRun.count({ where: { teamId: workflow.teamId } });
  if (runCount >= 30) {
    await prisma.workflowRun.deleteMany({ where: { teamId: workflow.teamId } });
  }

  const run = await prisma.workflowRun.create({
    data: {
      workflowId: workflow.id,
      teamId: workflow.teamId,
      triggeredBy: triggeredBy || 'scheduler',
      workflowName: workflow.name,
      status: 'running',
    },
  });

  // 获取触发用户的邮箱和名称（用于 system key 注入）
  let userEmail = '';
  let userName = '';
  if (triggeredBy) {
    const user = await prisma.user.findUnique({ where: { id: triggeredBy }, select: { email: true, nickname: true } }).catch(() => null);
    if (user) {
      userEmail = user.email;
      userName = user.nickname || '';
    }
  }
  // 如果没有 triggeredBy，用团队 owner 的信息
  if (!userEmail) {
    const team = await prisma.team.findUnique({ where: { id: workflow.teamId }, include: { owner: { select: { email: true, nickname: true } } } }).catch(() => null);
    if (team?.owner) {
      userEmail = team.owner.email;
      userName = team.owner.nickname || '';
    }
  }

  // 构建系统上下文（传给 executeStep 供 system key 解析使用）
  const executionContext = {
    userName,
    workflowName: workflow.name,
  };

  const steps = Array.isArray(workflow.steps) ? workflow.steps : (typeof workflow.steps === 'string' ? JSON.parse(workflow.steps) : []);

  // ── 构建 DAG：解析每个步骤的上游依赖索引 ──
  const parentIndex = [];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (!step.inputFrom) {
      parentIndex.push(i === 0 ? -1 : i - 1);
    } else {
      // 优先按 stepId 匹配
      let found = steps.findIndex((s, si) => si < i && s.stepId === step.inputFrom);
      if (found < 0) {
        // fallback: 按 agentId 匹配
        found = steps.findIndex((s, si) => si < i && s.agentId === step.inputFrom);
      }
      parentIndex.push(found >= 0 ? found : (i === 0 ? -1 : i - 1));
    }
  }

  // ── 计算拓扑层级（depth） ──
  const depth = new Array(steps.length).fill(0);
  for (let i = 0; i < steps.length; i++) {
    const pi = parentIndex[i];
    depth[i] = pi >= 0 ? depth[pi] + 1 : 1;
  }

  // ── 按层级分组 ──
  const maxDepth = Math.max(...depth, 0);
  const layers = [];
  for (let d = 0; d <= maxDepth; d++) {
    layers.push([]);
  }
  for (let i = 0; i < steps.length; i++) {
    layers[depth[i]].push(i);
  }

  // ── 按层级顺序执行，同层并行 ──
  const stepResults = new Array(steps.length).fill(null);  // 每个步骤的执行结果
  let hasFailed = false;

  for (let d = 1; d <= maxDepth && !hasFailed; d++) {
    const layer = layers[d];
    if (layer.length === 0) continue;

    // 同层的步骤可以并行执行
    const layerPromises = layer.map(async (i) => {
      const step = steps[i];
      const pi = parentIndex[i];

      // 获取上游结果
      const prevResults = pi >= 0 && stepResults[pi]?.data
        ? { ...stepResults[pi].data }
        : {};

      // 查询猫猫的性格 systemPrompt
      let catSystemPrompt = '';
      if (step.agentId) {
        const cat = await prisma.teamCat.findUnique({ where: { id: step.agentId }, select: { systemPrompt: true } }).catch(() => null);
        if (cat?.systemPrompt) catSystemPrompt = cat.systemPrompt;
      }

      // 带超时保护（60 秒）
      let result;
      try {
        const executePromise = executeStep(step, prevResults, userEmail, catSystemPrompt, executionContext);
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('执行超时 (60s)')), 60000));
        result = await Promise.race([executePromise, timeoutPromise]);
      } catch (err) {
        result = { success: false, data: null, summary: err.message || '步骤执行异常', status: 'error' };
      }

      stepResults[i] = result;
      return { index: i, result };
    });

    const layerResults = await Promise.all(layerPromises);

    for (const { index: i, result } of layerResults) {
      stepsData.push({
        index: i, skillId: steps[i].skillId, action: steps[i].action,
        success: result.success, status: result.status, summary: result.summary,
      });

      if (!result.success) {
        hasFailed = true;
        console.warn(`[executor] ${workflow.name} 步骤 ${i + 1} 失败: ${result.summary}`);
      }
    }
  }

  // 按步骤索引排序 stepsData
  stepsData.sort((a, b) => a.index - b.index);

  // 更新 run 记录
  await prisma.workflowRun.update({
    where: { id: run.id },
    data: {
      status: hasFailed ? 'failed' : 'success',
      steps: stepsData,
      completedAt: new Date(),
      totalDuration: Math.round((Date.now() - startTime) / 1000),
    },
  }).catch(err => console.error('[executor] update run error:', err.message));

  console.log(`[executor] 工作流 "${workflow.name}" 执行完成 → ${hasFailed ? 'failed' : 'success'} (${Math.round((Date.now() - startTime) / 1000)}s)`);
  return { runId: run.id, status: hasFailed ? 'failed' : 'success', steps: stepsData };
}

module.exports = { executeWorkflow, executeStep };

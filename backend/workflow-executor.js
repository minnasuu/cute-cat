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
  const baseUrl = process.env.QWEN_BASE_URL || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
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

// ─── 单步执行：根据 agentId 分发到对应的猫脚本 ───
async function executeStep(step, prevResults, userEmail, catSystemPrompt, context = {}) {
  const { agentId } = step;

  // 合并上游结果
  const merged = { ...prevResults };

  // 注入用户输入（如果是第一步）
  if (context.userInput && !merged.text) {
    merged.text = context.userInput;
  }

  try {
    // 所有步骤统一通过 agentId 分发到 cat-step-scripts
    const { runAgentStep } = require('./lib/cat-step-scripts');
    return runAgentStep({ step, merged, userEmail, catSystemPrompt, context });
  } catch (err) {
    return { success: false, data: null, summary: `步骤执行异常: ${err.message}`, status: 'error' };
  }
}

// ─── 执行整个工作流（DAG 分层并行执行） ───
async function executeWorkflow(workflow, triggeredBy, options = {}) {
  const startTime = Date.now();
  const stepsData = [];
  const userInput = typeof options.userInput === 'string' ? options.userInput.trim() : '';

  // 检查日志上限并创建 run 记录
  const runCount = await prisma.workflowRun.count({ where: { teamId: workflow.teamId } });
  if (runCount >= 100) {
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
    userInput,
  };

  let steps = Array.isArray(workflow.steps) ? workflow.steps : (typeof workflow.steps === 'string' ? JSON.parse(workflow.steps) : []);
  steps = JSON.parse(JSON.stringify(steps));

  if (userInput && steps.length > 0) {
    const first = steps[0];
    if (!Array.isArray(first.params)) first.params = [];
    const topicParam = first.params.find((p) => p.key === 'topic');
    if (topicParam) topicParam.value = userInput;
    else {
      const kw = first.params.find((p) => p.key === 'keyword');
      if (kw) kw.value = userInput;
      else first.params.push({ key: 'topic', label: '用户输入', type: 'text', value: userInput });
    }
  }

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

      // 查询猫猫的性格 systemPrompt / 官方 templateId（供 AIGC 按猫分发脚本）
      let catSystemPrompt = '';
      let catRole = '';
      let cat = null;
      if (step.agentId) {
        cat = await prisma.teamCat.findUnique({
          where: { id: step.agentId },
          select: { systemPrompt: true, role: true, templateId: true, name: true },
        }).catch(() => null);
        if (cat?.systemPrompt) catSystemPrompt = cat.systemPrompt;
        if (cat?.role) catRole = cat.role;
      }

      // 带超时保护（60 秒）
      let result;
      try {
        const executePromise = executeStep(step, prevResults, userEmail, catSystemPrompt, {
          ...executionContext,
          catRole,
          catTemplateId: cat?.templateId || '',
          catName: cat?.name || '',
        });
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
      const stepEntry = {
        index: i, agentId: steps[i].agentId,
        success: result.success, status: result.status, summary: result.summary,
      };
      // 提取结果类型和数据（供前端 ResultCanvas 渲染）
      if (result.data && typeof result.data === 'object') {
        const d = result.data;
        if (d._resultType) stepEntry.resultType = d._resultType;
        if (d._resultType && d.text) stepEntry.resultData = String(d.text);
      }
      stepsData.push(stepEntry);

      if (!result.success) {
        hasFailed = true;
        console.warn(`[executor] ${workflow.name} 步骤 ${i + 1} 失败: ${result.summary}`);
      }
    }

    // ── 每层执行完后增量更新 stepsData，让前端轮询可实时看到 ──
    const sortedSnapshot = [...stepsData].sort((a, b) => a.index - b.index);
    await prisma.workflowRun.update({
      where: { id: run.id },
      data: { steps: sortedSnapshot },
    }).catch(err => console.error('[executor] incremental step update error:', err.message));
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

module.exports = { executeWorkflow, executeStep, callAI };

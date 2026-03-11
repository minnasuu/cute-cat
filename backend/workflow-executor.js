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

    // ─── 邮件类技能 ───
    if (skillId === 'send-email') {
      const p = merged._params || {};
      // 收件人：_params.to > merged.to > userEmail
      const to = p.to || merged.to || userEmail || '';
      // 主题：_params.subject > merged.subject > 默认主题
      const subject = p.subject || merged.subject || (skillId === 'send-email' ? '【猫猫邮件】' : 'I-am-minna 猫猫团队通知');
      // 正文：_params.body > merged.notes/text/summary
      const text = p.body || merged.notes || merged.text || merged.summary || '这是一封来自猫猫团队的邮件 🐱';
      if (!to) return { success: false, data: null, summary: '未配置收件人邮箱', status: 'error' };
      try {
        const result = await sendEmailDirect({ to, subject, html: '', text });
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

// ─── 执行整个工作流 ───
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
  let prevResults = {};
  let hasFailed = false;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];

    // 查询猫猫的性格 systemPrompt（用于 AI 类技能注入）
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

    stepsData.push({
      index: i, skillId: step.skillId, action: step.action,
      success: result.success, status: result.status, summary: result.summary,
    });

    if (result.data && typeof result.data === 'object') {
      prevResults = { ...prevResults, ...result.data };
    }

    if (!result.success) {
      hasFailed = true;
      console.warn(`[executor] ${workflow.name} 步骤 ${i + 1} 失败: ${result.summary}`);
      break;
    }
  }

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

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();
const prisma = new PrismaClient();

/**
 * 可选认证中间件 — 有 token 就解析 userId，没有也放行
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return next();
  try {
    const { verifyToken } = require('../middleware/auth');
    const decoded = verifyToken(authHeader.split(' ')[1]);
    req.userId = decoded.userId;
  } catch { /* ignore invalid token */ }
  next();
}

/**
 * AI 调用后记录用量：aiUsed +1 & 写 AICallLog
 * 静默执行，不影响主流程
 */
async function recordAiUsage(userId, { taskId, model, teamId, catId } = {}) {
  if (!userId) return null;
  try {
    const [user] = await Promise.all([
      prisma.user.update({
        where: { id: userId },
        data: { aiUsed: { increment: 1 } },
        select: { aiUsed: true, aiQuota: true },
      }),
      prisma.aICallLog.create({
        data: {
          userId,
          teamId: teamId || 'unknown',
          catId: catId || null,
          skillId: taskId || null,
          model: model || null,
        },
      }).catch(() => {}),
    ]);
    return user;
  } catch (err) {
    console.error('[recordAiUsage] error:', err.message);
    return null;
  }
}

// Dify Workflow 代理端点 - 生成目标数据
router.post('/generate-goal', optionalAuth, async (req, res) => {
  try {
    const { goal } = req.body;

    if (!goal) {
      return res.status(400).json({ error: 'Goal is required' });
    }

    const difyApiKey = process.env.DIFY_GOAL_API_KEY;
    const difyApiUrl = process.env.DIFY_API_URL || 'https://api.dify.ai/v1';

    if (!difyApiKey) {
      return res.status(500).json({ error: 'Server configuration error: DIFY_GOAL_API_KEY not set' });
    }

    // 调用 Dify Workflow API
    const response = await fetch(`${difyApiUrl}/workflows/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${difyApiKey}`,
      },
      body: JSON.stringify({
        inputs: {
          goal: goal
        },
        response_mode: 'blocking',
        user: 'user-' + Date.now(),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Dify API error:', errorText);
      return res.status(response.status).json({ 
        error: 'Dify API error',
        details: errorText,
        status: response.status
      });
    }

    const result = await response.json();
    
    console.log('Dify API Response:', JSON.stringify(result, null, 2));
    
    // 尝试多种可能的数据结构
    let difyData;
    
    // 尝试 1: result.data.outputs.text (Dify workflow 返回的文本格式)
    if (result?.data?.outputs?.text) {
      try {
        let textContent = result.data.outputs.text;
        
        // 如果文本包含在 markdown 代码块中，提取 JSON 内容
        const jsonMatch = textContent.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
        if (jsonMatch) {
          textContent = jsonMatch[1];
        }
        
        difyData = JSON.parse(textContent);
        console.log('Parsed from text field:', difyData);
      } catch (e) {
        console.error('Failed to parse Dify text response:', e);
        return res.status(500).json({ 
          error: 'Failed to parse Dify response',
          details: e.message 
        });
      }
    }
    // 尝试 2: result.data.outputs (直接是对象)
    else if (result?.data?.outputs && typeof result.data.outputs === 'object') {
      difyData = result.data.outputs;
    }
    // 尝试 3: result.outputs
    else if (result?.outputs) {
      difyData = result.outputs;
    }
    // 尝试 4: result 本身就是数据
    else if (result?.professional_input || result?.professional_output) {
      difyData = result;
    }
    // 尝试 5: result.data 本身
    else if (result?.data) {
      difyData = result.data;
    }
    else {
      console.error('Unknown Dify response structure:', result);
      return res.status(500).json({ 
        error: 'Invalid API response structure',
        rawResponse: result 
      });
    }

    console.log('Parsed difyData:', difyData);

    // 验证必需的字段
    if (!difyData.professional_input?.human || !difyData.professional_input?.ai ||
        !difyData.professional_output?.human || !difyData.professional_output?.ai) {
      console.error('Missing required fields in difyData:', {
        professional_input_human: !!difyData.professional_input?.human,
        professional_input_ai: !!difyData.professional_input?.ai,
        professional_output_human: !!difyData.professional_output?.human,
        professional_output_ai: !!difyData.professional_output?.ai,
      });
      return res.status(500).json({ 
        error: 'Invalid API response: missing required fields',
        receivedData: difyData 
      });
    }

    // 记录 AI 用量
    const usage = await recordAiUsage(req.userId, { taskId: 'generate-goal', model: 'dify' });

    // 返回处理后的数据
    res.json({
      inputData: {
        myInputs: difyData.professional_input.human.map(item => ({
          ...item,
          is_system: false,
          timeSpent: item.timeSpent || 0
        })),
        aiInputs: difyData.professional_input.ai.map(item => ({
          ...item,
          is_system: false,
          timeSpent: item.timeSpent || 0
        }))
      },
      outputData: {
        myOutputs: difyData.professional_output.human.map(item => ({
          ...item,
          is_system: false,
          timeSpent: item.timeSpent || 0
        })),
        aiOutputs: difyData.professional_output.ai.map(item => ({
          ...item,
          is_system: false,
          timeSpent: item.timeSpent || 0
        }))
      },
      ...(usage ? { aiUsed: usage.aiUsed, aiQuota: usage.aiQuota } : {}),
    });

  } catch (error) {
    console.error('Error in generate-goal endpoint:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

// 通用 Skill 路由：各 skill 共用 Gemini 模型
// POST /api/dify/skill  body: { taskId, text }

// 延迟加载 GoogleGenAI（ESM-only 包，需用 dynamic import）
let _GoogleGenAI = null;
async function getGoogleGenAI() {
  if (!_GoogleGenAI) {
    const mod = await import('@google/genai');
    _GoogleGenAI = mod.GoogleGenAI;
  }
  return _GoogleGenAI;
}

// 创建 Gemini AI 客户端（支持自定义代理地址）
async function createGeminiClient(apiKey) {
  const GoogleGenAI = await getGoogleGenAI();
  const baseUrl = process.env.GEMINI_BASE_URL; // 可选：自定义代理地址
  const opts = { apiKey };
  if (baseUrl) {
    opts.httpOptions = { baseUrl };
  }
  return new GoogleGenAI(opts);
}

// Skill 对应的系统提示词
const SKILL_SYSTEM_PROMPTS = {
  'meeting-notes': `你是一位会议纪要撰写助手。根据用户提供的周会内容（包括产出统计、网站诊断、代办清单、任务分配等），生成结构化的会议纪要。

格式要求（Markdown）：
1. **标题**：根据本次会议实际讨论的核心内容，由你总结一个简洁有力的会议标题（不要写成"周会纪要"之类的泛称，而是提炼出重点）
2. **会议信息**：日期、主持人、参会人 — 这些信息会由系统在输入中提供，请直接使用
3. **本周回顾**（关键产出）
4. **问题与改进**
5. **下周计划**
6. **行动项**（具体责任人和截止日期）

用中文回复，简洁专业，适当使用 emoji。`,

  'assign-task': `你是一位项目任务拆解助手。用户会提供前序步骤的输出内容（可能包含代办清单、网站诊断、产出统计等），你需要从中提取出**最重要、最可执行**的任务，分配到对应分类。

规则：
1. 输出 0-5 个任务，宁缺毋滥，只保留有明确可执行动作的条目
2. 每个任务必须属于以下三个分类之一：文章、Crafts、功能扩展
3. title 简明扼要（10字以内），description 说明具体要做什么
4. 如果前序内容中没有可执行的任务，返回空数组即可

请严格返回 JSON 格式（不要 markdown 代码块包裹），示例：
[
  { "category": "文章", "title": "React 状态管理对比", "description": "撰写一篇 React 状态管理方案对比文章" },
  { "category": "Crafts", "title": "代码雨动效", "description": "开发一个 Matrix 风格的代码雨视觉组件" },
  { "category": "功能扩展", "title": "深色模式", "description": "为个站添加深色模式切换功能" }
]

只返回 JSON 数组，不要添加任何额外文字。`,

  'ai-chat': `你是一只友善的猫猫助手 CAT，团队的万能基础成员。请根据用户输入完成对应的文本任务（总结、分析、翻译、改写、问答等）。用简洁清晰的中文回答。`,

  'workflow-gen': `你是一个工作流编排助手，根据用户需求和可用猫猫团队生成工作流配置。严格输出 JSON，不要任何其他文字。

## 能力评估
先判断团队猫猫和技能是否覆盖需求。
- 完全覆盖 → "suggestionMode": false
- 不足 → "suggestionMode": true，填写 suggestedCats/suggestedSkills/suggestionSummary，不能覆盖的步骤 agentId 留空

## JSON 格式
{"suggestionMode":false,"suggestionSummary":"","suggestedCats":[{"role":"角色名","reason":"原因","suggestedSkills":["技能id"]}],"suggestedSkills":[{"agentId":"猫猫id","agentName":"名字","skillId":"技能id","skillName":"技能名","reason":"原因"}],"name":"工作流名称","icon":"emoji","description":"描述","scheduled":false,"cron":"","startTime":"","endTime":"","persistent":false,"steps":[{"stepId":"唯一步骤id如s_abc123","agentId":"猫猫id或空","skillId":"技能id或空","action":"行为描述","inputFrom":"来源步骤的stepId","params":[{"key":"k","label":"标签","type":"text|textarea|number|select|tags|toggle|url","placeholder":"提示","required":true,"description":"说明"}]}]}

## 可用技能ID
内容创作: generate-article, generate-outline, meeting-notes
创意策划: mece-analysis, scamper-creative, six-hats
数据分析: crawl-news,
视觉设计: generate-image, generate-chart, image-enhance
沟通运营: send-email, task-log
开发运维: fix-bug, content-review
项目管理: assign-task, manage-workflow, run-workflow, recruit-cat

## 角色对应
Project Manager: assign-task, manage-workflow, run-workflow, recruit-cat
Content Editor: generate-article, generate-outline, meeting-notes
Data Analyst: crawl-news,
Visual Designer: generate-image, generate-chart, image-enhance
Creative Strategist: mece-analysis, scamper-creative, six-hats
Operations Assistant: send-email, task-log
Engineer: fix-bug,
规则：agentId/skillId 正常模式下必须来自用户提供的真实 id；每个步骤必须有唯一 stepId（格式如 s_abc123）；params 不需要则空数组；定时任务设 scheduled=true 填 cron/startTime/endTime；inputFrom 填来源步骤的 stepId（不是 agentId），第一步不需要。`,
};

// Qwen (通义千问) 调用 — 兼容 OpenAI Chat Completions 格式
async function callQwen(systemPrompt, userText, maxTokens = 4096) {
  const apiKey = process.env.QWEN_API_KEY;
  if (!apiKey) throw new Error('QWEN_API_KEY not set');

  const baseUrl = process.env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
  const model = process.env.QWEN_MODEL || 'qwen-plus';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000); // 90s 超时

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userText },
        ],
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

// 可用模型列表
const AVAILABLE_MODELS = {
  gemini: { name: 'Gemini', provider: 'Google' },
  qwen: { name: 'Qwen', provider: 'Alibaba' },
};

// 获取可用模型列表
router.get('/models', (_req, res) => {
  const models = Object.entries(AVAILABLE_MODELS).map(([id, info]) => {
    let available = false;
    if (id === 'gemini') available = !!process.env.GEMINI_API_KEY;
    if (id === 'qwen') available = !!process.env.QWEN_API_KEY;
    return { id, ...info, available };
  });
  res.json({ models, default: process.env.DEFAULT_AI_MODEL || 'qwen' });
});

router.post('/skill', optionalAuth, async (req, res) => {
  try {
    const { taskId, text, model, teamId, catId } = req.body;

    if (!taskId || !text) {
      return res.status(400).json({ error: 'taskId and text are required' });
    }

    // 配额检查（仅已登录用户）
    if (req.userId) {
      const u = await prisma.user.findUnique({ where: { id: req.userId }, select: { aiUsed: true, aiQuota: true } });
      if (u && u.aiUsed >= u.aiQuota) {
        return res.status(429).json({ error: 'AI 额度已用完，请联系管理员或升级套餐', aiUsed: u.aiUsed, aiQuota: u.aiQuota });
      }
    }

    const systemPrompt = SKILL_SYSTEM_PROMPTS[taskId] || '你是一位专业的 AI 助手，请用中文回复用户的问题。';
    const selectedModel = model || process.env.DEFAULT_AI_MODEL || 'qwen';

    // 根据 taskId 动态调整 token 限制
    // 结构化输出类（JSON 格式）需要更大空间防止截断
    const TASK_MAX_TOKENS = {
      'workflow-gen': 8192,
      'mece-analysis': 8192,
      'scamper-creative': 8192,
      'six-hats': 8192,
      'generate-outline': 8192,
      'content-review': 8192,
      'recruit-cat': 8192,
      'team-review': 8192,
      'cat-training': 8192,
    };
    const maxTokens = TASK_MAX_TOKENS[taskId] || 4096;

    console.log(`[ai/skill] taskId=${taskId}, model=${selectedModel}, text length=${text.length}, maxTokens=${maxTokens}`);

    let answer = '';

    if (selectedModel === 'qwen') {
      // --- Qwen ---
      answer = await callQwen(systemPrompt, text, maxTokens);
    } else {
      // --- Gemini (默认) ---
      const GoogleGenAI = await getGoogleGenAI();
      if (!GoogleGenAI) {
        return res.status(500).json({ error: 'Server configuration error: @google/genai module not available' });
      }

      const geminiApiKey = process.env.GEMINI_API_KEY;
      if (!geminiApiKey) {
        return res.status(500).json({ error: 'Server configuration error: GEMINI_API_KEY not set' });
      }

      const ai = await createGeminiClient(geminiApiKey);
      const response = await ai.models.generateContent({
        model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
        contents: text,
        config: {
          systemInstruction: systemPrompt,
          maxOutputTokens: maxTokens,
          temperature: 0.7,
        },
      });

      answer = response.text || '';
    }

    console.log(`[ai/skill] taskId=${taskId}, model=${selectedModel}, answer length=${answer.length}`);

    // 记录 AI 用量
    const usage = await recordAiUsage(req.userId, { taskId, model: selectedModel, teamId, catId });

    res.json({
      answer,
      model: selectedModel,
      conversationId: `${selectedModel}-${taskId}-${Date.now()}`,
      ...(usage ? { aiUsed: usage.aiUsed, aiQuota: usage.aiQuota } : {}),
    });
  } catch (error) {
    console.error('[ai/skill] Error:', error);
    // 返回更具体的错误信息帮助定位
    let errDetail = error.message || String(error);
    if (errDetail.includes('API_KEY') || errDetail.includes('apiKey')) {
      errDetail = 'AI API Key 未配置或无效，请检查 .env 中的 GEMINI_API_KEY 或 QWEN_API_KEY';
    } else if (errDetail.includes('ECONNREFUSED') || errDetail.includes('ENOTFOUND') || errDetail.includes('fetch failed')) {
      errDetail = 'AI 服务连接失败，请检查网络或 API 地址配置';
    } else if (errDetail.includes('aborted') || errDetail.includes('timeout')) {
      errDetail = 'AI 服务响应超时，请稍后重试';
    }
    res.status(500).json({
      error: 'AI API error',
      message: errDetail,
    });
  }
});

// =====================================================================
// POST /api/dify/crawl — RSS / URL 爬取代理
// 前端 crawl-news 技能通过此接口获取外部内容，避免 CORS 问题
// =====================================================================
router.post('/crawl', async (req, res) => {
  const { sources = [], keyword = '', maxItems = 20 } = req.body;

  if (!Array.isArray(sources) || sources.length === 0) {
    return res.status(400).json({ error: '请提供至少一个 RSS / URL 源' });
  }

  const limit = Math.min(Number(maxItems) || 20, 100);
  const keywords = keyword
    ? keyword.split(/[,，、\s]+/).filter(Boolean).map(k => k.toLowerCase())
    : [];

  const allItems = [];

  for (const src of sources.slice(0, 10)) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);

      const resp = await fetch(src, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'CuteCat-Crawler/1.0',
          'Accept': 'application/rss+xml, application/xml, application/atom+xml, text/xml, text/html, */*',
        },
      });
      clearTimeout(timer);

      if (!resp.ok) {
        allItems.push({ source: src, error: `HTTP ${resp.status}` });
        continue;
      }

      const contentType = resp.headers.get('content-type') || '';
      const body = await resp.text();

      if (contentType.includes('xml') || contentType.includes('rss') || body.trimStart().startsWith('<?xml') || body.trimStart().startsWith('<rss') || body.trimStart().startsWith('<feed')) {
        // RSS / Atom 解析
        const items = parseRSSItems(body, src, limit);
        allItems.push(...items);
      } else if (contentType.includes('json')) {
        // JSON API 直接返回
        try {
          const json = JSON.parse(body);
          const arr = Array.isArray(json) ? json : (json.items || json.data || json.results || json.articles || [json]);
          for (const item of arr.slice(0, limit)) {
            allItems.push({
              title: item.title || item.name || '(无标题)',
              summary: item.summary || item.description || item.content || '',
              link: item.link || item.url || src,
              pubDate: item.pubDate || item.published || item.date || '',
              source: src,
            });
          }
        } catch {
          allItems.push({ source: src, error: 'JSON 解析失败' });
        }
      } else {
        // 普通 HTML — 提取 title 和 meta description
        const titleMatch = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        const descMatch = body.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)
          || body.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
        allItems.push({
          title: titleMatch ? titleMatch[1].trim() : '(无标题)',
          summary: descMatch ? descMatch[1].trim() : body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500),
          link: src,
          pubDate: '',
          source: src,
        });
      }
    } catch (err) {
      const msg = err.name === 'AbortError' ? '请求超时 (15s)' : (err.message || String(err));
      allItems.push({ source: src, error: msg });
    }
  }

  // 关键词过滤
  let filtered = allItems;
  if (keywords.length > 0) {
    filtered = allItems.filter(item => {
      if (item.error) return true; // 保留错误项
      const text = `${item.title || ''} ${item.summary || ''}`.toLowerCase();
      return keywords.some(k => text.includes(k));
    });
  }

  res.json({
    items: filtered.slice(0, limit),
    total: filtered.length,
    sourcesCount: sources.length,
    keyword: keyword || null,
  });
});

/** 简易 RSS/Atom XML 解析（无需额外依赖） */
function parseRSSItems(xml, source, limit) {
  const items = [];
  // RSS 2.0 <item>
  const rssItems = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
  // Atom <entry>
  const atomEntries = xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  const entries = rssItems.length > 0 ? rssItems : atomEntries;

  for (const entry of entries.slice(0, limit)) {
    const getTag = (tag) => {
      const m = entry.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
      return m ? m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim() : '';
    };
    const getLinkHref = () => {
      const m = entry.match(/<link[^>]+href=["']([^"']*)["']/i);
      return m ? m[1] : getTag('link');
    };

    items.push({
      title: getTag('title') || '(无标题)',
      summary: getTag('description') || getTag('summary') || getTag('content') || '',
      link: getLinkHref() || getTag('link') || '',
      pubDate: getTag('pubDate') || getTag('published') || getTag('updated') || '',
      source,
    });
  }
  return items;
}

// =====================================================================
// Vibe Style Lib — 图片上传 + AI 视觉风格分析 + 灵感库 CRUD
// =====================================================================

const multer = require('multer');
const path = require('path');
const crypto = require('crypto');

// multer 配置：存储到 uploads/vibe-snap/
const vibeSnapStorage = multer.diskStorage({
  destination: path.join(__dirname, '..', 'uploads', 'vibe-snap'),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${crypto.randomUUID()}-${Date.now()}${ext}`);
  },
});
const vibeSnapUpload = multer({
  storage: vibeSnapStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(png|jpe?g|webp|gif)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('仅支持 PNG/JPG/WEBP/GIF 图片'));
  },
});

// POST /api/dify/vibe-snap-upload — 上传图片文件
router.post('/vibe-snap-upload', optionalAuth, (req, res) => {
  vibeSnapUpload.single('file')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ success: false, error: '图片文件过大（最大 10MB）' });
      return res.status(400).json({ success: false, error: err.message || '上传失败' });
    }
    if (!req.file) return res.status(400).json({ success: false, error: '请选择图片文件' });
    const url = `/uploads/vibe-snap/${req.file.filename}`;
    res.json({ success: true, data: { url, filename: req.file.filename } });
  });
});

// POST /api/dify/vibe-snap-extract — AI 视觉风格分析
// 使用 SSE 心跳防止 nginx 等反向代理 504 Gateway Timeout
router.post('/vibe-snap-extract', optionalAuth, async (req, res) => {
  // --- 设置 SSE 流式响应头，让 nginx 不缓存并保持连接 ---
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // nginx 专用：关闭代理缓冲
  res.flushHeaders();

  // 心跳定时器：每 8 秒发送一个 SSE 注释行，让 nginx 知道连接仍然活跃
  const heartbeat = setInterval(() => {
    try { res.write(':heartbeat\n\n'); } catch { /* 连接已关闭 */ }
  }, 8000);

  // 辅助函数：发送最终 SSE 数据帧并结束响应
  function sendResult(payload) {
    clearInterval(heartbeat);
    try {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
      res.end();
    } catch { /* 连接已关闭 */ }
  }

  // 客户端断开时清理
  req.on('close', () => clearInterval(heartbeat));

  try {
    const { imageBase64, mimeType } = req.body;
    if (!imageBase64) return sendResult({ success: false, error: '缺少图片数据' });

    const apiKey = process.env.QWEN_API_KEY;
    if (!apiKey) return sendResult({ success: false, error: 'QWEN_API_KEY 未配置' });

    const baseUrl = process.env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
    const model = 'qwen3.5-plus'; // 使用支持视觉的模型

    const systemPrompt = `你是资深 UI/视觉设计分析助手。用户上传的是**网页或 App 界面截图**（可能为长图）。

请仅输出 **一个 JSON 对象**（不要 markdown 代码围栏，不要前后解释文字），字段严格如下：
{
  "designSummary": {
    "styleDescription": "string，2-4 句中文，概括整体设计风格与气质",
    "styleTags": ["3-6 个中文短语标签"],
    "colors": [
      { "name": "string", "hex": "#RRGGBB", "usage": "string 简短说明用途" }
    ],
    "typography": [
      { "family": "字体名", "note": "可选，用途说明" }
    ],
    "visualAttributes": {
      "borderRadius": "string，圆角规律与典型值",
      "shadow": "string，阴影层级与示例 box-shadow 或描述",
      "border": "string，描边/分割线用法",
      "spacing": "string，间距体系与基准"
    }
  },
  "designPrompt": "string，一段完整的中文提示词，供文生图/代码实现复刻类似页面；可包含 Tailwind/色板/字体/区块结构建议，800-2000 字为宜",
  "libraryBlurb": "string，80-160 字中文，用于缩略卡片上的设计总结摘要"
}

要求：
- 根据截图**如实推断**配色与风格；无法确认的字体写「无衬线」类描述并列举常见替代。
- hex 必须合法 6 位。
- colors 至少 4 项，建议 5-8 项。`;

    // 安全校验 mimeType，非法则 fallback 到 image/jpeg
    const safeMime = /^image\/(png|jpe?g|webp|gif)$/i.test(mimeType || '')
      ? mimeType
      : 'image/jpeg';
    const dataUrl = `data:${safeMime};base64,${imageBase64}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000); // 120s 超时

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: '请分析这张界面截图，输出上述 JSON。',
                },
                {
                  type: 'image_url',
                  image_url: { url: dataUrl },
                },
              ],
            },
          ],
          max_tokens: 8192,
          temperature: 0.35,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Qwen API ${response.status}: ${errText.substring(0, 500)}`);
      }

      const data = await response.json();
      let answer = data.choices?.[0]?.message?.content || '';
      if (!answer.trim()) {
        return sendResult({ success: false, error: '视觉模型返回内容为空' });
      }

      // 清理 markdown 代码块包裹
      const codeMatch = answer.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeMatch) answer = codeMatch[1].trim();

      let parsed;
      try {
        parsed = JSON.parse(answer);
      } catch {
        console.error('[vibe-snap-extract] JSON parse failed:', answer.slice(0, 500));
        return sendResult({ success: false, error: 'AI 返回了无效的 JSON 数据' });
      }

      // 严格校验必要字段
      const { designSummary, designPrompt, libraryBlurb } = parsed;
      if (!designSummary || typeof designSummary !== 'object') {
        return sendResult({ success: false, error: '模型返回缺少 designSummary' });
      }
      if (!designPrompt || typeof designPrompt !== 'string') {
        return sendResult({ success: false, error: '模型返回缺少 designPrompt' });
      }

      // libraryBlurb 缺失时，从 styleDescription 自动 fallback
      const finalBlurb = (typeof libraryBlurb === 'string' && libraryBlurb.trim())
        ? libraryBlurb.trim()
        : (typeof designSummary.styleDescription === 'string'
            ? designSummary.styleDescription.slice(0, 200)
            : '');

      // 记录 AI 用量
      await recordAiUsage(req.userId, { taskId: 'vibe-snap-extract', model: 'qwen' });

      sendResult({
        success: true,
        data: {
          designSummary,
          designPrompt: designPrompt.trim(),
          libraryBlurb: finalBlurb,
        },
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    console.error('[vibe-snap-extract] error:', err);
    const errMsg = err.name === 'AbortError'
      ? 'AI 分析超时（120s），请使用更小的图片或稍后重试'
      : (err.message || 'AI 分析失败');
    sendResult({ success: false, error: errMsg });
  }
});

// GET /api/dify/vibe-snap-library — 获取灵感库列表
router.get('/vibe-snap-library', optionalAuth, async (req, res) => {
  try {
    const items = await prisma.vibeStyleItem.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: { items } });
  } catch (err) {
    console.error('[vibe-snap-library] list error:', err);
    res.status(500).json({ success: false, error: '获取灵感库失败' });
  }
});

// POST /api/dify/vibe-snap-library — 保存灵感卡片
router.post('/vibe-snap-library', optionalAuth, async (req, res) => {
  try {
    const { imageUrl, tags, colors, summary, designSummary, designPrompt, ownerName } = req.body;
    if (!imageUrl || !designSummary || !designPrompt) {
      return res.status(400).json({ success: false, error: '缺少必要字段' });
    }
    const item = await prisma.vibeStyleItem.create({
      data: {
        userId: req.userId || null,
        imageUrl,
        tags: tags || [],
        colors: colors || [],
        summary: summary || '',
        designSummary,
        designPrompt,
        ownerName: ownerName || '',
      },
    });
    res.json({ success: true, data: item });
  } catch (err) {
    console.error('[vibe-snap-library] save error:', err);
    res.status(500).json({ success: false, error: '保存失败' });
  }
});

// DELETE /api/dify/vibe-snap-library/:id — 删除灵感卡片
router.delete('/vibe-snap-library/:id', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const item = await prisma.vibeStyleItem.findUnique({ where: { id } });
    if (!item) return res.status(404).json({ success: false, error: '卡片不存在' });

    await prisma.vibeStyleItem.delete({ where: { id } });
    res.json({ success: true, data: { id } });
  } catch (err) {
    console.error('[vibe-snap-library] delete error:', err);
    res.status(500).json({ success: false, error: '删除失败' });
  }
});

module.exports = router;

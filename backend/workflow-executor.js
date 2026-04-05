/**
 * 后端工作流执行引擎
 *
 * 纯流水线调度器：负责连接各步骤、传递上游输出，不注入额外 prompt。
 * 每个步骤完全由对应猫猫的 agent 脚本自行控制输入输出。
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

// ─── 单步执行：根据 agentId 分发到对应的猫脚本 ───
// 工作流仅负责连接步骤、传递上游输出，不注入额外 prompt，每步完全由 agent 脚本自控。
async function executeStep(step, prevResults, userEmail, context = {}) {
  // 合并上游结果
  const merged = { ...prevResults };

  // 注入用户输入（如果是第一步且上游无文本）
  if (context.userInput && !merged.text) {
    merged.text = context.userInput;
  }

  try {
    // 所有步骤统一通过 agentId 分发到 cat-step-scripts
    const { runAgentStep } = require('./lib/cat-step-scripts');
    return runAgentStep({ step, merged, userEmail, context });
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

  // 构建执行上下文（仅传递必要的运行时信息）
  const executionContext = {
    userName,
    workflowName: workflow.name,
    userInput,
  };

  let steps = Array.isArray(workflow.steps) ? workflow.steps : (typeof workflow.steps === 'string' ? JSON.parse(workflow.steps) : []);
  steps = JSON.parse(JSON.stringify(steps));

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

      // 查询猫猫的 templateId（供 cat-step-scripts 按猫分发脚本）
      let catTemplateId = '';
      let catName = '';
      if (step.agentId) {
        const cat = await prisma.teamCat.findUnique({
          where: { id: step.agentId },
          select: { templateId: true, name: true },
        }).catch(() => null);
        if (cat?.templateId) catTemplateId = cat.templateId;
        if (cat?.name) catName = cat.name;
      }

      // 带超时保护（120 秒）
      let result;
      try {
        const executePromise = executeStep(step, prevResults, userEmail, {
          ...executionContext,
          catTemplateId,
          catName,
        });
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('执行超时 (120s)')), 120000));
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

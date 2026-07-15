/**
 * 后端工作流执行引擎
 *
 * 链式调度：先创建 WorkflowRun，再按拓扑顺序串行执行各步。
 * 每步 merged 仅为 { text } — 第一步 text = userInput，后续 text = 直接上游步骤的 data.text。
 * 各猫脚本内部自带 system prompt，通过 callAI(system, user) 调用模型。
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { chargeAI } = require('./lib/billing');
const coins = require('./lib/coins');

// ─── ARK 豆包文本调用 (火山方舟, OpenAI 兼容) — 唯一文本模型 ──
// 模型: doubao-seed-2-1-pro-260628 (与灵感视觉分析共用同一 ARK key)
async function callArk(systemPrompt, userText, maxTokens = 4096) {
  const apiKey = process.env.ARK_API_KEY;
  if (!apiKey) throw new Error('ARK_API_KEY not set');
  const baseUrl = process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3';
  const model = process.env.ARK_TEXT_MODEL || 'doubao-seed-2-1-pro-260628';

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
      throw new Error(`Ark API ${response.status}: ${errText}`);
    }
    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  } finally {
    clearTimeout(timeout);
  }
}

// ─── 流式 ARK 豆包文本调用 (火山方舟, OpenAI 兼容) — 唯一文本流模型
// 文档: https://www.volcengine.com/docs/82379 —— /chat/completions SSE,格式与 OpenAI 一致
async function callArkStream(systemPrompt, userText, maxTokens = 4096, { onDelta, signal } = {}) {
  const apiKey = process.env.ARK_API_KEY;
  if (!apiKey) throw new Error('ARK_API_KEY not set');
  const baseUrl = process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3';
  const model = process.env.ARK_TEXT_MODEL || 'doubao-seed-2-1-pro-260628';

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userText }],
      max_tokens: maxTokens,
      temperature: 0.7,
      stream: true,
    }),
    signal,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Ark API ${response.status}: ${errText}`);
  }

  const reader = response.body;
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  const startedAt = Date.now();
  let gotFirstDelta = false;

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
        if (delta) {
          if (!gotFirstDelta) {
            gotFirstDelta = true;
            console.log(`[callArkStream] first delta after ${Date.now() - startedAt}ms, model=${model}`);
          }
          fullText += delta;
          onDelta?.(delta);
        }
      } catch { /* skip malformed line */ }
    }
  }
  // 诊断:全程无 delta 几乎一定是首 token 超时或响应格式异常,便于区分排查
  if (!gotFirstDelta) {
    console.warn(`[callArkStream] no delta extracted in ${Date.now() - startedAt}ms, model=${model}, baseUrl=${baseUrl}`);
  }
  return fullText;
}

// ─── 通用 AI 调用 (唯一文本模型: ARK 豆包) ────────────────────
async function callAI(systemPrompt, userText, model, maxTokens = 4096) {
  const selectedModel = model || process.env.DEFAULT_AI_MODEL || 'ark';
  // 当前仅支持 ARK 豆包文本模型
  return callArk(systemPrompt, userText, maxTokens);
}

// ─── 单步执行：merged 仅为 { text: 本步 user 正文 } ───
async function executeStep(step, merged, userEmail, context = {}) {
  try {
    const { runAgentStep } = require('./lib/cat-step-scripts');
    return runAgentStep({ step, merged, userEmail, context, onChunk: context?.onChunk });
  } catch (err) {
    return { success: false, data: null, summary: `步骤执行异常: ${err.message}`, status: 'error' };
  }
}

function stepTimeoutMsFor(step) {
  const base = Number.parseInt(process.env.WORKFLOW_STEP_TIMEOUT_MS || '', 10);
  const defaultMs = Number.isFinite(base) && base > 0 ? base : 120_000;

  // 落地页：前端工程师输出长代码，通常需要更长时间
  const feMsRaw = Number.parseInt(process.env.WORKFLOW_FE_STEP_TIMEOUT_MS || '', 10);
  const feMs = Number.isFinite(feMsRaw) && feMsRaw > 0 ? feMsRaw : 300_000;
  if (step?.agentId === 'frontend-engineer' || step?.stepId === 'wpb_fe') return feMs;

  return defaultMs;
}

// ─── 执行整个工作流（拓扑序串行） ───
async function executeWorkflow(workflow, triggeredBy, options = {}) {
  const startTime = Date.now();
  const stepsData = [];
  const userInput = typeof options.userInput === 'string' ? options.userInput.trim() : '';
  const hooks = options.hooks || {};

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
      userInput: userInput || null,
      status: 'running',
    },
  });
  try {
    await hooks.onRunCreated?.({ runId: run.id, workflowId: workflow.id });
  } catch { /* ignore hooks */ }

  return executeWorkflowIntoExistingRun(workflow, run, triggeredBy, { ...options, _startTime: startTime, _stepsData: stepsData });
}

/**
 * 重试：在既有 runId 上执行，覆盖 steps/status，不新建记录
 * @param {any} workflow
 * @param {{id: string, teamId: string, userInput?: string | null}} run
 * @param {string} triggeredBy
 * @param {{userInput?: string, hooks?: object}} options
 */
async function executeWorkflowIntoExistingRun(workflow, run, triggeredBy, options = {}) {
  const startTime = options._startTime || Date.now();
  const stepsData = options._stepsData || [];
  const hooks = options.hooks || {};
  const userInputRaw = typeof options.userInput === 'string' ? options.userInput.trim() : '';
  const userInput = userInputRaw || (typeof run.userInput === 'string' ? run.userInput.trim() : '');
  const qualityMode = options.qualityMode === true;

  // 重置 run 为 running（保留 runId，不新增）
  await prisma.workflowRun.update({
    where: { id: run.id },
    data: {
      status: 'running',
      steps: [],
      completedAt: null,
      totalDuration: null,
      startedAt: new Date(),
      userInput: userInput || null,
    },
  }).catch((err) => console.error('[executor] retry reset run error:', err.message));

  try {
    await hooks.onRunCreated?.({ runId: run.id, workflowId: workflow.id });
  } catch { /* ignore hooks */ }

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
  if (!userEmail) {
    const team = await prisma.team.findUnique({ where: { id: workflow.teamId }, include: { owner: { select: { email: true, nickname: true } } } }).catch(() => null);
    if (team?.owner) {
      userEmail = team.owner.email;
      userName = team.owner.nickname || '';
    }
  }

  const executionContext = {
    userName,
    workflowName: workflow.name,
    userInput,
  };

  let steps = Array.isArray(workflow.steps) ? workflow.steps : (typeof workflow.steps === 'string' ? JSON.parse(workflow.steps) : []);
  steps = JSON.parse(JSON.stringify(steps));

  // 快速模式：默认跳过交互步骤（仅落地页）
  const skipStepIds = new Set();
  if (!qualityMode && workflow?.name === '落地页') {
    skipStepIds.add('wpb_ix');
  }

  const parentIndex = [];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (!step.inputFrom) {
      parentIndex.push(i === 0 ? -1 : i - 1);
    } else {
      let found = steps.findIndex((s, si) => si < i && s.stepId === step.inputFrom);
      if (found < 0) {
        found = steps.findIndex((s, si) => si < i && s.agentId === step.inputFrom);
      }
      parentIndex.push(found >= 0 ? found : (i === 0 ? -1 : i - 1));
    }
  }

  const depth = new Array(steps.length).fill(0);
  for (let i = 0; i < steps.length; i++) {
    const pi = parentIndex[i];
    depth[i] = pi >= 0 ? depth[pi] + 1 : 1;
  }

  const maxDepth = depth.length === 0 ? 0 : Math.max(...depth, 0);
  const layers = [];
  for (let d = 0; d <= maxDepth; d++) {
    layers.push([]);
  }
  for (let i = 0; i < steps.length; i++) {
    layers[depth[i]].push(i);
  }

  /** 拓扑序：深度 1→maxDepth，同层按步骤下标升序 */
  const order = [];
  for (let d = 1; d <= maxDepth; d++) {
    layers[d].sort((a, b) => a - b).forEach((idx) => order.push(idx));
  }

  const stepResults = new Array(steps.length).fill(null);
  let hasFailed = false;

  for (const i of order) {
    if (hasFailed) break;

    const step = steps[i];
    const pi = parentIndex[i];
    const upstreamText = pi < 0 ? userInput : String(stepResults[pi]?.data?.text ?? '');
    const merged = { text: upstreamText };

    if (step?.stepId && skipStepIds.has(step.stepId)) {
      const skippedResult = {
        success: true,
        data: { text: upstreamText },
        summary: '已跳过（快速模式）',
        status: 'success',
      };
      stepResults[i] = skippedResult;
      try {
        await hooks.onStepStart?.({ index: i, stepId: step.stepId, agentId: step.agentId });
      } catch { /* ignore hooks */ }
      const stepEntry = {
        index: i,
        agentId: steps[i].agentId,
        success: true,
        status: 'skipped',
        summary: '已跳过（快速模式）',
      };
      stepsData.push(stepEntry);
      try {
        await hooks.onStepDone?.({
          index: i,
          success: true,
          status: 'skipped',
          summary: stepEntry.summary,
          resultType: null,
          resultData: null,
        });
      } catch { /* ignore hooks */ }
      const sortedSnapshot = [...stepsData].sort((a, b) => a.index - b.index);
      await prisma.workflowRun.update({
        where: { id: run.id },
        data: { steps: sortedSnapshot },
      }).catch((err) => console.error('[executor] incremental step update error:', err.message));
      continue;
    }

    let catTemplateId = '';
    let catName = '';
    let catSystemPrompt = '';
    if (step.agentId) {
      const cat = await prisma.teamCat.findUnique({
        where: { id: step.agentId },
        select: { templateId: true, name: true, systemPrompt: true },
      }).catch(() => null);
      if (cat?.templateId) catTemplateId = cat.templateId;
      if (cat?.name) catName = cat.name;
      if (typeof cat?.systemPrompt === 'string') catSystemPrompt = cat.systemPrompt;
    }

    // 工作流每步扣喵币(原子扣减,余额不足终止流程并标记 failed)
    if (triggeredBy) {
      try {
        await chargeAI(triggeredBy, 'workflow_step', { refId: run.id, note: `workflow:${workflow.name}#${i + 1}` });
      } catch (err) {
        if (err.code === 'INSUFFICIENT_COINS') {
          console.warn(`[executor] 步骤 ${i + 1} 喵币不足,终止流程 | user=${triggeredBy}`);
          hasFailed = true;
          stepResults[i] = { success: false, data: null, summary: '喵币不足,请充值后再试', status: 'failed' };
          continue;
        }
        throw err;
      }
    }

    try {
      await hooks.onStepStart?.({ index: i, stepId: step.stepId, agentId: step.agentId });
    } catch { /* ignore hooks */ }

    // 先插入一个“运行中”的 step 记录，便于前端/历史能看到增量
    const preEntry = {
      index: i,
      agentId: steps[i].agentId,
      success: undefined,
      status: 'running',
      summary: '',
    };
    const preAt = stepsData.findIndex((x) => x.index === i);
    if (preAt >= 0) stepsData[preAt] = preEntry;
    else stepsData.push(preEntry);
    const preSnapshot = [...stepsData].sort((a, b) => a.index - b.index);
    prisma.workflowRun.update({
      where: { id: run.id },
      data: { steps: preSnapshot },
    }).catch((err) => console.error('[executor] incremental step(pre) update error:', err.message));

    let accumulated = '';
    let lastFlushAt = 0;
    const onChunk = (delta) => {
      if (!delta) return;
      accumulated += String(delta);
      try {
        hooks.onStepChunk?.({ index: i, textDelta: String(delta), accumulated });
      } catch { /* ignore hooks */ }

      const now = Date.now();
      if (now - lastFlushAt < 1200) return;
      lastFlushAt = now;

      // 将 partial 写入 steps（用 summary 承载，最终 stepDone 会覆盖为最终 summary/resultData）
      const at = stepsData.findIndex((x) => x.index === i);
      if (at >= 0) {
        stepsData[at] = { ...stepsData[at], status: 'running', summary: accumulated };
      } else {
        stepsData.push({ index: i, agentId: steps[i].agentId, status: 'running', summary: accumulated });
      }
      const snap = [...stepsData].sort((a, b) => a.index - b.index);
      prisma.workflowRun.update({
        where: { id: run.id },
        data: { steps: snap },
      }).catch((err) => console.error('[executor] incremental step(chunk) update error:', err.message));
    };

    let result;
    try {
      const executePromise = executeStep(step, merged, userEmail, {
        ...executionContext,
        runId: run.id,
        teamId: workflow.teamId,
        triggeredBy: triggeredBy || null,
        catTemplateId,
        catName,
        catSystemPrompt,
        stepSystemPrompt:
          typeof step?.systemPrompt === 'string'
            ? step.systemPrompt
            : (typeof step?.system_prompt === 'string' ? step.system_prompt : ''),
        onChunk,
      });
      const timeoutMs = stepTimeoutMsFor(step);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`执行超时 (${Math.round(timeoutMs / 1000)}s)`)), timeoutMs),
      );
      result = await Promise.race([executePromise, timeoutPromise]);
    } catch (err) {
      result = { success: false, data: null, summary: err.message || '步骤执行异常', status: 'error' };
    }

    stepResults[i] = result;

    const stepEntry = {
      index: i,
      agentId: steps[i].agentId,
      success: result.success,
      status: result.status,
      summary: result.summary,
    };
    if (result.data && typeof result.data === 'object') {
      const d = result.data;
      if (d._resultType) stepEntry.resultType = d._resultType;
      if (d._resultType && d.text) stepEntry.resultData = String(d.text);
    }
    if (stepEntry.resultType && stepEntry.resultData && result.success) {
      stepEntry.summary = `已生成 ${stepEntry.resultType}（${stepEntry.resultData.length} 字符）`;
    }
    stepsData.push(stepEntry);

    try {
      await hooks.onStepDone?.({
        index: i,
        success: result.success,
        status: result.status,
        summary: result.summary,
        resultType: stepEntry.resultType,
        resultData: stepEntry.resultData,
      });
    } catch { /* ignore hooks */ }

    if (!result.success) {
      hasFailed = true;
      console.warn(`[executor] ${workflow.name} 步骤 ${i + 1} 失败: ${result.summary}`);
    }

    const sortedSnapshot = [...stepsData].sort((a, b) => a.index - b.index);
    await prisma.workflowRun.update({
      where: { id: run.id },
      data: { steps: sortedSnapshot },
    }).catch((err) => console.error('[executor] incremental step update error:', err.message));
  }

  stepsData.sort((a, b) => a.index - b.index);

  await prisma.workflowRun.update({
    where: { id: run.id },
    data: {
      status: hasFailed ? 'failed' : 'success',
      steps: stepsData,
      completedAt: new Date(),
      totalDuration: Math.round((Date.now() - startTime) / 1000),
    },
  }).catch((err) => console.error('[executor] update run error:', err.message));

  try {
    await hooks.onRunDone?.({ runId: run.id, status: hasFailed ? 'failed' : 'success' });
  } catch { /* ignore hooks */ }

  console.log(`[executor] 工作流 "${workflow.name}" 执行完成 → ${hasFailed ? 'failed' : 'success'} (${Math.round((Date.now() - startTime) / 1000)}s)`);
  return { runId: run.id, status: hasFailed ? 'failed' : 'success', steps: stepsData };
}

module.exports = {
  executeWorkflow,
  executeWorkflowIntoExistingRun,
  executeStep,
  callAI,
  callArkStream,
};

import type { SkillHandler, SkillContext, SkillResult } from './types';
import { callDifySkill } from '../utils/backendClient';

const getBackendUrl = (): string => {
  if (import.meta.env.VITE_BACKEND_URL) return import.meta.env.VITE_BACKEND_URL;
  if (import.meta.env.PROD) return '';
  return 'http://localhost:8002';
};

/** 构造带 auth 的请求 headers */
function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem('accessToken');
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

/** 从 URL 或用户团队列表中自动获取 teamId */
async function resolveTeamId(): Promise<string> {
  // 1. 从当前页面 URL 解析 /teams/:teamId/...
  const match = window.location.pathname.match(/\/teams\/([^/]+)/);
  if (match) return match[1];

  // 2. 兜底：查询用户的团队列表取第一个
  try {
    const resp = await fetch(`${getBackendUrl()}/api/teams`, { headers: authHeaders() });
    if (resp.ok) {
      const teams = await resp.json();
      if (Array.isArray(teams) && teams.length > 0) return teams[0].id;
    }
  } catch (err) {
    console.warn('[manage-workflow] failed to fetch teams:', err);
  }
  return '';
}

/** 获取团队猫猫信息，供 AI 生成使用 */
async function fetchCatInfo(teamId: string): Promise<string> {
  try {
    const resp = await fetch(`${getBackendUrl()}/api/teams/${teamId}`, { headers: authHeaders() });
    if (resp.ok) {
      const teamData = await resp.json();
      const cats = teamData.cats || [];
      if (cats.length > 0) {
        return cats
          .map((c: any) =>
            `- id: "${c.id}", name: "${c.name}", role: "${c.role}", skills: [${(c.skills || []).map((s: any) => `{id:"${s.id}",name:"${s.name}"}`).join(', ')}]`,
          )
          .join('\n');
      }
    }
  } catch (err) {
    console.warn('[manage-workflow] failed to fetch team cats:', err);
  }
  return '（无法获取猫猫信息）';
}

/** 调用 AI 生成工作流配置（千问优先，gemini 回退） */
async function callAiGenerate(aiPrompt: string): Promise<{ result: Record<string, unknown> | null; error: string }> {
  const models = ['qwen', 'gemini'];
  let lastError = '';

  for (const model of models) {
    try {
      console.log(`[manage-workflow] trying AI model: ${model}`);
      const response = await callDifySkill('workflow-gen', aiPrompt, model);

      if (response.error) {
        console.warn(`[manage-workflow] ${model} failed:`, response.error);
        lastError = response.error;
        continue;
      }

      const answer = response.answer || '';
      const jsonMatch = answer.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.warn(`[manage-workflow] ${model} returned non-JSON`);
        lastError = 'AI 返回格式异常';
        continue;
      }

      const result = JSON.parse(jsonMatch[0]);
      console.log(`[manage-workflow] AI generated successfully (${model})`);
      return { result, error: '' };
    } catch (err: any) {
      console.warn(`[manage-workflow] ${model} error:`, err);
      lastError = err.message || String(err);
    }
  }

  return { result: null, error: lastError };
}

// ════════════════════════════════════════════════════════════
//  操作：新增工作流（AI 自动生成）
// ════════════════════════════════════════════════════════════
async function handleCreate(teamId: string, prompt: string): Promise<SkillResult> {
  if (!prompt) {
    return { success: false, data: null, summary: '新增工作流需要提供需求描述（prompt）', status: 'error' };
  }

  const catInfo = await fetchCatInfo(teamId);
  const aiPrompt = `## 用户需求\n${prompt}\n\n## 可用猫猫团队\n${catInfo}`;
  const { result: aiResult, error } = await callAiGenerate(aiPrompt);

  if (!aiResult) {
    return { success: false, data: null, summary: `AI 生成工作流失败: ${error}`, status: 'error' };
  }

  const isSuggestionMode = !!aiResult.suggestionMode;

  const workflowData = {
    name: String(aiResult.name || prompt.slice(0, 30) || '自动生成工作流'),
    icon: String(aiResult.icon || '🤖'),
    description: String(aiResult.description || `由 AI 根据需求自动生成: ${prompt.slice(0, 100)}`),
    steps: aiResult.steps || [],
    scheduled: !!aiResult.scheduled,
    cron: String(aiResult.cron || ''),
    startTime: String(aiResult.startTime || ''),
    endTime: String(aiResult.endTime || ''),
    persistent: !!aiResult.persistent,
  };

  if (!Array.isArray(workflowData.steps) || workflowData.steps.length === 0) {
    return { success: false, data: { aiResult }, summary: 'AI 生成的工作流没有步骤，请尝试更详细的描述', status: 'error' };
  }

  try {
    const resp = await fetch(`${getBackendUrl()}/api/workflows/team/${teamId}`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(workflowData),
    });

    const data = await resp.json();
    if (!resp.ok) {
      return { success: false, data: { error: data.error, aiResult }, summary: `工作流创建失败: ${data.error || `HTTP ${resp.status}`}`, status: 'error' };
    }

    const summaryParts = [`工作流「${workflowData.name}」创建成功`, `共 ${(workflowData.steps as any[]).length} 个步骤`];
    if (isSuggestionMode) summaryParts.push('（注意：部分步骤因团队能力不足可能不完整）');
    if (workflowData.scheduled) summaryParts.push(`定时执行: ${workflowData.cron}`);

    return {
      success: true,
      data: {
        workflow: data,
        name: workflowData.name,
        stepCount: (workflowData.steps as any[]).length,
        teamId,
        suggestionMode: isSuggestionMode,
        suggestedCats: aiResult.suggestedCats,
        suggestedSkills: aiResult.suggestedSkills,
        suggestionSummary: aiResult.suggestionSummary,
      },
      summary: summaryParts.join('，'),
      status: isSuggestionMode ? 'warning' : 'success',
    };
  } catch (err: any) {
    return { success: false, data: { error: err.message, aiResult }, summary: `工作流创建异常: ${err.message}`, status: 'error' };
  }
}

// ════════════════════════════════════════════════════════════
//  操作：修改工作流（AI 根据描述重新生成步骤）
// ════════════════════════════════════════════════════════════
async function handleUpdate(teamId: string, workflowId: string, prompt: string): Promise<SkillResult> {
  if (!workflowId) {
    return { success: false, data: null, summary: '修改工作流需要选择目标工作流', status: 'error' };
  }

  // 先获取现有工作流信息
  let existingWorkflow: any;
  try {
    const resp = await fetch(`${getBackendUrl()}/api/workflows/${workflowId}`, { headers: authHeaders() });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      return { success: false, data: null, summary: `获取工作流失败: ${err.error || `HTTP ${resp.status}`}`, status: 'error' };
    }
    existingWorkflow = await resp.json();
  } catch (err: any) {
    return { success: false, data: null, summary: `获取工作流异常: ${err.message}`, status: 'error' };
  }

  if (!prompt) {
    return { success: false, data: null, summary: '修改工作流需要提供修改描述（prompt）', status: 'error' };
  }

  // 获取猫猫信息，让 AI 理解可用资源
  const catInfo = await fetchCatInfo(teamId);

  const aiPrompt = `## 修改需求\n${prompt}\n\n## 当前工作流信息\n- 名称: ${existingWorkflow.name}\n- 描述: ${existingWorkflow.description || '无'}\n- 当前步骤: ${JSON.stringify(existingWorkflow.steps || [])}\n\n## 可用猫猫团队\n${catInfo}\n\n请根据修改需求，生成完整的新工作流配置（包含所有步骤）。保留不需要修改的部分，只修改用户要求修改的内容。`;

  const { result: aiResult, error } = await callAiGenerate(aiPrompt);

  if (!aiResult) {
    return { success: false, data: null, summary: `AI 生成修改方案失败: ${error}`, status: 'error' };
  }

  // 构造更新数据
  const updateData: Record<string, unknown> = {};
  if (aiResult.name) updateData.name = String(aiResult.name);
  if (aiResult.icon) updateData.icon = String(aiResult.icon);
  if (aiResult.description !== undefined) updateData.description = String(aiResult.description);
  if (aiResult.steps) updateData.steps = aiResult.steps;
  if (aiResult.scheduled !== undefined) updateData.scheduled = !!aiResult.scheduled;
  if (aiResult.cron) updateData.cron = String(aiResult.cron);
  if (aiResult.startTime) updateData.startTime = String(aiResult.startTime);
  if (aiResult.endTime) updateData.endTime = String(aiResult.endTime);
  if (aiResult.persistent !== undefined) updateData.persistent = !!aiResult.persistent;

  try {
    const resp = await fetch(`${getBackendUrl()}/api/workflows/${workflowId}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(updateData),
    });

    const data = await resp.json();
    if (!resp.ok) {
      return { success: false, data: { error: data.error }, summary: `工作流修改失败: ${data.error || `HTTP ${resp.status}`}`, status: 'error' };
    }

    const newSteps = Array.isArray(updateData.steps) ? updateData.steps : existingWorkflow.steps || [];
    return {
      success: true,
      data: { workflow: data, workflowId, teamId },
      summary: `工作流「${data.name || existingWorkflow.name}」修改成功，共 ${newSteps.length} 个步骤`,
      status: 'success',
    };
  } catch (err: any) {
    return { success: false, data: { error: err.message }, summary: `工作流修改异常: ${err.message}`, status: 'error' };
  }
}

// ════════════════════════════════════════════════════════════
//  操作：删除工作流
// ════════════════════════════════════════════════════════════
async function handleDelete(workflowId: string): Promise<SkillResult> {
  if (!workflowId) {
    return { success: false, data: null, summary: '删除工作流需要选择目标工作流', status: 'error' };
  }

  // 先获取工作流名称用于提示
  let workflowName = workflowId;
  try {
    const infoResp = await fetch(`${getBackendUrl()}/api/workflows/${workflowId}`, { headers: authHeaders() });
    if (infoResp.ok) {
      const info = await infoResp.json();
      workflowName = info.name || workflowId;
    }
  } catch { /* ignore */ }

  try {
    const resp = await fetch(`${getBackendUrl()}/api/workflows/${workflowId}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });

    const data = await resp.json();
    if (!resp.ok) {
      return { success: false, data: { error: data.error }, summary: `工作流删除失败: ${data.error || `HTTP ${resp.status}`}`, status: 'error' };
    }

    return {
      success: true,
      data: { workflowId, deleted: true },
      summary: `工作流「${workflowName}」已删除`,
      status: 'success',
    };
  } catch (err: any) {
    return { success: false, data: { error: err.message }, summary: `工作流删除异常: ${err.message}`, status: 'error' };
  }
}

// ════════════════════════════════════════════════════════════
//  主入口
// ════════════════════════════════════════════════════════════

/**
 * 🔧 工作流管理 — 花椒
 *
 * 支持三种操作：
 *   - create: 根据 prompt 调用 AI 自动生成并创建新工作流
 *   - update: 根据 prompt 调用 AI 修改已有工作流的步骤/配置
 *   - delete: 删除指定工作流
 *
 * 参数来源：
 *   - action: _params.action（必选：create / update / delete）
 *   - workflowId: _params.workflowId（修改/删除时必选，从当前团队工作流列表中选择）
 *   - prompt: _params.prompt 或上游步骤输出（新增/修改时使用）
 */
const manageWorkflow: SkillHandler = {
  id: 'manage-workflow',
  async execute(ctx: SkillContext): Promise<SkillResult> {
    console.log(`[manage-workflow] agent=${ctx.agentId} @${ctx.timestamp}`);

    // ── 1. 提取参数 ──
    let action = '';      // create | update | delete
    let workflowId = '';
    let prompt = '';

    if (typeof ctx.input === 'string') {
      // 纯字符串输入默认为新增，整个字符串作为 prompt
      action = 'create';
      prompt = ctx.input;
    } else if (ctx.input && typeof ctx.input === 'object') {
      const input = ctx.input as Record<string, unknown>;
      const params = (input._params || {}) as Record<string, unknown>;

      // 操作类型
      action = String(params.action || input.action || '').trim();

      // 工作流 ID
      workflowId = String(params.workflowId || input.workflowId || '').trim();

      // prompt：优先 _params.prompt，其次上游字段
      prompt = String(
        params.prompt
        || input._action
        || params.text
        || input.text
        || input.summary
        || input.content
        || input.result
        || '',
      ).trim();
    }

    if (!action) {
      return { success: false, data: null, summary: '请选择操作类型（新增 / 修改 / 删除）', status: 'error' };
    }

    // ── 2. 获取 teamId（只操作自己的团队）──
    const teamId = await resolveTeamId();
    if (!teamId) {
      return { success: false, data: null, summary: '无法确定当前团队，请在团队页面中执行', status: 'error' };
    }

    // ── 3. 根据操作类型分发 ──
    switch (action) {
      case 'create':
        return handleCreate(teamId, prompt);

      case 'update':
        return handleUpdate(teamId, workflowId, prompt);

      case 'delete':
        return handleDelete(workflowId);

      default:
        return { success: false, data: null, summary: `不支持的操作类型: ${action}，请选择 create / update / delete`, status: 'error' };
    }
  },
};

export default manageWorkflow;

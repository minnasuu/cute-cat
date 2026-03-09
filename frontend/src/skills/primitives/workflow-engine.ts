import type { PrimitiveHandler, PrimitiveContext, PrimitiveResult } from './types';

const getBackendUrl = (): string => {
  if (import.meta.env.VITE_BACKEND_URL) return import.meta.env.VITE_BACKEND_URL;
  if (import.meta.env.PROD) return '';
  return 'http://localhost:8002';
};

/**
 * 工作流引擎原型 (workflow-engine)
 *
 * 底层能力：通过后端 API 管理和执行工作流。
 * 支持操作：
 *   - trigger: 触发执行指定工作流
 *   - create: 创建新工作流
 *   - update: 更新工作流配置
 *   - delete: 删除工作流
 *   - list: 列出团队工作流
 *   - status: 查询工作流执行状态
 * 上层技能示例：执行工作流、工作流管理、审批流程等。
 */
const workflowEngine: PrimitiveHandler = {
  id: 'workflow-engine',
  async execute(ctx: PrimitiveContext): Promise<PrimitiveResult> {
    console.log(`[primitive:workflow-engine] agent=${ctx.agentId} @${ctx.timestamp}`);

    const config = ctx.config as Record<string, unknown>;
    const action = (config.action as string) || 'trigger';
    const workflowId = (config.workflowId as string) || '';
    const teamId = (config.teamId as string) || '';

    // 解析输入
    let inputData: Record<string, unknown> = {};
    if (typeof ctx.input === 'string') {
      try { inputData = JSON.parse(ctx.input); } catch { inputData = { text: ctx.input }; }
    } else if (ctx.input && typeof ctx.input === 'object') {
      inputData = ctx.input as Record<string, unknown>;
    }

    const backendUrl = getBackendUrl();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = localStorage.getItem('accessToken');
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      switch (action) {
        // ── 触发执行工作流 ──
        case 'trigger':
        case 'execute': {
          if (!workflowId) {
            return { success: false, data: null, summary: '未指定 workflowId', status: 'error' };
          }
          const resp = await fetch(`${backendUrl}/api/workflows/${workflowId}/execute`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ input: inputData }),
          });
          const data = await resp.json();
          if (!resp.ok) {
            return { success: false, data, summary: data.error || `HTTP ${resp.status}`, status: 'error' };
          }
          return {
            success: true,
            data,
            summary: `工作流 ${workflowId} 已触发执行`,
            status: 'success',
          };
        }

        // ── 创建工作流 ──
        case 'create': {
          if (!teamId) {
            return { success: false, data: null, summary: '未指定 teamId', status: 'error' };
          }
          const resp = await fetch(`${backendUrl}/api/workflows/team/${teamId}`, {
            method: 'POST',
            headers,
            body: JSON.stringify(inputData),
          });
          const data = await resp.json();
          if (!resp.ok) {
            return { success: false, data, summary: data.error || `HTTP ${resp.status}`, status: 'error' };
          }
          return { success: true, data, summary: `工作流已创建: ${data.name || data.id}`, status: 'success' };
        }

        // ── 更新工作流 ──
        case 'update': {
          if (!workflowId) {
            return { success: false, data: null, summary: '未指定 workflowId', status: 'error' };
          }
          const resp = await fetch(`${backendUrl}/api/workflows/${workflowId}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify(inputData),
          });
          const data = await resp.json();
          if (!resp.ok) {
            return { success: false, data, summary: data.error || `HTTP ${resp.status}`, status: 'error' };
          }
          return { success: true, data, summary: `工作流 ${workflowId} 已更新`, status: 'success' };
        }

        // ── 删除工作流 ──
        case 'delete': {
          if (!workflowId) {
            return { success: false, data: null, summary: '未指定 workflowId', status: 'error' };
          }
          const resp = await fetch(`${backendUrl}/api/workflows/${workflowId}`, {
            method: 'DELETE',
            headers,
          });
          if (!resp.ok) {
            const data = await resp.json().catch(() => ({}));
            return { success: false, data, summary: `删除失败: HTTP ${resp.status}`, status: 'error' };
          }
          return { success: true, data: { workflowId, deleted: true }, summary: `工作流 ${workflowId} 已删除`, status: 'success' };
        }

        // ── 列出团队工作流 ──
        case 'list': {
          if (!teamId) {
            return { success: false, data: null, summary: '未指定 teamId', status: 'error' };
          }
          const resp = await fetch(`${backendUrl}/api/workflows/team/${teamId}`, { headers });
          const data = await resp.json();
          if (!resp.ok) {
            return { success: false, data, summary: data.error || `HTTP ${resp.status}`, status: 'error' };
          }
          const workflows = Array.isArray(data) ? data : [];
          return {
            success: true,
            data: { workflows },
            summary: `获取到 ${workflows.length} 个工作流`,
            status: 'success',
          };
        }

        // ── 查询执行记录 ──
        case 'status':
        case 'runs': {
          const tid = teamId || workflowId;
          if (!tid) {
            return { success: false, data: null, summary: '未指定 teamId 或 workflowId', status: 'error' };
          }
          const resp = await fetch(`${backendUrl}/api/workflows/team/${teamId}/runs`, { headers });
          const data = await resp.json();
          if (!resp.ok) {
            return { success: false, data, summary: data.error || `HTTP ${resp.status}`, status: 'error' };
          }
          return {
            success: true,
            data,
            summary: `获取到 ${Array.isArray(data) ? data.length : 0} 条执行记录`,
            status: 'success',
          };
        }

        default:
          return { success: false, data: null, summary: `未知工作流操作: ${action}`, status: 'error' };
      }
    } catch (err) {
      return { success: false, data: { error: String(err) }, summary: `workflow-engine 异常: ${String(err)}`, status: 'error' };
    }
  },
};

export default workflowEngine;

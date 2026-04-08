/** 浏览器内统一走同源 /api（Vite 代理 / nginx），以便携带 httpOnly Cookie */
export const getBackendUrl = (): string => '';

/** 流式中断时是否保留片段（历史 HTML 整页或 React 沙箱 App） */
function streamPartialLooksSalvageable(partial: string): boolean {
  if (partial.length <= 400) return false;
  const head = partial.slice(0, 4000);
  if (/<!DOCTYPE\s+html|<html[\s>]/i.test(head)) return true;
  if (/\bfunction\s+App\s*\(/.test(head) || /\bconst\s+App\s*=/.test(head)) return true;
  return false;
}

// ==================== Auth ====================

export interface VerifyPasswordResponse {
  success: boolean;
  message: string;
  token?: string;
}

export const verifyEditorPassword = async (password: string): Promise<VerifyPasswordResponse> => {
  const backendUrl = getBackendUrl();
  const url = `${backendUrl}/api/auth/verify-editor-password`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    const data: VerifyPasswordResponse = await response.json();
    return data;
  } catch (error) {
    const localPassword = import.meta.env.VITE_EDITOR_PASSWORD;
    if (localPassword && password === localPassword) {
      console.warn('[Auth] Backend unreachable, using local env fallback');
      return { success: true, message: '本地验证成功' };
    }
    console.error('Error verifying password:', error);
    throw error;
  }
};

// ==================== Workflows API ====================

export interface WorkflowStep {
  stepId?: string;
  agentId: string;
  inputFrom?: string;
}

export interface WorkflowDB {
  id: string;
  name: string;
  icon: string;
  description: string;
  steps: WorkflowStep[];
  startTime?: string | null;
  endTime?: string | null;
  scheduled: boolean;
  scheduledEnabled: boolean;
  cron?: string | null;
  persistent: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWorkflowRequest {
  name: string;
  description: string;
  steps: WorkflowStep[];
  startTime?: string;
  endTime?: string;
  scheduled?: boolean;
  scheduledEnabled?: boolean;
  cron?: string;
  persistent?: boolean;
}

export const fetchWorkflows = async (): Promise<WorkflowDB[]> => {
  const backendUrl = getBackendUrl();
  const url = `${backendUrl}/api/workflows`;

  try {
    const response = await fetch(url, { credentials: 'include' });
    if (!response.ok) {
      throw new Error(`Failed to fetch workflows: ${response.status}`);
    }
    const data: WorkflowDB[] = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching workflows:', error);
    return [];
  }
};

export const fetchWorkflowById = async (id: string): Promise<WorkflowDB> => {
  const backendUrl = getBackendUrl();
  const url = `${backendUrl}/api/workflows/${id}`;

  try {
    const response = await fetch(url, { credentials: 'include' });
    if (!response.ok) {
      throw new Error(`Failed to fetch workflow ${id}: ${response.status}`);
    }
    const data: WorkflowDB = await response.json();
    return data;
  } catch (error) {
    console.error(`Error fetching workflow ${id}:`, error);
    throw error;
  }
};

export const createWorkflow = async (workflow: CreateWorkflowRequest): Promise<WorkflowDB> => {
  const backendUrl = getBackendUrl();
  const url = `${backendUrl}/api/workflows`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(workflow),
    });

    if (!response.ok) {
      throw new Error(`Failed to create workflow: ${response.status}`);
    }
    const data: WorkflowDB = await response.json();
    return data;
  } catch (error) {
    console.error('Error creating workflow:', error);
    throw error;
  }
};

export const updateWorkflow = async (id: string, workflow: Partial<CreateWorkflowRequest>): Promise<WorkflowDB> => {
  const backendUrl = getBackendUrl();
  const url = `${backendUrl}/api/workflows/${id}`;

  try {
    const response = await fetch(url, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(workflow),
    });

    if (!response.ok) {
      throw new Error(`Failed to update workflow: ${response.status}`);
    }
    const data: WorkflowDB = await response.json();
    return data;
  } catch (error) {
    console.error('Error updating workflow:', error);
    throw error;
  }
};

export const deleteWorkflow = async (id: string): Promise<void> => {
  const backendUrl = getBackendUrl();
  const url = `${backendUrl}/api/workflows/${id}`;

  try {
    const response = await fetch(url, { method: 'DELETE', credentials: 'include' });
    if (!response.ok) {
      throw new Error(`Failed to delete workflow: ${response.status}`);
    }
  } catch (error) {
    console.error('Error deleting workflow:', error);
    throw error;
  }
};

// ==================== Assistants API ====================

export interface AssistantDB {
  id: string;
  assistantId: string;
  name: string;
  role: string;
  description: string;
  accent: string;
  systemPrompt: string;
  item: string;
  catColors: any;
  messages: string[];
  createdAt: string;
  updatedAt: string;
}

export const fetchAssistants = async (): Promise<AssistantDB[]> => {
  const backendUrl = getBackendUrl();
  const url = `${backendUrl}/api/assistants`;

  try {
    const response = await fetch(url, { credentials: 'include' });
    if (!response.ok) {
      throw new Error(`Failed to fetch assistants: ${response.status}`);
    }
    const data: AssistantDB[] = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching assistants:', error);
    return [];
  }
};

export const seedAssistants = async (assistants: any[]): Promise<any> => {
  const backendUrl = getBackendUrl();
  const url = `${backendUrl}/api/assistants/seed`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assistants }),
    });

    if (!response.ok) {
      throw new Error(`Failed to seed assistants: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error seeding assistants:', error);
    throw error;
  }
};

// ==================== AI Skills ====================

export interface DifySkillResponse {
  answer: string;
  conversationId?: string;
  error?: string;
  aiUsed?: number;
  aiQuota?: number;
}

let _currentAIModel: string = 'qwen';

export const setCurrentAIModel = (model: string) => { _currentAIModel = model; };
export const getCurrentAIModel = () => _currentAIModel;

/** 全局回调：AI 调用后自动更新用量到 AuthContext */
let _onAiUsageUpdate: ((aiUsed: number, aiQuota?: number) => void) | null = null;
export const setOnAiUsageUpdate = (cb: ((aiUsed: number, aiQuota?: number) => void) | null) => { _onAiUsageUpdate = cb; };

/** 全局获取当前登录用户邮箱 */
let _getCurrentUserEmail: (() => string | null) | null = null;
export const setGetCurrentUserEmail = (fn: (() => string | null) | null) => { _getCurrentUserEmail = fn; };
export const getCurrentUserEmail = (): string | null => _getCurrentUserEmail ? _getCurrentUserEmail() : null;

export interface AIModelInfo {
  id: string;
  name: string;
  provider: string;
  available: boolean;
}

export const fetchAIModels = async (): Promise<{ models: AIModelInfo[]; default: string }> => {
  const backendUrl = getBackendUrl();
  try {
    const response = await fetch(`${backendUrl}/api/dify/models`, { credentials: 'include' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  } catch {
    return {
      models: [
        { id: 'gemini', name: 'Gemini', provider: 'Google', available: true },
        { id: 'qwen', name: 'Qwen', provider: 'Alibaba', available: true },
      ],
      default: 'qwen',
    };
  }
};

/**
 * 流式 AI 调用：通过 SSE 逐块返回 AI 生成内容
 * @param onChunk 每收到一块文本时的回调
 * @returns 最终完整结果
 */
export const callDifySkillStream = async (
  taskId: string,
  text: string,
  model?: string,
  onChunk?: (chunk: string, accumulated: string) => void,
  options?: { systemPrompt?: string; maxTokens?: number; streamTimeoutMs?: number },
): Promise<DifySkillResponse> => {
  const backendUrl = getBackendUrl();
  const url = `${backendUrl}/api/dify/skill/stream`;
  const selectedModel = model || _currentAIModel;
  const streamTimeoutMs = options?.streamTimeoutMs ?? 120_000;
  /** 提升到 try 外：流被中断/Abort 时仍能返回已收到的片段供前端修补 HTML */
  let fullAnswer = '';

  const ac = new AbortController();
  const timeoutId = globalThis.setTimeout(() => ac.abort(), streamTimeoutMs);

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = localStorage.getItem('accessToken');
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const body: Record<string, unknown> = { taskId, text, model: selectedModel };
    if (options?.systemPrompt) body.systemPrompt = options.systemPrompt;
    if (options?.maxTokens) body.maxTokens = options.maxTokens;

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: ac.signal,
    });

    if (!response.ok) {
      globalThis.clearTimeout(timeoutId);
      const errText = await response.text().catch(() => '');
      return { answer: '', error: `HTTP ${response.status}: ${errText.slice(0, 200)}` };
    }

    const reader = response.body?.getReader();
    if (!reader) {
      globalThis.clearTimeout(timeoutId);
      return { answer: '', error: 'ReadableStream not supported' };
    }

    const decoder = new TextDecoder();
    let buffer = '';
    fullAnswer = '';
    let finalData: DifySkillResponse | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      let currentEvent = '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          currentEvent = '';
          continue;
        }
        if (trimmed.startsWith(':')) continue; // heartbeat
        if (trimmed.startsWith('event: ')) {
          currentEvent = trimmed.slice(7).trim();
          continue;
        }
        if (trimmed.startsWith('data: ')) {
          try {
            const data = JSON.parse(trimmed.slice(6));
            if (currentEvent === 'chunk' && data.text) {
              fullAnswer += data.text;
              onChunk?.(data.text, fullAnswer);
            } else if (currentEvent === 'done') {
              finalData = {
                answer: data.answer || fullAnswer,
                aiUsed: data.aiUsed,
                aiQuota: data.aiQuota,
              };
              if (finalData.aiUsed !== undefined && _onAiUsageUpdate) {
                _onAiUsageUpdate(finalData.aiUsed, finalData.aiQuota);
              }
            } else if (currentEvent === 'error') {
              globalThis.clearTimeout(timeoutId);
              const errText = data.error || 'stream error';
              const p = fullAnswer.trim();
              if (streamPartialLooksSalvageable(p)) {
                return { answer: p, aiUsed: data.aiUsed, aiQuota: data.aiQuota };
              }
              return {
                answer: fullAnswer,
                error: errText,
                aiUsed: data.aiUsed,
                aiQuota: data.aiQuota,
              };
            }
          } catch { /* skip malformed JSON */ }
        }
      }
    }

    globalThis.clearTimeout(timeoutId);
    return finalData || { answer: fullAnswer };
  } catch (error: unknown) {
    globalThis.clearTimeout(timeoutId);
    console.error(`Error streaming AI skill [${taskId}] (model=${selectedModel}):`, error);
    let errMsg = error instanceof Error ? error.message : String(error);
    const timedOut = ac.signal.aborted;
    if (error instanceof DOMException && error.name === 'AbortError') {
      errMsg = timedOut
        ? `生成超时（${Math.round(streamTimeoutMs / 1000)}s 内未完成），已尽量保留已输出片段`
        : '连接已中断或请求被取消（请勿在生成过程中关闭页面，或检查网络/代理超时设置后重试）';
    } else if (/aborted/i.test(errMsg)) {
      errMsg = timedOut
        ? `生成超时（${Math.round(streamTimeoutMs / 1000)}s），已尽量保留已输出片段`
        : '连接已中断（常见于网络波动、反向代理超时或页面切换），请重试';
    }
    const partial = fullAnswer.trim();
    if (streamPartialLooksSalvageable(partial)) {
      console.warn(
        `[skill/stream] ${taskId} 流异常但保留已生成片段（${partial.length} 字）: ${errMsg}`,
      );
      return { answer: partial };
    }
    return { answer: partial, error: errMsg };
  }
};

export const callDifySkill = async (taskId: string, text: string, model?: string): Promise<DifySkillResponse> => {
  const backendUrl = getBackendUrl();
  const url = `${backendUrl}/api/dify/skill`;
  const selectedModel = model || _currentAIModel;

  try {
    const response = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId, text, model: selectedModel }),
    });

    // 先检查 content-type，避免 504 等返回 HTML 时 json() 解析失败
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const errText = await response.text().catch(() => '');
      console.error(`[callDifySkill] Non-JSON response (${response.status}):`, errText.slice(0, 200));
      return { answer: '', error: `HTTP ${response.status} (${response.statusText || 'timeout'})` };
    }

    const data = await response.json();
    if (!response.ok) {
      const errMsg = data.message ? `${data.error}: ${data.message}` : (data.error || `HTTP ${response.status}`);
      return { answer: '', error: errMsg, aiUsed: data.aiUsed, aiQuota: data.aiQuota };
    }
    // 自动更新 AI 用量
    if (data.aiUsed !== undefined && _onAiUsageUpdate) {
      _onAiUsageUpdate(data.aiUsed, data.aiQuota);
    }
    return data;
  } catch (error) {
    console.error(`Error calling AI skill [${taskId}] (model=${selectedModel}):`, error);
    return { answer: '', error: String(error) };
  }
};

// ==================== Email ====================

export interface SendEmailRequest {
  to: string;
  subject: string;
  html?: string;
  text?: string;
}

export interface SendEmailResponse {
  success: boolean;
  messageId?: string;
  to?: string;
  subject?: string;
  error?: string;
}

export const sendEmail = async (req: SendEmailRequest): Promise<SendEmailResponse> => {
  const backendUrl = getBackendUrl();
  const url = `${backendUrl}/api/email/send`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });

    const data = await response.json();
    if (!response.ok) {
      return { success: false, error: data.error || `HTTP ${response.status}` };
    }
    return data;
  } catch (error) {
    console.error('Error sending email:', error);
    return { success: false, error: String(error) };
  }
};

// ==================== Workflow Runs API ====================

export interface WorkflowRunDB {
  id: string;
  workflowId?: string | null;
  workflowName: string;
  agentId: string;
  stepIndex: number;
  summary: string;
  result: string;
  status: string;
  executedAt: string;
  duration?: number | null;
  createdAt: string;
}

export interface CreateWorkflowRunRequest {
  workflowId?: string | null;
  workflowName: string;
  agentId: string;
  stepIndex?: number;
  summary: string;
  result: string;
  status: string;
  duration?: number | null;
  executedAt?: string;
}

export interface FetchWorkflowRunsResponse {
  runs: WorkflowRunDB[];
  total: number;
}

export const fetchWorkflowRuns = async (params?: {
  limit?: number;
  offset?: number;
  agentId?: string;
  workflowId?: string;
  status?: string;
}): Promise<FetchWorkflowRunsResponse> => {
  const backendUrl = getBackendUrl();
  const query = new URLSearchParams();
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.offset) query.set('offset', String(params.offset));
  if (params?.agentId) query.set('agentId', params.agentId);
  if (params?.workflowId) query.set('workflowId', params.workflowId);
  if (params?.status) query.set('status', params.status);
  const url = `${backendUrl}/api/workflow-runs?${query.toString()}`;

  try {
    const response = await fetch(url, { credentials: 'include' });
    if (!response.ok) {
      throw new Error(`Failed to fetch workflow runs: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching workflow runs:', error);
    return { runs: [], total: 0 };
  }
};

export const createWorkflowRun = async (run: CreateWorkflowRunRequest): Promise<WorkflowRunDB | null> => {
  const backendUrl = getBackendUrl();
  const url = `${backendUrl}/api/workflow-runs`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(run),
    });
    if (!response.ok) {
      throw new Error(`Failed to create workflow run: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error creating workflow run:', error);
    return null;
  }
};

export const batchCreateWorkflowRuns = async (runs: CreateWorkflowRunRequest[]): Promise<number> => {
  const backendUrl = getBackendUrl();
  const url = `${backendUrl}/api/workflow-runs/batch`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runs }),
    });
    if (!response.ok) {
      throw new Error(`Failed to batch create workflow runs: ${response.status}`);
    }
    const data = await response.json();
    return data.count;
  } catch (error) {
    console.error('Error batch creating workflow runs:', error);
    return 0;
  }
};

// ==================== Workbench Run Update (for landing page editor) ====================

export interface UpdateWorkflowRunRequest {
  status?: string;
  steps?: unknown;
  completedAt?: string;
  totalDuration?: number | null;
}

export const updateWorkflowRun = async (
  runId: string,
  payload: UpdateWorkflowRunRequest,
): Promise<any> => {
  const backendUrl = getBackendUrl();
  const url = `${backendUrl}/api/workflows/runs/${encodeURIComponent(runId)}`;

  const response = await fetch(url, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Failed to update workflow run: HTTP ${response.status} ${text.slice(0, 200)}`);
  }
  return response.json().catch(() => ({}));
};

// ==================== Uploads ====================

export interface UploadImageResponse {
  url: string;
}

export const uploadImage = async (args: {
  file: File;
  runId?: string;
}): Promise<UploadImageResponse> => {
  const backendUrl = getBackendUrl();
  const url = `${backendUrl}/api/uploads/image`;

  const form = new FormData();
  form.append("image", args.file);
  if (args.runId) form.append("runId", args.runId);

  const response = await fetch(url, {
    method: "POST",
    credentials: "include",
    body: form,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Failed to upload image: HTTP ${response.status} ${text.slice(0, 200)}`);
  }
  return response.json();
};

// ==================== Articles & Crafts (simplified stubs) ====================

export const fetchArticles = async (): Promise<any[]> => {
  const backendUrl = getBackendUrl();
  try {
    const response = await fetch(`${backendUrl}/api/articles`, { credentials: 'include' });
    if (!response.ok) return [];
    return await response.json();
  } catch {
    return [];
  }
};

export const fetchCrafts = async (): Promise<any[]> => {
  const backendUrl = getBackendUrl();
  try {
    const response = await fetch(`${backendUrl}/api/crafts`, { credentials: 'include' });
    if (!response.ok) return [];
    return await response.json();
  } catch {
    return [];
  }
};

// Explicit re-exports for TS consumers (editor / lint tool stability)
export { updateWorkflowRun, uploadImage };

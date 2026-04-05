const getBackendUrl = (): string => {
  if (import.meta.env.VITE_BACKEND_URL) {
    return import.meta.env.VITE_BACKEND_URL;
  }
  if (import.meta.env.PROD) {
    return '';
  }
  return 'http://localhost:8002';
};

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
    const response = await fetch(url);
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
    const response = await fetch(url);
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
    const response = await fetch(url, { method: 'DELETE' });
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
    const response = await fetch(url);
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
    const response = await fetch(`${backendUrl}/api/dify/models`);
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
  options?: { systemPrompt?: string; maxTokens?: number },
): Promise<DifySkillResponse> => {
  const backendUrl = getBackendUrl();
  const url = `${backendUrl}/api/dify/skill/stream`;
  const selectedModel = model || _currentAIModel;

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
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      return { answer: '', error: `HTTP ${response.status}: ${errText.slice(0, 200)}` };
    }

    const reader = response.body?.getReader();
    if (!reader) {
      return { answer: '', error: 'ReadableStream not supported' };
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let fullAnswer = '';
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
              return { answer: fullAnswer, error: data.error, aiUsed: data.aiUsed, aiQuota: data.aiQuota };
            }
          } catch { /* skip malformed JSON */ }
        }
      }
    }

    return finalData || { answer: fullAnswer };
  } catch (error) {
    console.error(`Error streaming AI skill [${taskId}] (model=${selectedModel}):`, error);
    return { answer: '', error: String(error) };
  }
};

export const callDifySkill = async (taskId: string, text: string, model?: string): Promise<DifySkillResponse> => {
  const backendUrl = getBackendUrl();
  const url = `${backendUrl}/api/dify/skill`;
  const selectedModel = model || _currentAIModel;

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = localStorage.getItem('accessToken');
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(url, {
      method: 'POST',
      headers,
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
    const response = await fetch(url);
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

// ==================== Articles & Crafts (simplified stubs) ====================

export const fetchArticles = async (): Promise<any[]> => {
  const backendUrl = getBackendUrl();
  try {
    const response = await fetch(`${backendUrl}/api/articles`);
    if (!response.ok) return [];
    return await response.json();
  } catch {
    return [];
  }
};

export const fetchCrafts = async (): Promise<any[]> => {
  const backendUrl = getBackendUrl();
  try {
    const response = await fetch(`${backendUrl}/api/crafts`);
    if (!response.ok) return [];
    return await response.json();
  } catch {
    return [];
  }
};

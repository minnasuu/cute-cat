/**
 * 后端连接的少量「特化」入口。
 *
 * 模块定位:
 *   - apiClient 是唯一通用 HTTP 层(token 刷新 / 502 归一 / Toast);
 *   - 本文件只保留 apiClient 语义覆盖不到的「特例」:
 *       1. Dify SSE 流式(需裸 Response + 中断保留片段)
 *       2. 当前选择的 AI 模型(模块级可变状态)
 *       3. 全局副作用回调(AI 用量更新 / 当前用户邮箱,由 AuthContext 注入)
 *
 * 工作流 / 助手 / 邮件 / 上传 / 文章 等资源型 CRUD 已全部迁移到 apiClient + teamApi,
 * 不再在此处保留手写 fetch。
 */

import { apiClient } from './apiClient';

// ==================== 模块级可变状态(AI 模型选择) ====================

let _currentAIModel = 'glm';

export const setCurrentAIModel = (model: string) => { _currentAIModel = model; };
export const getCurrentAIModel = () => _currentAIModel;

// ==================== 全局副作用回调 ====================

/** 流式 / 非流式 AI 调用后自动更新用量到 AuthContext */
let _onAiUsageUpdate: ((aiUsed: number, aiQuota?: number) => void) | null = null;
export const setOnAiUsageUpdate = (cb: ((aiUsed: number, aiQuota?: number) => void) | null) => {
  _onAiUsageUpdate = cb;
};

/** 全局获取当前登录用户邮箱(供 Dify 后端的 user 标识) */
let _getCurrentUserEmail: (() => string | null) | null = null;
export const setGetCurrentUserEmail = (fn: (() => string | null) | null) => { _getCurrentUserEmail = fn; };
export const getCurrentUserEmail = (): string | null => (_getCurrentUserEmail ? _getCurrentUserEmail() : null);

// ==================== Dify 技能响应类型 ====================

export interface DifySkillResponse {
  answer: string;
  conversationId?: string;
  error?: string;
  aiUsed?: number;
  aiQuota?: number;
}

// ==================== 内部辅助 ====================

/** 流式中断时是否保留片段(历史 HTML 整页或 React 沙箱 App) */
function streamPartialLooksSalvageable(partial: string): boolean {
  if (partial.length <= 400) return false;
  const head = partial.slice(0, 4000);
  if (/<!DOCTYPE\s+html|<html[\s>]/i.test(head)) return true;
  if (/\bfunction\s+App\s*\(/.test(head) || /\bconst\s+App\s*=/.test(head)) return true;
  return false;
}

// ==================== Dify 流式 AI 调用 ====================

export interface CallDifyStreamOptions {
  systemPrompt?: string;
  maxTokens?: number;
  streamTimeoutMs?: number;
}

/**
 * 流式 AI 调用:通过 SSE 逐块返回 AI 生成内容。
 *
 * 仍保留手写 SSE 解析,因为需要:
 *   - 裸 Response 以逐块读取 ReadableStream;
 *   - 中断/超时时保留已收到的流式片段(streamPartialLooksSalvageable);
 *   - 通过 localStorage.accessToken 透传 Bearer(与 apiClient 的 cookie 双轨)。
 *
 * 401 刷新 / 网络错误归一已下沉到 apiClient.raw。
 */
export const callDifySkillStream = async (
  taskId: string,
  text: string,
  model?: string,
  onChunk?: (chunk: string, accumulated: string) => void,
  options?: CallDifyStreamOptions,
): Promise<DifySkillResponse> => {
  const url = '/api/dify/skill/stream';
  const selectedModel = model || _currentAIModel;
  const streamTimeoutMs = options?.streamTimeoutMs ?? 120_000;
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

    // apiClient.raw:享受 401 自动刷新,返回裸 Response 供流式读取
    const response = await apiClient.raw(url, {
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
          } catch {
            /* skip malformed JSON */
          }
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

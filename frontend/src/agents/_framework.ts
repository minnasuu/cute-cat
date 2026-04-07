import type { AgentContext, AgentResult } from './types';
import { callDifySkillStream } from '../utils/backendClient';

/**
 * Agent 执行框架：
 * - extractUpstreamText: 从 ctx.input 提取上游文本
 * - runWithAI: 真实 AI 流式调用（callDifySkillStream + 重试 + 超时）
 */

/**
 * 从 ctx.input 提取上游文本（已统一为 string）
 */
export function extractUpstreamText(ctx: AgentContext): string {
  return ctx.input || '';
}

/** 流式报错时是否值得保留片段（如前端工程师 HTML） */
function streamAnswerLooksSalvageable(text: string): boolean {
  const t = text.trim();
  if (t.length < 400) return false;
  const head = t.slice(0, 8000);
  return /<!DOCTYPE\s+html|<html[\s>]/i.test(head);
}

/**
 * 真实 AI 流式调用辅助
 * @param agentId 猫咪 agentId
 * @param ctx AgentContext
 * @param systemPrompt 系统提示词
 * @param options 可选配置
 */
export async function runWithAI(
  agentId: string,
  ctx: AgentContext,
  systemPrompt: string,
  options: {
    _resultType?: string;
    maxTokens?: number;
    onChunk?: (chunk: string, accumulated: string) => void;
    /** 单次请求超时（ms），大 HTML 生成可加长 */
    timeoutMs?: number;
    /** 额外重试次数，共 1 + maxExtraRetries 次 */
    maxExtraRetries?: number;
  } = {},
): Promise<AgentResult> {
  const upstreamText = extractUpstreamText(ctx);

  const timeoutMs = options.timeoutMs ?? 120_000;
  const maxExtraRetries = options.maxExtraRetries ?? 2;

  console.log(
    `[agent:ai] ${agentId} inputLen=${upstreamText.length}${options.maxTokens ? ` maxTokens=${options.maxTokens}` : ''} timeoutMs=${timeoutMs}`,
  );

  // user text 只包含上游输入，systemPrompt 作为独立参数传递给后端
  const userText = upstreamText || '请执行任务';

  let lastResult!: AgentResult;

  for (let attempt = 0; attempt <= maxExtraRetries; attempt++) {
    try {
      // 超时在 callDifySkillStream 内用 AbortSignal 触发，便于在 catch 里带上已收到的流式片段
      const resp = await callDifySkillStream(
        'ai-chat',
        userText,
        'qwen',
        options.onChunk,
        {
          systemPrompt,
          maxTokens: options.maxTokens,
          streamTimeoutMs: timeoutMs,
        },
      );

      if (resp.error) {
        const salvage = (resp.answer || '').trim();
        if (streamAnswerLooksSalvageable(salvage)) {
          const data: { text: string; [key: string]: unknown } = { text: salvage };
          if (options._resultType) data._resultType = options._resultType;
          return {
            success: true,
            data,
            summary: `流式结束异常（${resp.error}），已保留已生成 HTML 片段（${salvage.length} 字）并将尝试修补`,
            status: 'warning',
          };
        }
        lastResult = {
          success: false,
          data: { text: '' },
          summary: `AI 调用失败: ${resp.error}`,
          status: 'error',
        };
      } else {
        const text = resp.answer || '';
        const data: { text: string; [key: string]: unknown } = { text };
        if (options._resultType) data._resultType = options._resultType;

        return {
          success: true,
          data,
          summary: text.length > 300 ? text.slice(0, 300) + '…' : text,
          status: 'success',
        };
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const isTimeout = msg === '请求超时';
      console.warn(`[agent:ai] ${agentId} 第 ${attempt + 1} 次${isTimeout ? '超时' : '失败'}: ${msg}`);
      lastResult = {
        success: false,
        data: { text: '' },
        summary: `[${agentId}] AI ${isTimeout ? '超时' : '失败'}: ${msg}`,
        status: 'error',
      };
      if (attempt < maxExtraRetries) continue;
    }
    if (lastResult && !lastResult.success && !/超时/.test(lastResult.summary || '')) break;
  }

  return lastResult;
}

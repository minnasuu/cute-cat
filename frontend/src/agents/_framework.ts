import type { AgentContext, AgentResult } from './types';
import { callDifySkill } from '../utils/backendClient';

/**
 * Agent 执行框架：
 * - extractUpstreamText: 从 ctx.input 提取上游文本
 * - runWithAI: 真实 AI 调用（直调 callDifySkill + 重试 + 超时）
 */

/**
 * 从 ctx.input 提取上游文本（已统一为 string）
 */
export function extractUpstreamText(ctx: AgentContext): string {
  return ctx.input || '';
}

/**
 * 真实 AI 调用辅助
 * @param agentId 猫咪 agentId
 * @param ctx AgentContext
 * @param systemPrompt 系统提示词
 * @param options 可选配置
 */
export async function runWithAI(
  agentId: string,
  ctx: AgentContext,
  systemPrompt: string,
  options: { _resultType?: string } = {},
): Promise<AgentResult> {
  const upstreamText = extractUpstreamText(ctx);

  console.log(`[agent:ai] ${agentId} inputLen=${upstreamText.length}`);

  // 拼装 prompt：systemPrompt + 上游文本
  const prompt = systemPrompt
    ? `${systemPrompt}\n\n---\n\n${upstreamText || '请执行任务'}`
    : upstreamText || '请执行任务';

  const MAX_RETRIES = 2;
  const TIMEOUT_MS = 60_000;

  let lastResult!: AgentResult;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const resultPromise = callDifySkill('ai-chat', prompt, 'qwen');

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('请求超时')), TIMEOUT_MS)
      );

      const resp = await Promise.race([resultPromise, timeoutPromise]);

      if (resp.error) {
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
      if (attempt < MAX_RETRIES) continue;
    }
    if (lastResult && !lastResult.success && !/超时/.test(lastResult.summary || '')) break;
  }

  return lastResult;
}

import type { SkillContext, SkillResult } from '../types';
import { executePrimitive } from '../primitives';

/**
 * 官方猫 AIGC 步骤框架：
 * - runPlaceholder: 占位（不调模型）
 * - runWithAI: 真实 AI 调用辅助（封装 executePrimitive + 重试 + 超时）
 */

export function runPlaceholder(templateId: string, ctx: SkillContext): Promise<SkillResult> {
  const input = ctx.input as Record<string, unknown> | undefined;
  const merged = input && typeof input === 'object' ? input : {};
  const hasUpstreamText = Boolean(merged.text);
  const hasUpstreamSummary = Boolean(merged.summary);

  console.log(
    '[cat-step]',
    JSON.stringify({
      templateId,
      catName: ctx.catName ?? '',
      role: ctx.catRole ?? '',
      agentId: ctx.agentId,
      skillId: 'aigc',
      hasUpstreamText,
      hasUpstreamSummary,
      workflowName: ctx.workflowName ?? '',
      exec: 'placeholder',
    })
  );

  return Promise.resolve({
    success: true,
    data: { text: '' },
    summary: `[${templateId}] 前端脚本框架已执行（输出留空，待接入）`,
    status: 'success',
  });
}

/**
 * 从 ctx.input 提取上游文本
 */
export function extractUpstreamText(ctx: SkillContext): string {
  const input = ctx.input as Record<string, unknown> | string | undefined;
  if (typeof input === 'string') return input;
  if (input && typeof input === 'object') {
    const parts: string[] = [];
    if (input.text) parts.push(String(input.text));
    if (input.summary) parts.push(String(input.summary));
    if (input.notes) parts.push(String(input.notes));
    if (parts.length > 0) return parts.join('\n\n');
    // 排除内部字段后序列化
    const rest = Object.entries(input).filter(
      ([k]) => !['_action', '_params', '_attendees', '_mock'].includes(k)
    );
    if (rest.length > 0) return JSON.stringify(Object.fromEntries(rest), null, 2);
  }
  return '';
}

/**
 * 真实 AI 调用辅助
 * @param templateId 猫模板ID
 * @param ctx SkillContext
 * @param systemPrompt 系统提示词
 * @param options 可选配置
 */
export async function runWithAI(
  templateId: string,
  ctx: SkillContext,
  systemPrompt: string,
  options: { _resultType?: string } = {},
): Promise<SkillResult> {
  const upstreamText = extractUpstreamText(ctx);

  console.log(`[cat-step:ai] ${templateId} agent=${ctx.agentId} inputLen=${upstreamText.length}`);

  const enrichedCtx: SkillContext = {
    ...ctx,
    input: upstreamText || ctx.input,
  };

  const MAX_RETRIES = 2;
  const TIMEOUT_MS = 60_000;

  let lastResult!: SkillResult;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const resultPromise = executePrimitive('text-to-text', enrichedCtx, {
        difySkillId: 'ai-chat',
        model: 'qwen',
        systemPrompt,
      });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('请求超时')), TIMEOUT_MS)
      );

      const result = await Promise.race([resultPromise, timeoutPromise]);

      if (result.success) {
        const text = (result.data as Record<string, unknown>)?.text as string || result.summary || '';
        const data: Record<string, unknown> = { text };
        if (options._resultType) data._resultType = options._resultType;

        return {
          success: true,
          data,
          summary: text.length > 300 ? text.slice(0, 300) + '…' : text,
          status: 'success',
        };
      }
      lastResult = result;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const isTimeout = msg === '请求超时';
      console.warn(`[cat-step:ai] ${templateId} 第 ${attempt + 1} 次${isTimeout ? '超时' : '失败'}: ${msg}`);
      lastResult = {
        success: false,
        data: { text: '' },
        summary: `[${templateId}] AI ${isTimeout ? '超时' : '失败'}: ${msg}`,
        status: 'error',
      };
      if (attempt < MAX_RETRIES) continue;
    }
    if (lastResult && !lastResult.success && !/超时/.test(lastResult.summary || '')) break;
  }

  return lastResult;
}

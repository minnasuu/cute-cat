import type { SkillHandler, SkillContext, SkillResult } from './types';
import { executePrimitive } from './primitives';

/** 💬 AI 对话 — CAT（默认猫猫）
 *  基于原型: text-to-text
 *  通用文生文技能，可处理总结、分析、翻译、改写等文本任务。
 *  工作流执行时，每个步骤的 action 会作为 _action 字段注入 input。
 */
const aiChat: SkillHandler = {
  id: 'ai-chat',
  async execute(ctx: SkillContext): Promise<SkillResult> {
    console.log(`[ai-chat] agent=${ctx.agentId} @${ctx.timestamp}`);

    // 从 input 中提取步骤任务指令（_action）和上游数据
    let action = '';
    let upstreamText = '';
    const input = ctx.input as Record<string, unknown> | string | undefined;

    if (typeof input === 'string') {
      upstreamText = input;
    } else if (input && typeof input === 'object') {
      // _action 是工作流引擎注入的当前步骤任务描述
      action = (input._action as string) || '';
      // 收集上游步骤的实际输出内容
      const parts: string[] = [];
      if (input.text) parts.push(String(input.text));
      if (input.summary) parts.push(String(input.summary));
      if (input.analysis) parts.push(String(input.analysis));
      if (input.notes) parts.push(String(input.notes));
      // 排除内部字段后，如果还有其他数据也带上
      const rest = Object.entries(input).filter(
        ([k]) => !['_action', '_params', 'text', 'summary', 'analysis', 'notes', 'conversationId', '_mock'].includes(k)
      );
      if (parts.length === 0 && rest.length > 0) {
        parts.push(JSON.stringify(Object.fromEntries(rest), null, 2));
      }
      upstreamText = parts.join('\n\n');
    }

    // 构建 systemPrompt：基础身份 + 当前步骤的具体任务
    const basePrompt = '你是一只友善的猫猫助手 CAT，团队的万能基础成员。';
    const taskPrompt = action
      ? `当前任务：${action}\n请围绕以上任务要求完成工作，用简洁清晰的中文回答。`
      : '请根据用户输入完成对应的文本任务（总结、分析、翻译、改写等）。用简洁清晰的中文回答。';
    const systemPrompt = `${basePrompt}\n${taskPrompt}`;

    // 将上游数据作为 input 传给原型
    const enrichedCtx: SkillContext = {
      ...ctx,
      input: upstreamText || (action ? action : ctx.input),
    };

    const MAX_RETRIES = 2;
    const TIMEOUT_MS = 30_000;

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
          return { success: result.success, data: result.data, summary: result.summary, status: result.status };
        }
        lastResult = result;
      } catch (err: any) {
        const isTimeout = err?.message === '请求超时';
        console.warn(`[ai-chat] 第 ${attempt + 1} 次${isTimeout ? '超时' : '失败'}: ${err?.message}`);
        lastResult = { success: false, data: null, summary: `AI 对话${isTimeout ? '超时' : '失败'}: ${err?.message}`, status: 'error' as const };
        if (attempt < MAX_RETRIES) continue;
      }
      // 非超时的失败不重试
      if (lastResult && !lastResult.success && !/超时/.test(lastResult.summary || '')) break;
    }

    return lastResult;
  },
};

export default aiChat;

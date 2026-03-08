import type { SkillHandler, SkillContext, SkillResult } from './types';
import { executePrimitive } from './primitives';

/** 💬 AI 对话 — CAT（默认猫猫）
 *  基于原型: text-to-text
 *  通用文生文技能，可处理总结、分析、翻译、改写等文本任务。
 */
const aiChat: SkillHandler = {
  id: 'ai-chat',
  async execute(ctx: SkillContext): Promise<SkillResult> {
    console.log(`[ai-chat] agent=${ctx.agentId} @${ctx.timestamp}`);

    const result = await executePrimitive('text-to-text', ctx, {
      difySkillId: 'ai-chat',
      model: 'qwen',
      systemPrompt: '你是一只友善的猫猫助手 CAT，请根据用户输入完成对应的文本任务（总结、分析、翻译、改写等）。用简洁清晰的中文回答。',
    });

    return {
      success: result.success,
      data: result.data,
      summary: result.summary,
      status: result.status,
    };
  },
};

export default aiChat;

import type { PrimitiveHandler, PrimitiveContext, PrimitiveResult } from './types';
import { callDifySkill } from '../../utils/backendClient';

/**
 * 文生文原型 (text-to-text)
 *
 * 底层能力：接收文本输入 + system prompt 配置，调用 LLM 返回文本。
 * 上层技能示例：文章生成、内容润色、大纲生成、资讯摘要、会议纪要等。
 */
const textToText: PrimitiveHandler = {
  id: 'text-to-text',
  async execute(ctx: PrimitiveContext): Promise<PrimitiveResult> {
    console.log(`[primitive:text-to-text] agent=${ctx.agentId} @${ctx.timestamp}`);

    const {
      systemPrompt = '',
      difySkillId = '',
      outputFormat = 'text',
      model = '',
    } = ctx.config as Record<string, string>;

    // 拼装输入文本
    let inputText = '';
    if (typeof ctx.input === 'string') {
      inputText = ctx.input;
    } else if (ctx.input && typeof ctx.input === 'object') {
      const obj = ctx.input as Record<string, unknown>;
      inputText = (obj.text as string)
        || (obj.notes as string)
        || (obj.summary as string)
        || (obj.analysis as string)
        || JSON.stringify(obj, null, 2);
    }

    if (!inputText && !systemPrompt) {
      return {
        success: false, data: null,
        summary: '无输入文本，跳过执行',
        status: 'warning',
      };
    }

    const prompt = systemPrompt
      ? `${systemPrompt}\n\n---\n\n${inputText}`
      : inputText;

    try {
      // 优先走 Dify，若未配置 difySkillId 则返回 mock
      if (difySkillId) {
        const resp = await callDifySkill(difySkillId, prompt, model || undefined);
        if (resp.error) {
          return { success: false, data: { error: resp.error }, summary: `LLM 调用失败: ${resp.error}`, status: 'error' };
        }
        return {
          success: true,
          data: { text: resp.answer, conversationId: resp.conversationId },
          summary: resp.answer,
          status: 'success',
        };
      }

      // 无 difySkillId 时返回骨架结果（后续接入 Gemini SDK 等）
      return {
        success: true,
        data: { text: '', _mock: true },
        summary: `[mock] text-to-text 原型已调用，输出格式: ${outputFormat}`,
        status: 'success',
      };
    } catch (err) {
      return { success: false, data: { error: String(err) }, summary: `text-to-text 异常: ${String(err)}`, status: 'error' };
    }
  },
};

export default textToText;

import type { PrimitiveHandler, PrimitiveContext, PrimitiveResult } from './types';
import { callDifySkill } from '../../utils/backendClient';

/**
 * 结构化输出原型 (structured-output)
 *
 * 底层能力：接收文本输入，要求 LLM 以 JSON 格式返回结构化数据。
 * 上层技能示例：大纲生成、代办清单、趋势分析输出等。
 */
const structuredOutput: PrimitiveHandler = {
  id: 'structured-output',
  async execute(ctx: PrimitiveContext): Promise<PrimitiveResult> {
    console.log(`[primitive:structured-output] agent=${ctx.agentId} @${ctx.timestamp}`);

    const {
      difySkillId = '',
      schema = '',
      systemPrompt = '',
    } = ctx.config as Record<string, string>;

    let inputText = '';
    if (typeof ctx.input === 'string') {
      inputText = ctx.input;
    } else if (ctx.input && typeof ctx.input === 'object') {
      inputText = JSON.stringify(ctx.input, null, 2);
    }

    const prompt = [
      systemPrompt,
      schema ? `请严格按以下 JSON Schema 输出：\n${schema}` : '',
      inputText,
    ].filter(Boolean).join('\n\n');

    try {
      if (difySkillId) {
        const resp = await callDifySkill(difySkillId, prompt);
        if (resp.error) {
          return { success: false, data: { error: resp.error }, summary: `结构化输出失败: ${resp.error}`, status: 'error' };
        }
        // 尝试解析 JSON
        let parsed: unknown = resp.answer;
        try {
          let json = resp.answer.trim();
          const m = json.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
          if (m) json = m[1].trim();
          parsed = JSON.parse(json);
        } catch { /* 保留原始文本 */ }

        return {
          success: true,
          data: { result: parsed, conversationId: resp.conversationId },
          summary: typeof parsed === 'string' ? parsed : JSON.stringify(parsed),
          status: 'success',
        };
      }

      return {
        success: true,
        data: { result: null, _mock: true },
        summary: '[mock] structured-output 原型已调用',
        status: 'success',
      };
    } catch (err) {
      return { success: false, data: { error: String(err) }, summary: `structured-output 异常: ${String(err)}`, status: 'error' };
    }
  },
};

export default structuredOutput;

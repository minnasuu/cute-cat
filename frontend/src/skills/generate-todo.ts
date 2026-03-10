import type { SkillHandler, SkillContext, SkillResult } from './types';
import { executePrimitive } from './primitives';

/** 📋 生成代办清单 — 花椒
 *  基于原型: structured-output
 *  从上游输入中提取诊断数据，调用 LLM 生成结构化代办清单。
 */
const generateTodo: SkillHandler = {
  id: 'generate-todo',
  async execute(ctx: SkillContext): Promise<SkillResult> {
    console.log(`[generate-todo] agent=${ctx.agentId} @${ctx.timestamp}`);

    // 从上游输入中提取诊断数据（来自 task-log + site-analyze）
    const input = ctx.input as Record<string, unknown> | string | undefined;
    let text = '';

    if (typeof input === 'string') {
      text = input;
    } else if (input && typeof input === 'object') {
      const analysis = (input.analysis as string) || '';
      const summary = (input.summary as string) || '';
      const currentArticles = (input.currentArticles as string[]) || [];
      const currentCrafts = (input.currentCrafts as string[]) || [];

      const parts: string[] = [];
      if (currentArticles.length > 0) {
        parts.push(`现有文章：${currentArticles.map(t => `《${t}》`).join('、')}`);
      }
      if (currentCrafts.length > 0) {
        parts.push(`现有crafts：${currentCrafts.join('、')}`);
      }
      if (analysis) {
        parts.push(`诊断结论：${analysis}`);
      }
      if (summary) {
        parts.push(`产出统计：${summary}`);
      }

      text = parts.length > 0 ? parts.join('。') : JSON.stringify(input, null, 2);
    }

    if (!text) {
      text = '请根据个站现状生成下周代办清单，包含文章选题、Crafts 计划、功能扩展三类。';
    }

    const enrichedCtx: SkillContext = { ...ctx, input: text };

    const result = await executePrimitive('structured-output', enrichedCtx, {
      systemPrompt: '你是一位项目经理猫猫。请根据以下网站诊断和产出统计信息，生成下周代办清单。清单应包含文章选题、Crafts 计划、功能扩展三大类。每个条目包含 category、title、description 字段。输出 JSON 数组格式。',
      difySkillId: 'generate-todo',
      schema: '[{ "category": "文章|Crafts|功能扩展", "title": "string", "description": "string" }]',
    });

    // 将 structured-output 的结果适配为 generate-todo 的格式
    if (result.success && result.data) {
      const data = result.data as Record<string, unknown>;
      return {
        success: true,
        data: {
          todos: typeof data.result === 'string' ? data.result : JSON.stringify(data.result, null, 2),
          conversationId: data.conversationId,
        },
        summary: result.summary,
        status: result.status,
      };
    }

    return { success: result.success, data: result.data, summary: result.summary, status: result.status };
  },
};

export default generateTodo;

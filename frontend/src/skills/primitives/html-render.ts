import type { PrimitiveHandler, PrimitiveContext, PrimitiveResult } from './types';
import { callDifySkill } from '../../utils/backendClient';

/**
 * HTML 模板渲染原型 (html-render)
 *
 * 底层能力：
 *   1. 模板模式：将数据注入 HTML 模板，输出渲染后的页面片段
 *   2. 生成模式：通过 LLM 生成 HTML/React 组件代码
 * 上层技能示例：排版布局、组件生成、Crafts 更新、CSS 样式生成等。
 */
const htmlRender: PrimitiveHandler = {
  id: 'html-render',
  async execute(ctx: PrimitiveContext): Promise<PrimitiveResult> {
    console.log(`[primitive:html-render] agent=${ctx.agentId} @${ctx.timestamp}`);

    const {
      templateId = '',
      outputType = 'html',
      mode = 'generate',
      difySkillId = '',
      systemPrompt = '',
      template = '',
    } = ctx.config as Record<string, string>;

    // 提取输入
    let inputText = '';
    let inputData: Record<string, unknown> = {};
    if (typeof ctx.input === 'string') {
      inputText = ctx.input;
    } else if (ctx.input && typeof ctx.input === 'object') {
      inputData = ctx.input as Record<string, unknown>;
      inputText = (inputData.text as string) || (inputData.description as string) || JSON.stringify(inputData, null, 2);
    }

    try {
      // ── 模板注入模式 ──
      if (mode === 'template' && template) {
        const rendered = renderTemplate(template, inputData);
        return {
          success: true,
          data: { html: rendered, mode: 'template', templateId },
          summary: `模板渲染完成 (${rendered.length} 字符)`,
          status: 'success',
        };
      }

      // ── LLM 生成模式 ──
      if (difySkillId) {
        const defaultSystemPrompt = outputType === 'html'
          ? '你是一个前端组件专家。根据用户描述生成完整的 HTML 代码，包含内联 CSS 样式。只输出代码，不要解释。'
          : '你是一个 React 组件专家。根据用户描述生成完整的 React 组件代码。只输出代码，不要解释。';

        const prompt = [
          systemPrompt || defaultSystemPrompt,
          `输出格式: ${outputType}`,
          templateId ? `模板参考: ${templateId}` : '',
          `\n用户需求:\n${inputText}`,
        ].filter(Boolean).join('\n');

        const resp = await callDifySkill(difySkillId, prompt);
        if (resp.error) {
          return { success: false, data: { error: resp.error }, summary: `HTML 生成失败: ${resp.error}`, status: 'error' };
        }

        // 提取代码块
        const codeMatch = resp.answer.match(/```(?:html|jsx|tsx|vue|css)?\s*\n?([\s\S]*?)\n?```/);
        const code = codeMatch ? codeMatch[1].trim() : resp.answer;

        return {
          success: true,
          data: { html: code, raw: resp.answer, outputType, conversationId: resp.conversationId },
          summary: `${outputType.toUpperCase()} 代码已生成 (${code.length} 字符)`,
          status: 'success',
        };
      }

      // ── 兜底 mock ──
      return {
        success: true,
        data: { html: '', templateId, outputType, _mock: true },
        summary: `[mock] html-render 原型已调用 → template: ${templateId || 'default'}`,
        status: 'success',
      };
    } catch (err) {
      return { success: false, data: { error: String(err) }, summary: `html-render 异常: ${String(err)}`, status: 'error' };
    }
  },
};

/** 简易模板引擎：将 {{key}} 替换为 data[key] */
function renderTemplate(tpl: string, data: Record<string, unknown>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = data[key];
    if (val === undefined || val === null) return '';
    return typeof val === 'string' ? val : JSON.stringify(val);
  });
}

export default htmlRender;

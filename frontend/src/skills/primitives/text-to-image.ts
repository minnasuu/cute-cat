import type { PrimitiveHandler, PrimitiveContext, PrimitiveResult } from './types';
import { callDifySkill } from '../../utils/backendClient';

/**
 * 文生图原型 (text-to-image)
 *
 * 底层能力：接收文本描述 + 风格配置，调用 AI 模型生成图片。
 * 策略：通过 Dify skill 调用后端 Gemini/其他模型生成图片 URL。
 * 上层技能示例：AI 绘图等。
 */
const textToImage: PrimitiveHandler = {
  id: 'text-to-image',
  async execute(ctx: PrimitiveContext): Promise<PrimitiveResult> {
    console.log(`[primitive:text-to-image] agent=${ctx.agentId} @${ctx.timestamp}`);

    const {
      style = 'default',
      size = '1024x1024',
      model = 'qwen',
      difySkillId = 'text-to-image',
      aspectRatio = '1:1',
    } = ctx.config as Record<string, string>;

    let prompt = '';
    if (typeof ctx.input === 'string') {
      prompt = ctx.input;
    } else if (ctx.input && typeof ctx.input === 'object') {
      const obj = ctx.input as Record<string, unknown>;
      prompt = (obj.prompt as string) || (obj.text as string) || JSON.stringify(obj);
    }

    if (!prompt) {
      return { success: false, data: null, summary: '无图片描述输入', status: 'warning' };
    }

    // 将风格和尺寸信息附加到 prompt
    const fullPrompt = [
      prompt,
      style !== 'default' ? `风格: ${style}` : '',
      `宽高比: ${aspectRatio}`,
      `尺寸: ${size}`,
    ].filter(Boolean).join('\n');

    try {
      const resp = await callDifySkill(difySkillId, fullPrompt, model);
      if (resp.error) {
        return { success: false, data: { error: resp.error }, summary: `图片生成失败: ${resp.error}`, status: 'error' };
      }

      // 尝试从返回内容中提取图片 URL
      const urlMatch = resp.answer.match(/https?:\/\/[^\s"'<>]+\.(?:png|jpg|jpeg|gif|webp|svg)[^\s"'<>]*/i)
        || resp.answer.match(/https?:\/\/[^\s"'<>]+/);
      const imageUrl = urlMatch ? urlMatch[0] : '';

      return {
        success: true,
        data: {
          imageUrl,
          text: resp.answer,
          prompt,
          style,
          size,
          model,
          conversationId: resp.conversationId,
        },
        summary: imageUrl ? `图片已生成: ${imageUrl}` : resp.answer,
        status: 'success',
      };
    } catch (err) {
      return { success: false, data: { error: String(err) }, summary: `text-to-image 异常: ${String(err)}`, status: 'error' };
    }
  },
};

export default textToImage;

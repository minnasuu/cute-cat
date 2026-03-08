import type { PrimitiveHandler, PrimitiveContext, PrimitiveResult } from './types';

/**
 * 文生图原型 (text-to-image)
 *
 * 底层能力：接收文本描述 + 风格配置，调用图片生成模型返回图片 URL。
 * 上层技能示例：AI 绘图、图片增强等。
 */
const textToImage: PrimitiveHandler = {
  id: 'text-to-image',
  async execute(ctx: PrimitiveContext): Promise<PrimitiveResult> {
    console.log(`[primitive:text-to-image] agent=${ctx.agentId} @${ctx.timestamp}`);

    const {
      style = 'default',
      size = '1024x1024',
      model = 'gemini',
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

    try {
      // TODO: 接入 Gemini / DALL·E / Stable Diffusion
      return {
        success: true,
        data: { imageUrl: '', prompt, style, size, model, _mock: true },
        summary: `[mock] text-to-image 原型已调用，风格: ${style}, 尺寸: ${size}`,
        status: 'success',
      };
    } catch (err) {
      return { success: false, data: { error: String(err) }, summary: `text-to-image 异常: ${String(err)}`, status: 'error' };
    }
  },
};

export default textToImage;

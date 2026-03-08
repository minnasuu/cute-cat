import type { PrimitiveHandler, PrimitiveContext, PrimitiveResult } from './types';

/**
 * Web 推送通知原型 (web-push)
 *
 * 底层能力：通过 Web Push API 向订阅者发送通知。
 * 上层技能示例：推送通知。
 * 注：当前实现 fallback 到 email-send 原型。
 */
const webPush: PrimitiveHandler = {
  id: 'web-push',
  async execute(ctx: PrimitiveContext): Promise<PrimitiveResult> {
    console.log(`[primitive:web-push] agent=${ctx.agentId} @${ctx.timestamp}`);

    try {
      // TODO: 接入 Web Push 服务
      return {
        success: true,
        data: { _mock: true },
        summary: '[mock] web-push 原型已调用',
        status: 'success',
      };
    } catch (err) {
      return { success: false, data: { error: String(err) }, summary: `web-push 异常: ${String(err)}`, status: 'error' };
    }
  },
};

export default webPush;

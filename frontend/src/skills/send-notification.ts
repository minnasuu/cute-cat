import type { SkillHandler, SkillContext, SkillResult } from './types';
import { executePrimitive } from './primitives';

/** 🔔 推送通知 — 年年
 *  基于原型: email-send (fallback，后续切换到 web-push)
 */
const sendNotification: SkillHandler = {
  id: 'send-notification',
  async execute(ctx: SkillContext): Promise<SkillResult> {
    console.log(`[send-notification] agent=${ctx.agentId} @${ctx.timestamp}`);

    const result = await executePrimitive('email-send', ctx, {
      defaultSubject: 'I-am-minna 猫猫团队通知',
      template: 'cat',
    });

    return {
      success: result.success,
      data: result.data,
      summary: result.summary,
      status: result.status,
    };
  },
};

export default sendNotification;

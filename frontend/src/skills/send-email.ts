import type { SkillHandler, SkillContext, SkillResult } from './types';
import { executePrimitive } from './primitives';

/** 📧 发送邮件 — 年年
 *  基于原型: email-send
 */
const sendEmailSkill: SkillHandler = {
  id: 'send-email',
  async execute(ctx: SkillContext): Promise<SkillResult> {
    console.log(`[send-email] agent=${ctx.agentId} @${ctx.timestamp}`);

    const result = await executePrimitive('email-send', ctx, {
      defaultSubject: '【猫猫周会】🐱 Minna 猫猫邮件',
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

export default sendEmailSkill;

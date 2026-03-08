import type { PrimitiveHandler, PrimitiveContext, PrimitiveResult } from './types';
import { sendEmail } from '../../utils/backendClient';
import { marked } from 'marked';

const DEFAULT_TO = 'minhansu508@gmail.com';

function mdToHtml(md: string): string {
  return marked.parse(md, { async: false }) as string;
}

function buildCatEmailHtml(subject: string, bodyHtml: string): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 640px; margin: 0 auto; padding: 24px; background: #FFF9F0;">
      <div style="background: linear-gradient(135deg, #FFE0B2, #FFCCBC); border-radius: 16px; padding: 24px 28px; margin-bottom: 20px;">
        <h2 style="margin: 0 0 6px; color: #4E342E; font-size: 20px;">${subject}</h2>
        <p style="margin: 0; color: #8D6E63; font-size: 13px;">${new Date().toLocaleString('zh-CN')}</p>
      </div>
      <div style="padding: 0 4px; margin-bottom: 4px;">
        <p style="color: #5D4037; font-size: 15px; margin: 0;">老大！</p>
      </div>
      <div style="background: #fff; border: 1px solid #E0D6CC; border-radius: 12px; padding: 24px; line-height: 1.9; color: #333; font-size: 14px;">
        ${bodyHtml}
      </div>
      <div style="text-align: right; padding: 16px 8px 0; color: #8D6E63; font-size: 13px; line-height: 1.6;">
        <p style="margin: 0;">🐾 喵~</p>
        <p style="margin: 4px 0 0;">年年 代 猫咪军团 发出</p>
      </div>
      <div style="text-align: center; margin-top: 20px; padding-top: 12px; border-top: 1px dashed #E0D6CC;">
        <p style="color: #BCAAA4; font-size: 11px; margin: 0;">🏠 来自 Minna 个站 · I'm Minna ✨</p>
      </div>
    </div>
  `;
}

/**
 * 邮件发送原型 (email-send)
 *
 * 底层能力：通过后端 SMTP 服务发送 HTML 邮件。
 * 上层技能示例：发送邮件、推送通知。
 */
const emailSend: PrimitiveHandler = {
  id: 'email-send',
  async execute(ctx: PrimitiveContext): Promise<PrimitiveResult> {
    console.log(`[primitive:email-send] agent=${ctx.agentId} @${ctx.timestamp}`);

    const {
      defaultSubject = '猫猫团队通知',
      template = 'cat',
    } = ctx.config as Record<string, string>;

    const input = ctx.input as Record<string, unknown> | string | undefined;
    let to = DEFAULT_TO;
    let subject = defaultSubject;
    let html = '';
    let text = '';

    if (typeof input === 'string') {
      text = input;
    } else if (input && typeof input === 'object') {
      to = (input.to as string) || to;
      subject = (input.subject as string) || subject;
      html = (input.html as string) || '';
      text = (input.notes as string) || (input.text as string) || (input.summary as string) || '';
    }

    if (!html && !text) {
      text = '这是一封来自 Minna 猫猫团队的邮件 🐱';
    }

    if (!html && text) {
      const bodyHtml = mdToHtml(text);
      html = template === 'cat' ? buildCatEmailHtml(subject, bodyHtml) : bodyHtml;
    }

    try {
      const result = await sendEmail({ to, subject, html, text });
      if (result.success) {
        return {
          success: true,
          data: { messageId: result.messageId, to, subject },
          summary: `邮件已发送至 ${to} (${result.messageId})`,
          status: 'success',
        };
      }
      return { success: false, data: { error: result.error }, summary: `邮件发送失败: ${result.error}`, status: 'error' };
    } catch (err) {
      return { success: false, data: { error: String(err) }, summary: `邮件发送异常: ${String(err)}`, status: 'error' };
    }
  },
};

export default emailSend;

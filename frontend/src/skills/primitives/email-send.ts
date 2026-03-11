import type { PrimitiveHandler, PrimitiveContext, PrimitiveResult } from './types';
import { sendEmail, getCurrentUserEmail } from '../../utils/backendClient';
import { marked } from 'marked';

const FALLBACK_TO = '';

/** 为 Markdown 转换后的 HTML 标签注入邮件兼容的内联样式 */
function injectEmailStyles(html: string): string {
  return html
    .replace(/<h1/g, '<h1 style="font-size:20px;font-weight:700;color:#4E342E;margin:16px 0 8px;line-height:1.4"')
    .replace(/<h2/g, '<h2 style="font-size:17px;font-weight:700;color:#5D4037;margin:14px 0 6px;line-height:1.4"')
    .replace(/<h3/g, '<h3 style="font-size:15px;font-weight:600;color:#6D4C41;margin:12px 0 4px;line-height:1.4"')
    .replace(/<p/g, '<p style="margin:8px 0;line-height:1.8"')
    .replace(/<ul/g, '<ul style="margin:8px 0;padding-left:20px"')
    .replace(/<ol/g, '<ol style="margin:8px 0;padding-left:20px"')
    .replace(/<li/g, '<li style="margin:4px 0;line-height:1.7"')
    .replace(/<blockquote/g, '<blockquote style="margin:10px 0;padding:8px 16px;border-left:4px solid #FFCCBC;background:#FFF3E0;color:#5D4037;border-radius:4px"')
    .replace(/<code/g, '<code style="background:#F5F0EB;padding:2px 6px;border-radius:4px;font-size:13px;color:#D84315;font-family:Menlo,Consolas,monospace"')
    .replace(/<pre/g, '<pre style="background:#3E2723;color:#FFCCBC;padding:16px;border-radius:8px;overflow-x:auto;font-size:13px;line-height:1.5;margin:10px 0"')
    .replace(/<a /g, '<a style="color:#E65100;text-decoration:underline" ')
    .replace(/<table/g, '<table style="border-collapse:collapse;width:100%;margin:10px 0"')
    .replace(/<th/g, '<th style="border:1px solid #E0D6CC;padding:8px 12px;background:#FFF3E0;font-weight:600;text-align:left;font-size:13px"')
    .replace(/<td/g, '<td style="border:1px solid #E0D6CC;padding:8px 12px;font-size:13px"')
    .replace(/<hr/g, '<hr style="border:none;border-top:1px dashed #E0D6CC;margin:16px 0"');
}

function mdToHtml(md: string): string {
  const raw = marked.parse(md, { async: false }) as string;
  return injectEmailStyles(raw);
}

function buildCatEmailHtml(subject: string, bodyHtml: string): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0 auto; padding: 24px; background: #FFF9F0;">
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
        <p style="margin: 4px 0 0;">你的猫咪军团 发出</p>
      </div>
      <div style="text-align: center; margin-top: 20px; padding-top: 12px; border-top: 1px dashed #E0D6CC;">
        <p style="color: #BCAAA4; font-size: 11px; margin: 0;">🏠 来自 CuCaTopia.com ✨</p>
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
    let to = getCurrentUserEmail() || FALLBACK_TO;
    let subject = defaultSubject;
    let html = '';
    let text = '';

    if (typeof input === 'string') {
      text = input;
    } else if (input && typeof input === 'object') {
      // _params 来自工作流参数系统（优先级最高，已经过 valueSource 解析）
      const params = input._params as Record<string, unknown> | undefined;

      // 收件人：_params.to > input.to > 当前用户邮箱
      to = (params?.to as string) || (input.to as string) || to;
      // 主题：_params.subject > input.subject > 默认主题
      subject = (params?.subject as string) || (input.subject as string) || subject;

      // 邮件正文：_params.body > input.html > input.notes/text/summary
      const bodyParam = params?.body as string | undefined;
      if (bodyParam) {
        text = bodyParam;
      } else {
        const rawHtml = (input.html as string) || '';
        // 检测 input.html 是否真的是 HTML（含标签），还是实际是 Markdown 字符串
        if (rawHtml && /<[a-z][\s\S]*>/i.test(rawHtml)) {
          html = rawHtml;
        } else if (rawHtml) {
          // input.html 字段实际是 Markdown 文本，当作正文走 mdToHtml 转换
          text = rawHtml;
        }
        if (!text) {
          text = (input.notes as string) || (input.text as string) || (input.summary as string) || '';
        }
      }
    }

    if (!html && !text) {
      text = '这是一封来自猫猫团队的邮件 🐱';
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

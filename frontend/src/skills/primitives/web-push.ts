import type { PrimitiveHandler, PrimitiveContext, PrimitiveResult } from './types';
import { sendEmail, getCurrentUserEmail } from '../../utils/backendClient';

/**
 * Web 推送通知原型 (web-push)
 *
 * 底层能力：向用户发送推送通知。
 * 策略：
 *   1. 优先使用浏览器 Notification API（需用户授权）
 *   2. 若不支持或未授权，fallback 到邮件通知
 * 上层技能示例：推送通知、工作流完成提醒。
 */
const webPush: PrimitiveHandler = {
  id: 'web-push',
  async execute(ctx: PrimitiveContext): Promise<PrimitiveResult> {
    console.log(`[primitive:web-push] agent=${ctx.agentId} @${ctx.timestamp}`);

    const config = ctx.config as Record<string, unknown>;
    const fallbackEmail = (config.fallbackEmail as string) || getCurrentUserEmail() || '';

    // 解析输入
    let title = (config.title as string) || '猫猫团队通知';
    let body = '';
    let urgency = 'normal';

    if (typeof ctx.input === 'string') {
      body = ctx.input;
    } else if (ctx.input && typeof ctx.input === 'object') {
      const obj = ctx.input as Record<string, unknown>;
      title = (obj.title as string) || (obj.subject as string) || title;
      body = (obj.body as string) || (obj.text as string) || (obj.summary as string) || '';
      urgency = (obj.urgency as string) || urgency;
    }

    if (!body) {
      return { success: false, data: null, summary: '无通知内容', status: 'warning' };
    }

    const results: string[] = [];

    try {
      // 尝试浏览器 Notification API
      if (typeof Notification !== 'undefined') {
        if (Notification.permission === 'granted') {
          new Notification(title, {
            body: body.slice(0, 200),
            icon: '/favicon.ico',
            tag: `cat-push-${Date.now()}`,
          });
          results.push('浏览器通知已发送');
        } else if (Notification.permission === 'default') {
          const permission = await Notification.requestPermission();
          if (permission === 'granted') {
            new Notification(title, { body: body.slice(0, 200), icon: '/favicon.ico' });
            results.push('浏览器通知已发送（首次授权）');
          }
        }
      }

      // Fallback: 邮件通知
      if (results.length === 0 && fallbackEmail) {
        const emailResult = await sendEmail({
          to: fallbackEmail,
          subject: `[${urgency === 'urgent' ? '紧急' : '通知'}] ${title}`,
          text: body,
        });
        if (emailResult.success) {
          results.push(`邮件通知已发送至 ${fallbackEmail}`);
        } else {
          results.push(`邮件发送失败: ${emailResult.error}`);
        }
      }

      if (results.length === 0) {
        return {
          success: true,
          data: { title, body, urgency, delivered: false },
          summary: '通知已记录（浏览器通知未授权，无 fallback 邮箱）',
          status: 'warning',
        };
      }

      return {
        success: true,
        data: { title, body, urgency, delivered: true, channels: results },
        summary: results.join('；'),
        status: 'success',
      };
    } catch (err) {
      return { success: false, data: { error: String(err) }, summary: `web-push 异常: ${String(err)}`, status: 'error' };
    }
  },
};

export default webPush;

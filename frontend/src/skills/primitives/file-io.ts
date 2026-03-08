import type { PrimitiveHandler, PrimitiveContext, PrimitiveResult } from './types';

/**
 * 文件读写原型 (file-io)
 *
 * 底层能力：读写服务端文件系统。
 * 上层技能示例：Crafts 更新、图片保存等。
 */
const fileIo: PrimitiveHandler = {
  id: 'file-io',
  async execute(ctx: PrimitiveContext): Promise<PrimitiveResult> {
    console.log(`[primitive:file-io] agent=${ctx.agentId} @${ctx.timestamp}`);

    const {
      operation = 'read',
      path = '',
    } = ctx.config as Record<string, string>;

    try {
      // TODO: 通过后端文件 API 操作
      return {
        success: true,
        data: { operation, path, _mock: true },
        summary: `[mock] file-io 原型已调用 → ${operation} ${path}`,
        status: 'success',
      };
    } catch (err) {
      return { success: false, data: { error: String(err) }, summary: `file-io 异常: ${String(err)}`, status: 'error' };
    }
  },
};

export default fileIo;

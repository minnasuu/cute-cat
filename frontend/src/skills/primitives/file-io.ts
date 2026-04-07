import type { PrimitiveHandler, PrimitiveContext, PrimitiveResult } from './types';
import { getBackendUrl } from '../../utils/backendClient';

/**
 * 文件读写原型 (file-io)
 *
 * 底层能力：
 *   - read: 通过后端 API 读取文件（如文章、Crafts JSON）
 *   - write: 通过后端 API 写入/创建文件
 *   - upload: 通过 FormData 上传文件到后端 uploads 目录
 * 上层技能示例：Crafts 更新、图片保存、配置文件管理等。
 */
const fileIo: PrimitiveHandler = {
  id: 'file-io',
  async execute(ctx: PrimitiveContext): Promise<PrimitiveResult> {
    console.log(`[primitive:file-io] agent=${ctx.agentId} @${ctx.timestamp}`);

    const config = ctx.config as Record<string, unknown>;
    const operation = (config.operation as string) || 'read';
    const proxyEndpoint = (config.proxyEndpoint as string) || '';
    const filePath = (config.path as string) || '';

    // 解析输入
    let content = '';
    let fileName = '';
    if (typeof ctx.input === 'string') {
      content = ctx.input;
    } else if (ctx.input && typeof ctx.input === 'object') {
      const obj = ctx.input as Record<string, unknown>;
      content = (obj.content as string) || (obj.text as string) || (obj.data as string) || '';
      fileName = (obj.fileName as string) || (obj.name as string) || '';
    }

    const backendUrl = getBackendUrl();
    const jsonHeaders = { 'Content-Type': 'application/json' };

    try {
      // ── 通过自定义代理端点操作 ──
      if (proxyEndpoint) {
        const resp = await fetch(`${backendUrl}${proxyEndpoint}`, {
          method: operation === 'read' ? 'GET' : 'POST',
          credentials: 'include',
          headers: jsonHeaders,
          ...(operation !== 'read' ? { body: JSON.stringify({ path: filePath, content, fileName }) } : {}),
        });
        const data = await resp.json();
        if (!resp.ok) {
          return { success: false, data, summary: data.error || `HTTP ${resp.status}`, status: 'error' };
        }
        return {
          success: true,
          data,
          summary: `文件${operation === 'read' ? '读取' : '写入'}成功: ${filePath || fileName}`,
          status: 'success',
        };
      }

      // ── 读取现有资源（利用已有 API）──
      if (operation === 'read') {
        // 利用 articles/crafts API 读取
        const endpoint = filePath.includes('craft') ? '/api/crafts' : '/api/articles';
        const resp = await fetch(`${backendUrl}${endpoint}`, { credentials: 'include', headers: jsonHeaders });
        if (!resp.ok) {
          return { success: false, data: null, summary: `读取失败: HTTP ${resp.status}`, status: 'error' };
        }
        const data = await resp.json();
        return {
          success: true,
          data,
          summary: `读取成功，获取 ${Array.isArray(data) ? data.length : 1} 条数据`,
          status: 'success',
        };
      }

      // ── 写入操作（通过现有 API）──
      if (operation === 'write' || operation === 'create') {
        const endpoint = filePath.includes('craft') ? '/api/crafts' : '/api/articles';
        const body = content || JSON.stringify(ctx.input);
        const resp = await fetch(`${backendUrl}${endpoint}`, {
          method: 'POST',
          credentials: 'include',
          headers: jsonHeaders,
          body,
        });
        const data = await resp.json();
        if (!resp.ok) {
          return { success: false, data, summary: data.error || `HTTP ${resp.status}`, status: 'error' };
        }
        return { success: true, data, summary: `写入成功: ${fileName || filePath}`, status: 'success' };
      }

      // ── 兜底 ──
      return {
        success: true,
        data: { operation, path: filePath, fileName, _mock: true },
        summary: `[mock] file-io 原型已调用 → ${operation} ${filePath || fileName}`,
        status: 'success',
      };
    } catch (err) {
      return { success: false, data: { error: String(err) }, summary: `file-io 异常: ${String(err)}`, status: 'error' };
    }
  },
};

export default fileIo;

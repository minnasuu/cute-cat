import type { PrimitiveHandler, PrimitiveContext, PrimitiveResult } from './types';
import { callDifySkill } from '../../utils/backendClient';

const getBackendUrl = (): string => {
  if (import.meta.env.VITE_BACKEND_URL) return import.meta.env.VITE_BACKEND_URL;
  if (import.meta.env.PROD) return '';
  return 'http://localhost:8002';
};

/**
 * 数据库查询原型 (db-query)
 *
 * 底层能力：查询 PostgreSQL 获取结构化数据。
 * 策略：
 *   1. 若输入为自然语言，先通过 LLM 转换为 SQL
 *   2. 通过后端代理执行 SQL 查询并返回结果集
 * 上层技能示例：数据查询、任务日志统计等。
 */
const dbQuery: PrimitiveHandler = {
  id: 'db-query',
  async execute(ctx: PrimitiveContext): Promise<PrimitiveResult> {
    console.log(`[primitive:db-query] agent=${ctx.agentId} @${ctx.timestamp}`);

    const {
      queryType = 'custom',
      table = '',
      difySkillId = '',
      proxyEndpoint = '',
    } = ctx.config as Record<string, string>;

    let queryText = '';
    if (typeof ctx.input === 'string') {
      queryText = ctx.input;
    } else if (ctx.input && typeof ctx.input === 'object') {
      const obj = ctx.input as Record<string, unknown>;
      queryText = (obj.query as string) || (obj.sql as string) || (obj.text as string) || JSON.stringify(obj);
    }

    if (!queryText.trim()) {
      return { success: false, data: null, summary: '无查询输入', status: 'warning' };
    }

    try {
      // 如果配了后端代理端点，直接走代理
      if (proxyEndpoint) {
        const backendUrl = getBackendUrl();
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        const token = localStorage.getItem('accessToken');
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const resp = await fetch(`${backendUrl}${proxyEndpoint}`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ query: queryText, table, queryType }),
        });

        const data = await resp.json();
        if (!resp.ok) {
          return { success: false, data, summary: data.error || `HTTP ${resp.status}`, status: 'error' };
        }
        const rowCount = Array.isArray(data.rows) ? data.rows.length : 0;
        return {
          success: true,
          data,
          summary: `查询完成，返回 ${rowCount} 条记录`,
          status: 'success',
        };
      }

      // 无代理端点时，通过 Dify LLM 将自然语言转为分析结果
      if (difySkillId) {
        const prompt = `你是一个数据分析助手。用户查询: ${queryText}\n表名: ${table || '未指定'}\n请分析并返回结构化的查询结果。`;
        const resp = await callDifySkill(difySkillId, prompt);
        if (resp.error) {
          return { success: false, data: { error: resp.error }, summary: `查询失败: ${resp.error}`, status: 'error' };
        }
        // 尝试解析 JSON
        let parsed: unknown = resp.answer;
        try {
          let json = resp.answer.trim();
          const m = json.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
          if (m) json = m[1].trim();
          parsed = JSON.parse(json);
        } catch { /* 保留原始文本 */ }

        return {
          success: true,
          data: { result: parsed, conversationId: resp.conversationId },
          summary: typeof parsed === 'string' ? parsed : JSON.stringify(parsed).slice(0, 200),
          status: 'success',
        };
      }

      // 兜底 mock
      return {
        success: true,
        data: { rows: [], queryType, table, query: queryText, _mock: true },
        summary: `[mock] db-query 原型已调用 → ${queryType} from ${table || 'custom'}`,
        status: 'success',
      };
    } catch (err) {
      return { success: false, data: { error: String(err) }, summary: `db-query 异常: ${String(err)}`, status: 'error' };
    }
  },
};

export default dbQuery;

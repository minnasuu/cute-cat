import type { PrimitiveHandler, PrimitiveContext, PrimitiveResult } from './types';

/**
 * 数据库查询原型 (db-query)
 *
 * 底层能力：查询 PostgreSQL 获取结构化数据。
 * 上层技能示例：数据查询、任务日志统计等。
 */
const dbQuery: PrimitiveHandler = {
  id: 'db-query',
  async execute(ctx: PrimitiveContext): Promise<PrimitiveResult> {
    console.log(`[primitive:db-query] agent=${ctx.agentId} @${ctx.timestamp}`);

    const {
      queryType = 'custom',
      table = '',
    } = ctx.config as Record<string, string>;

    try {
      // TODO: 通过后端代理执行 SQL 查询
      return {
        success: true,
        data: { rows: [], queryType, table, _mock: true },
        summary: `[mock] db-query 原型已调用 → ${queryType} from ${table || 'custom'}`,
        status: 'success',
      };
    } catch (err) {
      return { success: false, data: { error: String(err) }, summary: `db-query 异常: ${String(err)}`, status: 'error' };
    }
  },
};

export default dbQuery;

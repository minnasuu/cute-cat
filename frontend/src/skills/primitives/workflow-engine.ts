import type { PrimitiveHandler, PrimitiveContext, PrimitiveResult } from './types';

/**
 * 工作流引擎原型 (workflow-engine)
 *
 * 底层能力：触发、管理、查询工作流状态。
 * 上层技能示例：执行工作流、工作流管理、审批流程等。
 */
const workflowEngine: PrimitiveHandler = {
  id: 'workflow-engine',
  async execute(ctx: PrimitiveContext): Promise<PrimitiveResult> {
    console.log(`[primitive:workflow-engine] agent=${ctx.agentId} @${ctx.timestamp}`);

    const {
      action = 'trigger',
      workflowId = '',
    } = ctx.config as Record<string, string>;

    try {
      // TODO: 接入工作流引擎
      return {
        success: true,
        data: { action, workflowId, _mock: true },
        summary: `[mock] workflow-engine 原型已调用 → ${action} ${workflowId}`,
        status: 'success',
      };
    } catch (err) {
      return { success: false, data: { error: String(err) }, summary: `workflow-engine 异常: ${String(err)}`, status: 'error' };
    }
  },
};

export default workflowEngine;

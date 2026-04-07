/** Agent 执行上下文 */
export interface AgentContext {
  /** 触发该 agent 的 agentId（即猫咪 id） */
  agentId: string;
  /** 输入数据（来自上游 step 或用户），统一为 text */
  input: string;
  /** 当前时间戳 */
  timestamp: string;
  /** 猫咪名称 */
  catName?: string;
  /** 猫咪角色 */
  catRole?: string;
  /** 工作流名称 */
  workflowName?: string;
  /** 流式回调：每收到一块文本时触发 */
  onChunk?: (chunk: string, accumulated: string) => void;
}

/** Agent 执行结果 */
export interface AgentResult {
  /** 是否成功 */
  success: boolean;
  /** 输出数据（统一为 { text: string }，可附加元数据） */
  data: { text: string; [key: string]: unknown };
  /** 结果描述（人类可读） */
  summary: string;
  /** 状态 */
  status: 'success' | 'warning' | 'error';
}

/** Agent 处理器 */
export interface AgentHandler {
  /** agent id，与猫咪 id 一一对应 */
  id: string;
  /** 执行入口 */
  execute: (ctx: AgentContext) => Promise<AgentResult>;
}

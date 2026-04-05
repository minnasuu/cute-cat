import type { CatColors } from '../components/CatSVG';

// ─────────────────────────────────────────────────
// 协作工作流定义
// ─────────────────────────────────────────────────

export interface WorkflowStepParam {
  key: string;
  value?: unknown;
  defaultValue?: unknown;
  valueSource?: 'static' | 'upstream' | 'system';
  systemKey?: string;
}

export interface WorkflowStep {
  /** 步骤唯一标识，创建后不变，用于连线引用 */
  stepId?: string;
  agentId: string;
  /** 步骤执行动作描述 */
  action?: string;
  /** 步骤参数配置 */
  params?: WorkflowStepParam[];
  /** 数据来源：引用上游步骤的 stepId 或 agentId */
  inputFrom?: string;
}

/** 生成步骤唯一 ID */
export function generateStepId(): string {
  return 's_' + Math.random().toString(36).slice(2, 8);
}

/** 确保步骤列表中每个步骤都有 stepId（兼容旧数据） */
export function ensureStepIds(steps: WorkflowStep[]): WorkflowStep[] {
  return steps.map(s => s.stepId ? s : { ...s, stepId: generateStepId() });
}

/**
 * 根据 inputFrom 在步骤列表中查找来源步骤的索引。
 * 优先按 stepId 匹配，fallback 按 agentId 匹配（兼容旧数据）。
 * 只在 currentIndex 之前的步骤中查找。
 */
export function resolveInputFromIndex(
  steps: WorkflowStep[],
  currentIndex: number,
  inputFrom: string | undefined,
): number {
  if (!inputFrom) return currentIndex - 1;
  const byStepId = steps.findIndex((s, si) => si < currentIndex && s.stepId === inputFrom);
  if (byStepId >= 0) return byStepId;
  const byAgentId = steps.findIndex((s, si) => si < currentIndex && s.agentId === inputFrom);
  if (byAgentId >= 0) return byAgentId;
  return currentIndex - 1;
}

export interface Workflow {
  id: string;
  name: string;
  icon?: string;
  description: string;
  steps: WorkflowStep[];
  startTime?: string;
  endTime?: string;
  scheduled?: boolean;
  scheduledEnabled?: boolean;
  cron?: string;
  persistent?: boolean;
}

// ─────────────────────────────────────────────────
// 历史工作记录
// ─────────────────────────────────────────────────

export interface HistoryItem {
  id: string;
  agentId: string;
  timestamp: string;
  summary: string;
  result: string;
  workflowName?: string;
  status: 'success' | 'warning' | 'error';
}

// ─────────────────────────────────────────────────
// 猫猫助手定义
// ─────────────────────────────────────────────────

export interface Assistant {
  id: string;
  name: string;
  /** 猫猫职位/角色（如"产品策划"） */
  role: string;
  description: string;
  /** 主题色（用于 UI 着色） */
  accent: string;
  /** AI 对话时的系统提示词（性格设定） */
  systemPrompt?: string;
  /** 猫猫外观配色 */
  catColors: CatColors;
  /** 猫猫招呼语/状态文案 */
  messages: string[];
}

export type { CatColors };

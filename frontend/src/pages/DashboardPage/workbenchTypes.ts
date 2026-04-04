/** 与 GET /api/teams/workbench 对齐的片段类型，供工作台与子页复用 */

export interface TeamCat {
  id: string;
  name: string;
}

export interface WorkflowRow {
  id: string;
  name: string;
  icon: string;
  description: string;
  steps: unknown;
}

export interface WorkbenchPayload {
  teamId: string;
  name: string;
  workflows: WorkflowRow[];
  cats: TeamCat[];
  runs: WorkflowRun[];
  aiStats: AiStatRow[];
  counts: { cats: number; workflows: number; workflowRuns: number };
}

export interface WorkflowRunStep {
  index: number;
  skillId?: string;
  action?: string;
  success?: boolean;
  status?: string;
  summary?: string;
  /** 结果类型标记，如 'html-page' */
  resultType?: string;
  /** 完整结果内容（如 HTML 代码） */
  resultData?: string;
}

export interface WorkflowRun {
  id: string;
  workflowId: string | null;
  workflowName: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  totalDuration: number | null;
  /** 后端执行引擎写入的步骤摘要（JSON） */
  steps?: WorkflowRunStep[] | null;
}

export interface AiStatRow {
  catId: string;
  name: string;
  count: number;
}

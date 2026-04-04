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

export interface WorkflowRun {
  id: string;
  workflowId: string | null;
  workflowName: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  totalDuration: number | null;
}

export interface AiStatRow {
  catId: string;
  name: string;
  count: number;
}

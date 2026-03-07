import type { SkillHandler } from '../skills/types';
import type { CatColors } from '../components/CatSVG';

// --- Skill 类型定义 ---
export type SkillOutputType = 'text' | 'image' | 'audio' | 'json' | 'html' | 'email' | 'chart' | 'file';
export type SkillInputType = 'text' | 'image' | 'audio' | 'json' | 'url' | 'file' | 'none';

export interface Skill {
  id: string;
  name: string;
  icon: string;
  description: string;
  input: SkillInputType;
  output: SkillOutputType;
  provider?: string;
  mockResult?: string;
  handler?: SkillHandler;
}

// --- 协作工作流定义 ---
export interface WorkflowStep {
  agentId: string;
  skillId: string;
  action: string;
  inputFrom?: string;
}

export interface Workflow {
  id: string;
  name: string;
  icon: string;
  description: string;
  steps: WorkflowStep[];
  startTime?: string;
  endTime?: string;
  scheduled?: boolean;
  scheduledEnabled?: boolean;
  cron?: string;
  persistent?: boolean;
}

// --- 历史工作记录 ---
export interface HistoryItem {
  id: string;
  agentId: string;
  skillId: string;
  timestamp: string;
  summary: string;
  result: string;
  workflowName?: string;
  status: 'success' | 'warning' | 'error';
}

// --- 猫猫助手定义 ---
export interface Assistant {
  id: string;
  name: string;
  role: string;
  description: string;
  accent: string;
  systemPrompt: string;
  skills: Skill[];
  item: string;
  catColors: CatColors;
  messages: string[];
}

export type { CatColors };

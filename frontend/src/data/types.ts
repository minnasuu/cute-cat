import type { SkillHandler } from '../skills/types';
import type { CatColors } from '../components/CatSVG';

// ─────────────────────────────────────────────────
// 技能原型 (Skill Primitive) — 底层能力，不对用户暴露
// ─────────────────────────────────────────────────

/**
 * 技能原型 ID 枚举
 * 所有用户可见的技能（Skill）都基于某个原型实现
 */
export type PrimitiveId =
  | 'text-to-text'      // AI 文生文：文本 → 文本
  | 'text-to-image'     // AI 文生图：文本 → 图片
  | 'structured-output' // AI 结构化输出：文本 → JSON
  | 'api-call'          // 外部 API 调用（REST/RSS/Webhook）
  | 'db-query'          // 数据库查询
  | 'email-send'        // 邮件发送 (SMTP)
  | 'web-push'          // Web 推送通知
  | 'html-render'       // HTML 模板渲染
  | 'chart-render'      // 图表渲染（Chart.js 等）
  | 'browser-action'    // 浏览器自动化（Puppeteer）
  | 'file-io'           // 文件读写
  | 'workflow-engine';  // 工作流引擎操作（触发/管理）

/** 技能原型定义 */
export interface SkillPrimitive {
  /** 原型唯一 ID */
  id: PrimitiveId;
  /** 原型名称（内部可读） */
  name: string;
  /** 原型描述 */
  description: string;
  /** 输入类型 */
  input: SkillInputType;
  /** 输出类型 */
  output: SkillOutputType;
  /** 底层服务提供方 */
  provider: string;
}

// ─────────────────────────────────────────────────
// 技能 (Skill) — 用户可见，基于原型封装
// ─────────────────────────────────────────────────

export type SkillOutputType = 'text' | 'image' | 'audio' | 'json' | 'html' | 'email' | 'chart' | 'file';
export type SkillInputType = 'text' | 'image' | 'audio' | 'json' | 'html' |'url' | 'file' | 'none';

export interface Skill {
  id: string;
  name: string;
  icon: string;
  description: string;
  input: SkillInputType;
  output: SkillOutputType;
  /** 该技能基于哪个技能原型实现（运行时通过 skillId 在技能池中查找） */
  primitiveId?: PrimitiveId;
  /** 传给原型的预设配置（如 system prompt、API endpoint 等） */
  primitiveConfig?: Record<string, unknown>;
  /** 该技能需要用户配置的参数定义（如邮箱地址、API Key 等） */
  paramDefs?: StepParam[];
  provider?: string;
  mockResult?: string;
  handler?: SkillHandler;
}

// --- 用户输入/配置项定义 ---
export type StepParamType = 'text' | 'textarea' | 'number' | 'select' | 'toggle' | 'url' | 'tags';

export interface StepParam {
  /** 参数唯一标识，传入 skill handler 时作为 key */
  key: string;
  /** 显示标签 */
  label: string;
  /** 参数类型 */
  type: StepParamType;
  /** 占位提示 */
  placeholder?: string;
  /** 默认值 */
  defaultValue?: string | number | boolean | string[];
  /** type 为 select 时的选项列表 */
  options?: { label: string; value: string }[];
  /** 是否必填，默认 false */
  required?: boolean;
  /** 补充说明 */
  description?: string;
}

// --- 协作工作流定义 ---
export interface WorkflowStep {
  agentId: string;
  skillId: string;
  action: string;
  inputFrom?: string;
  /** 该步骤需要用户输入/配置的参数列表 */
  params?: StepParam[];
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  startTime?: string;
  endTime?: string;
  scheduled?: boolean;
  scheduledEnabled?: boolean;
  cron?: string;
  persistent?: boolean;
  /** 工作流级别的用户配置（每次运行前可调整） */
  userConfig?: StepParam[];
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

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
  | 'text-to-text'        // AI 文生文：文本 → 文本
  | 'text-to-image'       // AI 文生图：文本 → 图片
  | 'structured-output'   // 结构化输出：文本 → JSON
  | 'api-call'            // API 调用：HTTP 请求外部服务
  | 'db-query'            // 数据库查询：SQL → 结果集
  | 'email-send'          // 邮件发送 (SMTP)
  | 'web-push'            // Web 推送通知
  | 'html-render'         // HTML 渲染：生成并渲染页面/组件
  | 'chart-render'        // 图表渲染：数据 → 可视化图表
  | 'browser-action'      // 浏览器操作：Puppeteer 自动化
  | 'file-io'             // 文件读写：本地文件系统操作
  | 'workflow-engine'     // 工作流引擎：编排多步协作流程
  | 'js-execute'          // JS 执行

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

// --- 参数值来源 ---

/** 参数值来源类型 */
export type ParamValueSource = 'static' | 'upstream' | 'system';

/** 可用的系统注入 key 白名单 */
export const SYSTEM_KEYS = {
  'user.email': '用户注册邮箱',
  'user.name': '用户名称',
  'workflow.name': '工作流名称',
  'timestamp': '当前时间戳',
} as const;

export type SystemKey = keyof typeof SYSTEM_KEYS;

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
  /**
   * type 为 select 时，动态加载选项的 API 路径（相对于 backendUrl）
   * 例如 '/api/workflows/team/:teamId'，其中 :teamId 会被当前团队 ID 替换。
   * API 应返回数组，每个元素需包含 `id` 和 `name` 字段。
   */
  asyncOptionsFrom?: string;
  /** asyncOptionsFrom 返回数据中用作选项 value 的字段，默认 'id' */
  asyncOptionsValueKey?: string;
  /** asyncOptionsFrom 返回数据中用作选项 label 的字段，默认 'name' */
  asyncOptionsLabelKey?: string;
  /** 是否必填，默认 false */
  required?: boolean;
  /** 补充说明 */
  description?: string;
  /** 运行时用户填写的值 */
  value?: string | number | boolean | string[];
  /** 参数值的来源方式，默认 'static'（用户手动填写） */
  valueSource?: ParamValueSource;
  /** valueSource='system' 时，注入的系统上下文变量 key */
  systemKey?: SystemKey;
}

// --- 协作工作流定义 ---
export interface WorkflowStep {
  /** 步骤唯一标识，创建后不变，用于连线引用 */
  stepId?: string;
  agentId: string;
  skillId: string;
  action: string;
  /** 数据来源：引用另一个步骤的 stepId（新格式）或 agentId（旧格式兼容） */
  inputFrom?: string;
  /** 该步骤需要用户输入/配置的参数列表 */
  params?: StepParam[];
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
  // 优先匹配 stepId
  const byStepId = steps.findIndex((s, si) => si < currentIndex && s.stepId === inputFrom);
  if (byStepId >= 0) return byStepId;
  // fallback: 匹配 agentId（兼容旧数据）
  const byAgentId = steps.findIndex((s, si) => si < currentIndex && s.agentId === inputFrom);
  if (byAgentId >= 0) return byAgentId;
  return currentIndex - 1;
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

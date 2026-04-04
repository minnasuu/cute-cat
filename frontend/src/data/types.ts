import type { CatColors } from '../components/CatSVG';

// ─────────────────────────────────────────────────
// 技能原型 ID — 底层能力标识，技能层通过它匹配执行引擎
// ─────────────────────────────────────────────────

/**
 * 技能原型 ID
 * 当前仅 text-to-text；后续可扩展 text-to-image 等
 */
export type PrimitiveId =
  | 'text-to-text'        // AI 文生文：文本 → 文本
  // 扩展示例：
  // | 'text-to-image'     // AI 文生图
  // | 'structured-output' // 结构化输出

// ─────────────────────────────────────────────────
// 技能 IO 类型
// ─────────────────────────────────────────────────

/** 技能输入类型（当前以 text 为主，保留常见类型便于扩展） */
export type SkillInputType = 'text' | 'image' | 'json' | 'html' | 'url' | 'file' | 'none';

/** 技能输出类型 */
export type SkillOutputType = 'text' | 'image' | 'json' | 'html' | 'file';

// ─────────────────────────────────────────────────
// 技能 (Skill) — 用户可见，基于原型封装
// ─────────────────────────────────────────────────

export interface Skill {
  id: string;
  name: string;
  icon: string;
  description: string;
  input: SkillInputType;
  output: SkillOutputType;
  /** 该技能基于哪个技能原型实现 */
  primitiveId?: PrimitiveId;
  /** 该技能需要用户配置的参数定义 */
  paramDefs?: StepParam[];
  /** 底层服务提供方（如 Dify），展示在 UI 中 */
  provider?: string;
  /** 模拟结果：开发/演示时用于展示 */
  mockResult?: string;
}

// ─────────────────────────────────────────────────
// 步骤参数 (StepParam) — 工作流步骤的用户输入/配置
// ─────────────────────────────────────────────────

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

/** 参数控件类型 */
export type StepParamType = 'text' | 'textarea' | 'number' | 'select' | 'toggle' | 'url' | 'tags';

/** 步骤参数定义 */
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

// ─────────────────────────────────────────────────
// 协作工作流定义
// ─────────────────────────────────────────────────

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
  const byStepId = steps.findIndex((s, si) => si < currentIndex && s.stepId === inputFrom);
  if (byStepId >= 0) return byStepId;
  const byAgentId = steps.findIndex((s, si) => si < currentIndex && s.agentId === inputFrom);
  if (byAgentId >= 0) return byAgentId;
  return currentIndex - 1;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  /** 定时任务：时间范围 */
  startTime?: string;
  endTime?: string;
  /** 是否为定时工作流 */
  scheduled?: boolean;
  /** 定时开关状态 */
  scheduledEnabled?: boolean;
  /** 定时规则（自然语言，如"每天 09:00"） */
  cron?: string;
  /** 是否常驻（区别于一次性执行） */
  persistent?: boolean;
}

// ─────────────────────────────────────────────────
// 历史工作记录
// ─────────────────────────────────────────────────

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
  systemPrompt: string;
  /** 猫猫装配的技能列表 */
  skills?: Skill[];
  /** 猫猫外观配色 */
  catColors: CatColors;
  /** 猫猫招呼语/状态文案 */
  messages: string[];
}

export type { CatColors };

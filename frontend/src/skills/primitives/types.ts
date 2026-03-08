/**
 * 技能原型 (Skill Primitive) 执行层类型
 *
 * 原型是底层能力单元，不直接暴露给用户。
 * 用户感知的每个「技能」都是对某个原型的封装（附带预设 prompt / 配置）。
 */

import type { PrimitiveId } from '../../data/types';

/** 原型执行上下文 */
export interface PrimitiveContext {
  /** 触发方 agentId */
  agentId: string;
  /** 上游传入的数据 */
  input: unknown;
  /** 技能层注入的预设配置（system prompt / endpoint / template 等） */
  config: Record<string, unknown>;
  /** 当前时间戳 */
  timestamp: string;
}

/** 原型执行结果 */
export interface PrimitiveResult {
  success: boolean;
  data: unknown;
  summary: string;
  status: 'success' | 'warning' | 'error';
}

/** 原型处理器 */
export interface PrimitiveHandler {
  id: PrimitiveId;
  execute: (ctx: PrimitiveContext) => Promise<PrimitiveResult>;
}

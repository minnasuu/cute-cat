/**
 * Agent 注册表
 * 每只猫咪唯一对应一个 agentId，调用哪只猫就是调用它的 agent 脚本。
 * 所有猫的输入输出都是 text。
 */
import type { AgentHandler, AgentContext, AgentResult } from './types';

import runProductArchitect from './product-architect';
import runUxDesigner from './ux-designer';
import runVisualDesigner from './visual-designer';
import runFrontendEngineer from './frontend-engineer';

/** agentId → AgentHandler 映射 */
const handlers: AgentHandler[] = [
  { id: 'product-architect', execute: runProductArchitect },
  { id: 'ux-designer', execute: runUxDesigner },
  { id: 'visual-designer', execute: runVisualDesigner },
  { id: 'frontend-engineer', execute: runFrontendEngineer },
];

export const agentRegistry = new Map<string, AgentHandler>(
  handlers.map((h) => [h.id, h])
);

/** 根据 agentId 获取 agent 处理器 */
export function getAgentHandler(agentId: string): AgentHandler | undefined {
  return agentRegistry.get(agentId);
}

export type { AgentHandler, AgentContext, AgentResult } from './types';

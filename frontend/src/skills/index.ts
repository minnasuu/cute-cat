/**
 * Skill 事件注册表
 * 当猫咪执行任务时，通过 skillId 查找并调用对应的 handler.execute()
 *
 * 当前仅保留「网页制作流水线」所需的技能：
 *   - aigc：官方猫 AIGC 统一分发（调用 cats/ 子系统）
 *   - ai-chat：通用 AI 对话（默认 fallback）
 */
import type { SkillHandler } from './types';

// --- 核心技能 ---
import aiChat from './ai-chat';
import aigc from './aigc';

/** skillId → SkillHandler 映射表 */
const handlers: SkillHandler[] = [
  aigc,
  aiChat,
];

export const skillRegistry = new Map<string, SkillHandler>(
  handlers.map((h) => [h.id, h])
);

/** 根据 skillId 获取事件处理器 */
export function getSkillHandler(skillId: string): SkillHandler | undefined {
  return skillRegistry.get(skillId);
}

export type { SkillHandler, SkillContext, SkillResult } from './types';

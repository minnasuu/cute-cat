import { getSkillHandler } from '../skills';
import type { Assistant, Skill } from './types';

// 导出所有类型
export type { Assistant, Skill, Workflow, WorkflowStep, HistoryItem, SkillOutputType, SkillInputType, CatColors } from './types';

// 导出猫咪主题
export { DefaultCatTheme, huajiaoTheme, lanmaoTheme, heimaotaxueTheme } from './themes';

// 导出每只猫猫的独立配置
export * from './cats';

// 导出工作流和历史记录
export { workflows } from './workflows';
export { workHistory } from './history';

// 合成 mock 猫猫数组
import { huajiao } from './cats/huajiao';
import { alan } from './cats/alan';
import { xue } from './cats/xue';
import { niannian } from './cats/niannian';
import { xiaohu } from './cats/xiaohu';
import { pixel } from './cats/pixel';
import { huangjin } from './cats/huangjin';
import { mimi } from './cats/mimi';
import { xiaobai } from './cats/xiaobai';
import { fafa } from './cats/fafa';

export const assistants: Assistant[] = [
  huajiao,
  alan,
  xue,
  niannian,
  xiaohu,
  pixel,
  huangjin,
  mimi,
  xiaobai,
  fafa,
];

// 自动为每只猫的每个 skill 绑定对应的事件处理器
assistants.forEach((agent) => {
  (agent.skills as Skill[]).forEach((skill) => {
    skill.handler = getSkillHandler(skill.id);
  });
});

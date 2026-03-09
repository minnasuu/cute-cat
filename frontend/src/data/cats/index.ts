import { getSkillHandler } from '../../skills';
import { Assistant, Skill } from '../types';
import { alan } from './alan';
import { huajiao } from './huajiao';
import { huangjin } from './huangjin';
import { niannian } from './niannian';
import { xiaohu } from './xiaohu';
import { fafa } from './fafa';
import { xue } from './xue';

export { huajiao, huajiaoSkills, huajiaoMessages } from './huajiao';
export { alan, alanSkills, alanMessages } from './alan';
export { xue, xueSkills, xueMessages } from './xue';
export { niannian, niannianSkills, niannianMessages } from './niannian';
export { xiaohu, xiaohuSkills, xiaohuMessages } from './xiaohu';
export { huangjin, huangjinSkills, huangjinMessages } from './huangjin';
export { fafa, fafaSkills, fafaMessages } from './fafa';

export interface PresetCombo {
  name: string
  catId: string           // 对应的官方猫猫 id
  appearance: string      // appearanceTemplate id
  personality: string     // personalityTemplate id
  skillGroupId: string    // skillGroup id（快速装配）
  extraSkillIds?: string[] // 额外散装技能
  description: string
}

export const presetCombos: PresetCombo[] = [
  { name: '花椒', catId: 'manager',   appearance: 'lihuajiabai',    personality: 'grumpy_boss',        skillGroupId: 'pm',         description: '狸花加白 + 霸道大佬性格 + 项目经理技能组' },
  { name: '阿蓝', catId: 'writer',    appearance: 'lanmao',         personality: 'energetic_explorer', skillGroupId: 'editor',     description: '蓝猫 + 活力探险家性格 + 内容编辑技能组' },
  { name: '雪',   catId: 'analyst',   appearance: 'heimao',         personality: 'cool_aristocrat',    skillGroupId: 'analyst',    description: '踏雪黑猫 + 高冷贵族性格 + 数据分析师技能组' },
  { name: '小虎', catId: 'designer',  appearance: 'xianluomao',     personality: 'mischievous_hero',   skillGroupId: 'designer',   description: '暹罗猫 + 正义魔丸性格 + 视觉设计师技能组' },
  { name: '小白', catId: 'reviewer',  appearance: 'naimao',         personality: 'clumsy_goofball',    skillGroupId: 'qa',         description: '奶牛猫 + 笨拙小呆萌性格 + 质量审核员技能组' },
  { name: '年年', catId: 'ops',       appearance: 'jubi',           personality: 'lazy_philosopher',   skillGroupId: 'ops',        description: '橘猫 + 慵懒哲学家性格 + 运营助理技能组' },
  { name: '黄金', catId: 'engineer',  appearance: 'jinsemao',       personality: 'workaholic_elite',   skillGroupId: 'engineer',   description: '金色暹罗猫 + 工作狂精英性格 + 开发工程师技能组' },
]

export const assistants: Assistant[] = [
  huajiao,
  alan,
  xue,
  xiaohu,
  fafa,
  niannian,
  huangjin,
];

// 自动为每只猫的每个 skill 绑定对应的事件处理器
assistants.forEach((agent) => {
  (agent.skills as Skill[]).forEach((skill) => {
    skill.handler = getSkillHandler(skill.id);
  });
});

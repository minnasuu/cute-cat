import { getSkillHandler } from '../../skills';
import { Assistant, Skill } from '../types';
import { alan } from './alan';
import { fafa } from './fafa';
import { huajiao } from './huajiao';
import { huangjin } from './huangjin';
import { mimi } from './mimi';
import { niannian } from './niannian';
import { pixel } from './pixel';
import { xiaobai } from './xiaobai';
import { xiaohu } from './xiaohu';
import { xue } from './xue';

export { huajiao, huajiaoSkills, huajiaoMessages } from './huajiao';
export { alan, alanSkills, alanMessages } from './alan';
export { xue, xueSkills, xueMessages } from './xue';
export { niannian, niannianSkills, niannianMessages } from './niannian';
export { xiaohu, xiaohuSkills, xiaohuMessages } from './xiaohu';
export { pixel, pixelSkills, pixelMessages } from './pixel';
export { huangjin, huangjinSkills, huangjinMessages } from './huangjin';
export { mimi, mimiSkills, mimiMessages } from './mimi';
export { xiaobai, xiaobaiSkills, xiaobaiMessages } from './xiaobai';
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
  { name: '花椒', catId: 'manager',   appearance: 'lihuajiabai',    personality: 'leader',   skillGroupId: 'manager',    description: '狸花加白 + 领导者性格 + 管理者技能组' },
  { name: '阿蓝', catId: 'writer',    appearance: 'lanmao',     personality: 'creative',  skillGroupId: 'writer',     description: '蓝猫 + 创意家性格 + 写手技能组' },
  { name: '雪',   catId: 'analytics', appearance: 'heimao',     personality: 'scholar',   skillGroupId: 'analyst',    description: '踏雪黑猫 + 学者型性格 + 分析师技能组' },
  { name: '年年', catId: 'email',     appearance: 'jubi',       personality: 'warm',      skillGroupId: 'messenger',  description: '橘猫 + 暖心派性格 + 信使技能组' },
  { name: '小虎', catId: 'crafts',    appearance: 'sanhua',     personality: 'hustler',   skillGroupId: 'builder',    description: '三花猫 + 实干家性格 + 工匠技能组' },
  { name: 'Pixel',catId: 'image',     appearance: 'xianluomao', personality: 'creative',  skillGroupId: 'designer',   description: '暹罗猫 + 创意家性格 + 画师技能组' },
  { name: '黄金', catId: 'text',      appearance: 'jinsemao',   personality: 'hustler',   skillGroupId: 'programmer', description: '金色暹罗猫 + 实干家性格 + 程序员技能组' },
  { name: '咪咪', catId: 'sing',      appearance: 'baimao',     personality: 'warm',      skillGroupId: 'recorder',   description: '白猫 + 暖心派性格 + 记录员技能组' },
  { name: '小白', catId: 'milk',      appearance: 'naimao',     personality: 'scholar',   skillGroupId: 'qa',         description: '奶牛猫 + 学者型性格 + 质检员技能组' },
  { name: '发发', catId: 'hr',        appearance: 'yinse',      personality: 'playful',   skillGroupId: 'hr',         description: '美短 + 活泼鬼性格 + 人事官技能组' },
]
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
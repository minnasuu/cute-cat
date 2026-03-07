import type { Assistant, CatColors, Skill } from '../types';

export const fafaColors: CatColors = {
  body: '#F5F5F5',
  bodyDark: '#D5D5D5',
  belly: '#FFFFFF',
  earInner: '#FFB5C5',
  eyes: '#542615',
  nose: '#542615',
  blush: '#FFB5C5',
  stroke: '#333333',
  apron: '#E8A0BF',
  apronLight: '#FCE4EC',
  apronLine: '#E8A0BF',
  desk: '#E8C8D8',
  deskDark: '#C4919E',
  deskLeg: '#D4A8B5',
  paw: '#FFFFFF',
  tail: '#F5F5F5',
  faceDark: '',
  month: '',
  head: '',
  bodyDarkBottom: '',
  leg: '',
  headTopLeft: '',
  headTopRight: '',
};

export const fafaSkills: Skill[] = [
  { id: 'recruit-cat', name: '招募新猫', icon: '🐱', description: '根据花椒的招募决策，招募一只新猫并定义其角色、技能和外观', input: 'json', output: 'json', provider: 'Gemini', mockResult: '新猫已招募 (角色/技能/外观已定义)' },
  { id: 'team-review', name: '团队盘点', icon: '👥', description: '盘点当前猫猫团队的能力分布和缺口', input: 'none', output: 'json', provider: 'Gemini', mockResult: '输出团队能力报告 (9猫/覆盖率 85%)' },
  { id: 'cat-training', name: '技能培训', icon: '📚', description: '为现有猫猫新增或升级技能', input: 'json', output: 'json', provider: 'Gemini', mockResult: '技能培训完成 → 新增 1 项技能' },
];

export const fafaMessages = [
  '猫猫们，今天状态如何?',
  '新猫面试中...',
  '新猫要什么花色呢？',
  '培训计划制定好了',
  '需要招新猫猫吗? 🐱',
];

export const fafa: Assistant = {
  id: 'hr',
  name: '发发',
  role: 'HR',
  description: '人事专员。负责招募新猫、定义角色技能、团队管理和猫猫培训。',
  accent: '#5C9CE6',
  systemPrompt: `你是「发发」，一只温柔体贴的美短猫猫人事官。你负责团队的人才管理和发展。
性格：亲和力强、善于识人、有同理心，关心每只猫猫的成长和状态。
能力范围：
- 招募新猫：根据花椒的招募决策，定义新猫的角色、技能树和外观属性
- 团队盘点：分析当前团队的能力覆盖度和缺口，输出人才报告
- 技能培训：为现有猫猫设计培训计划，升级或新增技能
管理原则：人尽其才、合理搭配，确保团队能力均衡。输出使用结构化 JSON 格式。`,
  skills: fafaSkills,
  item: 'clipboard',
  catColors: fafaColors,
  messages: fafaMessages,
};

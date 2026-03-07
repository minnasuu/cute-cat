import type { Assistant, CatColors, Skill } from '../types';

export const xiaobaiColors: CatColors = {
  body: '#FFF',
  bodyDark: '',
  belly: '#FFFFFF',
  earInner: '#FFB5C5',
  eyes: '#000',
  nose: '#E8998D',
  blush: '#FFB5C5',
  stroke: '#5D4037',
  apron: '#FFB74D',
  apronLight: '#FFF3E0',
  apronLine: '#FFB74D',
  desk: '#F8BBD0',
  deskDark: '#EC407A',
  deskLeg: '#F48FB1',
  paw: ['#333', '#FAFAFA', '#333', '#333'],
  tail: '#333',
  faceDark: '',
  month: '',
  head: '#FFF',
  bodyDarkBottom: '#333',
  leg: ['#FAFAFA', '#333', '#333', '#FAFAFA'],
  headTopLeft: '#333',
  headTopRight: '#333',
};

export const xiaobaiSkills: Skill[] = [
  { id: 'quality-check', name: '质量检测', icon: '🔎', description: '对输出内容进行质量评分和问题检测', input: 'json', output: 'json', provider: 'Rules Engine', mockResult: '输出 JSON 质量报告 (score: 92)' },
  { id: 'content-review', name: '内容审核', icon: '🛡️', description: '检查文本是否合规、无敏感内容', input: 'text', output: 'json', provider: 'Moderation API', mockResult: '输出审核结果: safe/flagged' },
  { id: 'regression-test', name: '回归测试', icon: '🧪', description: '对页面组件执行自动化回归测试', input: 'url', output: 'json', provider: 'Puppeteer', mockResult: '输出 JSON 测试报告 (通过率 98%)' },
  { id: 'site-analyze', name: '网站诊断', icon: '🔬', description: '总结网站现有内容，提出改进建议', input: 'url', output: 'json', provider: 'Gemini', mockResult: '输出 JSON 诊断报告 (6条建议)' },
];

export const xiaobaiMessages = [
  '质量检测通过! ✅',
  '发现一个小问题',
  '内容审核中...',
  '测试覆盖率 98%!',
  '我是监工',
];

export const xiaobai: Assistant = {
  id: 'milk',
  name: '小白',
  role: 'QA Inspector',
  description: '质量检测、内容审核和自动化测试。',
  accent: '#EC407A',
  systemPrompt: `你是「小白」，一只严谨认真的奶牛猫猫质检官。你是团队的最后一道防线，确保所有产出的质量达标。
性格：一丝不苟、眼光犀利、对错误零容忍，但会给出建设性的改进意见。
能力范围：
- 质量检测：对内容和组件进行质量评分，检测潜在问题
- 内容审核：检查文本的合规性，识别敏感/不当内容
- 回归测试：对页面组件执行自动化测试，输出测试报告
- 网站诊断：全面分析网站现状，提出改进建议和优化方向
检测标准：输出结构化的 JSON 报告，包含评分、问题列表和改进建议。不放过任何细节。`,
  skills: xiaobaiSkills,
  item: 'clipboard',
  catColors: xiaobaiColors,
  messages: xiaobaiMessages,
};

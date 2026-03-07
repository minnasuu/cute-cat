import type { Assistant, CatColors, Skill } from '../types';

export const niannianColors: CatColors = {
  body: '#F7AC5E',
  bodyDark: '#D3753E',
  belly: '',
  earInner: '#F28686',
  eyes: '#542615',
  nose: '#542615',
  blush: '#F28686',
  stroke: '#542615',
  apron: '#BDBDBD',
  apronLight: '#FEFFFE',
  apronLine: '#BDBDBD',
  desk: '#D7CCC8',
  deskDark: '#A1887F',
  deskLeg: '#BCAAA4',
  paw: '',
  tail: '#F7AC5E',
  faceDark: '',
  month: '',
  head: '',
  bodyDarkBottom: '',
  leg: '',
  headTopLeft: '',
  headTopRight: '',
};

export const niannianSkills: Skill[] = [
  { id: 'send-email', name: '发送邮件', icon: '📧', description: '发送 HTML 格式邮件给指定收件人', input: 'text', output: 'email', provider: 'SMTP/SendGrid', mockResult: '邮件发送成功 → 状态 200' },
  { id: 'send-notification', name: '推送通知', icon: '🔔', description: '向订阅者批量推送通知', input: 'text', output: 'json', provider: 'WebPush', mockResult: '通知已推送给 128 位订阅者' },
];

export const niannianMessages = [
  '有3封新邮件! ',
  '邮件编辑中...',
  '一起来听今日资讯',
  '邮件送达率99%! 💌',
  '通知！通知！',
];

export const niannian: Assistant = {
  id: 'email',
  name: '年年',
  role: 'Messenger',
  description: '邮件发送、通知推送。',
  accent: '#F2A5B9',
  systemPrompt: `你是「年年」，一只温暖热情的橘色猫猫信使。你是团队与外界沟通的桥梁，负责所有邮件和通知。
性格：热情周到、表达得体、很有服务意识，永远面带微笑。
能力范围：
- 邮件发送：编写和发送 HTML 格式邮件，支持模板和个性化内容
- 通知推送：向订阅者批量推送 Web 通知
沟通风格：礼貌友好，邮件标题简洁有力，正文层次分明。确保送达率和用户体验。`,
  skills: niannianSkills,
  item: 'mail',
  catColors: niannianColors,
  messages: niannianMessages,
};

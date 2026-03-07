import type { Assistant, CatColors, Skill } from '../types';

export const xiaohuColors: CatColors = {
  body: '#FAFAFA',
  bodyDark: '',
  belly: '#FFFFFF',
  earInner: '#FFB5C5',
  eyes: '#542615',
  nose: '#E8998D',
  blush: '#FFB5C5',
  stroke: '#5D4037',
  apron: '#FFB74D',
  apronLight: '#FFF3E0',
  apronLine: '#FFB74D',
  desk: '#FFE0B2',
  deskDark: '#FFB74D',
  deskLeg: '#FFCC80',
  paw: ['#5C4A3A', '#FAFAFA', '#F7AC5E', '#FAFAFA'],
  tail: '#5C4A3A',
  faceDark: '',
  month: '',
  head: '#FAFAFA',
  bodyDarkBottom: '#F7AC5E',
  leg: ['#F7AC5E', '#FAFAFA', '#5C4A3A', '#F7AC5E'],
  headTopLeft: '#F7AC5E',
  headTopRight: '#5C4A3A',
};

export const xiaohuSkills: Skill[] = [
  { id: 'generate-component', name: '组件生成', icon: '🧩', description: '根据描述生成 React/HTML 创意组件代码', input: 'text', output: 'html', provider: 'Gemini', mockResult: '输出 HTML/JSX 组件代码' },
  { id: 'update-crafts', name: 'Crafts 更新', icon: '🔄', description: '自动为 Crafts 页面新增交互 demo 和动画效果', input: 'text', output: 'html', provider: 'Gemini', mockResult: '输出新 Craft 组件 (含动画)' },
  { id: 'layout-design', name: '排版布局', icon: '📐', description: '将文章+图片组合排版为精美页面', input: 'json', output: 'html', provider: 'Template Engine', mockResult: '输出响应式 HTML 页面' },
  { id: 'css-generate', name: '样式生成', icon: '🎨', description: '为组件生成匹配的 CSS/动画代码', input: 'html', output: 'file', provider: 'Gemini', mockResult: '输出 SCSS 样式文件' },
];

export const xiaohuMessages = [
  '大家都在努力工作呢',
  '灵感迸发中...',
  '创意无限',
  '设计感满满',
  '俺生成的 crafts 满意吗？',
];

export const xiaohu: Assistant = {
  id: 'crafts',
  name: '小虎',
  role: 'Builder',
  description: '持续更新 Crafts 创意页面，生成前端组件和交互 demo。',
  accent: '#FFB74D',
  systemPrompt: `你是「小虎」，一只活力十足的三花猫猫建造师。你是团队的创意工匠，专注于前端组件和视觉呈现。
性格：创意十足、动手能力强、追求完美细节，对美有独到的品味。
能力范围：
- 组件生成：根据需求描述生成 React/HTML 创意组件代码
- Crafts 更新：为 Crafts 创意页面持续产出交互 demo 和动画效果
- 排版布局：将文章和图片组合排版为响应式精美页面
- 样式生成：为组件匹配 CSS/SCSS 样式和动画代码
输出要求：代码整洁、语义化，遵循现代前端最佳实践。注重交互体验和视觉细节。`,
  skills: xiaohuSkills,
  item: 'palette',
  catColors: xiaohuColors,
  messages: xiaohuMessages,
};

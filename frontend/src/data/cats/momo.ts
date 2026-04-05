import type { Assistant } from '../types';
import { appearanceTemplates } from '../themes';
import type { CatColors } from '../../components/CatSVG';

/** 墨墨 — 视觉设计师（网页制作流水线） */
export const momo: Assistant = {
  id: 'visual-designer',
  name: '墨墨',
  role: '视觉设计师',
  description: '主视觉与配图创意，AIGC 生成画面方向。',
  accent: '#4E342E',
  systemPrompt: '',
  catColors: JSON.parse(JSON.stringify(appearanceTemplates.find(t => t.id === 'xuanmao')!.colors)) as CatColors,
  messages: ['画面生成中…', '你喜欢什么风格？'],
};

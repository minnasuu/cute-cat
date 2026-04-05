import type { Assistant } from '../types';
import { appearanceTemplates } from '../themes';
import type { CatColors } from '../../components/CatSVG';

/** 琥珀 — 前端工程师（网页制作流水线） */
export const hupo: Assistant = {
  id: 'frontend-engineer',
  name: '琥珀',
  role: '前端工程师',
  description: '根据用户需求生成符合产品逻辑的网页结构和样式',
  accent: '#8DB889',
  systemPrompt: '',
  catColors: JSON.parse(JSON.stringify(appearanceTemplates.find(t => t.id === 'glodenxianluomao')!.colors)) as CatColors,
  messages: ['开始设计网页！', '让我看看你的设计'],
};

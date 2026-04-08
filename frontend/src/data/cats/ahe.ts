import type { Assistant } from '../types';
import { appearanceTemplates } from '../themes';
import type { CatColors } from '../../components/CatSVG';

/** 阿禾 — HR顾问（简历） */
export const ahe: Assistant = {
  id: 'resume-architect',
  name: '阿禾',
  role: 'HR顾问',
  description: '把岗位关键词转成一页简历的结构与亮点策略。',
  accent: '#2F855A',
  appearance: 'meiduan',
  personality: 'classic_companion',
  catColors: JSON.parse(JSON.stringify(appearanceTemplates.find(t => t.id === 'meiduan')!.colors)) as CatColors,
  messages: ['结构梳理中', '先抓住岗位关键词'],
};


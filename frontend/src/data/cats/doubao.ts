import type { Assistant } from '../types';
import { appearanceTemplates } from '../themes';
import type { CatColors } from '../../components/CatSVG';

/** 豆包 — 简历写手（简历） */
export const doubao: Assistant = {
  id: 'resume-writer',
  name: '豆包',
  role: '简历写手',
  description: '把经历写成可编辑的一页简历要点（更聚焦成果与数字）。',
  accent: '#2B6CB0',
  appearance: 'lanmao',
  personality: 'workaholic_elite',
  catColors: JSON.parse(JSON.stringify(appearanceTemplates.find(t => t.id === 'lanmao')!.colors)) as CatColors,
  messages: ['措辞打磨中…', '让亮点更清晰'],
};


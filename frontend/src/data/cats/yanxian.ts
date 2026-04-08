import type { Assistant } from '../types';
import { appearanceTemplates } from '../themes';
import type { CatColors } from '../../components/CatSVG';

/** 砚线 — 排版工程师（简历） */
export const yanxian: Assistant = {
  id: 'resume-html-engineer',
  name: '砚线',
  role: '排版工程师',
  description: '把简历内容排成 A4 单页 HTML，便于编辑与导出 PDF。',
  accent: '#1A202C',
  appearance: 'lihuajiabai',
  personality: 'cool_aristocrat',
  catColors: JSON.parse(JSON.stringify(appearanceTemplates.find(t => t.id === 'lihuajiabai')!.colors)) as CatColors,
  messages: ['排版中…', '我会对齐到像素'],
};


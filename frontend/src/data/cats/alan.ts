import type { Assistant } from '../types';
import { appearanceTemplates } from '../themes';
import type { CatColors } from '../../components/CatSVG';

/** 阿蓝 — 交互设计师（落地页） */
export const alan: Assistant = {
  id: 'ux-designer',
  name: '阿蓝',
  role: '交互设计师',
  description: '根据用户需求生成符合产品逻辑的交互流程图',
  accent: '#8DB889',
  appearance: 'lanmao',
  personality: 'classic_companion',
  catColors: JSON.parse(JSON.stringify(appearanceTemplates.find(t => t.id === 'lanmao')!.colors)) as CatColors,
  messages: ['交互中', '让我思考最重要的交互流程'],
};

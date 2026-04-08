import type { Assistant } from '../types';
import { appearanceTemplates } from '../themes';
import type { CatColors } from '../../components/CatSVG';

/** 花椒 — 产品策划（落地页） */
export const huajiao: Assistant = {
  id: 'product-architect',
  name: '花椒',
  role: '产品策划',
  description: '根据用户需求生成符合产品逻辑的结构树型架构图',
  accent: '#8DB889',
  systemPrompt: '',
  appearance: 'lihuajiabai',
  personality: 'workaholic_elite',
  catColors: JSON.parse(JSON.stringify(appearanceTemplates.find(t => t.id === 'lihuajiabai')!.colors)) as CatColors,
  messages: ['架构中', '让我思考最重要的结构'],
};

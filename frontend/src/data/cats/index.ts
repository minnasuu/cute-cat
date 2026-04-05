import type { Assistant } from '../types';

// ── 网页制作流水线 4 只猫 ──
export { huajiao } from './huajiao';
export { alan } from './alan';
export { momo } from './momo';
export { hupo } from './hupo';

// ── 向后兼容：部分外部模块仍引用 assistants / presetCombos ──
export interface PresetCombo {
  name: string
  catId: string           // 对应的官方猫猫 id
  appearance: string      // appearanceTemplate id
  personality: string     // personalityTemplate id
  description: string
}

export const presetCombos: PresetCombo[] = [
  {
    name: '花椒',
    catId: 'product-architect',
    appearance: 'lihuajiabai',
    personality: 'workaholic_elite',
    description: '产品策划专家,严谨高效,专注架构规划'
  },
  {
    name: '阿澜',
    catId: 'frontend-engineer',
    appearance: 'lanmao',
    personality: 'classic_companion',
    description: '前端工程师,温和稳定,精通代码实现'
  },
  {
    name: '墨墨',
    catId: 'ux-designer',
    appearance: 'xuanmao',
    personality: 'energetic_explorer',
    description: 'UX设计师,活力充沛,探索用户体验'
  },
  {
    name: '琥珀',
    catId: 'visual-designer',
    appearance: 'glodenxianluomao',
    personality: 'cool_aristocrat',
    description: '视觉设计师,优雅高贵,打造精美界面'
  }
]

export const assistants: Assistant[] = []

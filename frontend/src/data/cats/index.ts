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

export const presetCombos: PresetCombo[] = []

export const assistants: Assistant[] = []

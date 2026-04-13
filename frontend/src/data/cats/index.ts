import type { Assistant } from '../types';

// ── 落地页 3 只猫 ──
import { huajiao } from './huajiao';
import { momo } from './momo';
import { hupo } from './hupo';

// ── 所有猫猫列表（自动从各模块汇总） ──
export { huajiao, momo, hupo };

// ── 所有猫猫列表（自动从各模块汇总） ──
const allCats = [huajiao, momo, hupo] as const;

export const assistants: Assistant[] = [...allCats];


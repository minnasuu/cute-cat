import type { Assistant } from '../types';

// ── 网页制作流水线 4 只猫 ──
import { huajiao } from './huajiao';
import { alan } from './alan';
import { momo } from './momo';
import { hupo } from './hupo';

export { huajiao, alan, momo, hupo };

// ── 所有猫猫列表（自动从各模块汇总） ──
const allCats = [huajiao, alan, momo, hupo] as const;

export const assistants: Assistant[] = [...allCats];


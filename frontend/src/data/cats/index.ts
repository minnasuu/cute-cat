import type { Assistant } from '../types';

// ── 落地页 3 只猫 ──
import { huajiao } from './huajiao';
import { momo } from './momo';
import { hupo } from './hupo';

// ── 简历 3 只猫 ──
import { ahe } from './ahe';
import { doubao } from './doubao';
import { yanxian } from './yanxian';

export { huajiao, momo, hupo, ahe, doubao, yanxian };

// ── 所有猫猫列表（自动从各模块汇总） ──
const allCats = [huajiao, momo, hupo, ahe, doubao, yanxian] as const;

export const assistants: Assistant[] = [...allCats];


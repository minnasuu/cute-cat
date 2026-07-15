/**
 * accounts —— 本地「最近登录账号」列表(仅存邮箱/昵称/角色快照,供切换账号用)
 *
 * 服务端 session 用的是 httpOnly cookie,同一时刻只能有一个活跃 session,
 * 所以「切换账号」= 登出当前 → 跳登录页并预填目标邮箱。
 * 这里只维护一份"已知账号"列表,让下拉可快速切换。
 */

export interface KnownAccount {
  email: string;
  nickname: string;
  role: 'admin' | 'member' | 'user';
  lastLoginAt: number;
}

const STORAGE_KEY = 'cuca_known_accounts';
const MAX_ACCOUNTS = 5;

function safeParse(): KnownAccount[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function persist(list: KnownAccount[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_ACCOUNTS)));
  } catch { /* ignore */ }
}

/** 记录一次登录(插到最前,去重) */
export function recordAccount(acc: Omit<KnownAccount, 'lastLoginAt'>): KnownAccount[] {
  const list = safeParse();
  const filtered = list.filter((a) => a.email !== acc.email);
  const next: KnownAccount[] = [{ ...acc, lastLoginAt: Date.now() }, ...filtered];
  persist(next);
  return next;
}

/** 移除一个账号(退出登录且不再提示) */
export function removeAccount(email: string): KnownAccount[] {
  const next = safeParse().filter((a) => a.email !== email);
  persist(next);
  return next;
}

/** 获取已知账号列表(按最近登录排序) */
export function getKnownAccounts(): KnownAccount[] {
  return safeParse().sort((a, b) => b.lastLoginAt - a.lastLoginAt);
}

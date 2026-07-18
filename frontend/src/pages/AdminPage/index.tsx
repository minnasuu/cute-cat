// @ts-nocheck
/**
 * AdminPage —— 管理员后台首页。
 *
 * 展示全部用户列表:名称、邮箱、等级、喵币余额(拆分赠送/邀请/充值)、注册时间。
 * 管理员可点击「调整」弹窗直接加/扣用户喵币。
 * 仅 role==='admin' 可访问(由 main.tsx AdminRoute 守卫)。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiClient } from "../../utils/apiClient";
import { useAuth } from "../../contexts/AuthContext";
import MeowCoinDisplay from '../../components/MeowCoinDisplay';
import Navbar from "../../components/Navbar";
import { AppIcon } from "../../components/icons/AppIcon";
import BetaCodeManager from "./BetaCodeManager";
import PricingRules from "./PricingRules";

type CoinsSummary = {
  signupBonus: number;
  inviteReward: number;
  recharge: number;
};

type AdminUser = {
  id: string;
  email: string;
  nickname: string;
  role: "admin" | "member" | "user";
  coins: number;
  inviteCode: string | null;
  inviteCount: number;
  txCount: number;
  createdAt: string;
  coinsSummary: CoinsSummary;
};

const ROLE_LABEL: Record<string, string> = {
  admin: "管理员",
  member: "会员",
  user: "用户",
};

const ROLE_BADGE: Record<string, { bg: string; text: string }> = {
  admin: { bg: "bg-danger-50 border-danger-200", text: "text-danger-600" },
  member: { bg: "bg-amber-50 border-amber-200", text: "text-amber-700" },
  user: { bg: "bg-gray-50 border-gray-200", text: "text-gray-500" },
};

type SortKey = "createdAt" | "coins" | "nickname" | "inviteCount";

export default function AdminPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortAsc, setSortAsc] = useState(false);

  // 调整弹窗
  const [adjusting, setAdjusting] = useState<AdminUser | null>(null);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustingState, setAdjustingState] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);

  // 系统可用喵币配置
  const [availableCoins, setAvailableCoins] = useState<number>(0);
  const [availableCoinsInput, setAvailableCoinsInput] = useState("");
  const [editingConfig, setEditingConfig] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);

  const loadUsers = () => {
    setLoading(true);
    apiClient
      .get<{ users: AdminUser[] }>("/api/admin/users")
      .then((d) => {
        setUsers(d.users ?? []);
      })
      .catch(() => { /* apiClient 已 toast */ })
      .finally(() => setLoading(false));
  };

  const loadAvailableCoins = useCallback(() => {
    apiClient
      .get<{ value: string | null }>("/api/admin/config/available_coins")
      .then((d) => {
        const val = Number(d.value) || 0;
        setAvailableCoins(val);
      })
      .catch(() => {});
  }, []);

  const saveAvailableCoins = async () => {
    const num = Number(availableCoinsInput);
    if (!Number.isInteger(num) || num < 0) {
      setConfigError("请输入非负整数");
      return;
    }
    setSavingConfig(true);
    setConfigError(null);
    try {
      await apiClient.put("/api/admin/config/available_coins", { value: num });
      setAvailableCoins(num);
      setEditingConfig(false);
    } catch {
      setConfigError("保存失败");
    } finally {
      setSavingConfig(false);
    }
  };

  useEffect(() => {
    loadUsers();
    loadAvailableCoins();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 汇总统计
  const stats = useMemo(() => {
    const total = users.length;
    const admins = users.filter((u) => u.role === "admin").length;
    const members = users.filter((u) => u.role === "member").length;
    const totalCoins = users.reduce((s, u) => s + (u.coins ?? 0), 0);
    const totalSignupBonus = users.reduce((s, u) => s + (u.coinsSummary?.signupBonus ?? 0), 0);
    const totalInviteReward = users.reduce((s, u) => s + (u.coinsSummary?.inviteReward ?? 0), 0);
    const totalRecharge = users.reduce((s, u) => s + (u.coinsSummary?.recharge ?? 0), 0);
    return { total, admins, members, totalCoins, totalSignupBonus, totalInviteReward, totalRecharge };
  }, [users]);

  // 筛选 + 排序
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = users;
    if (needle) {
      list = list.filter(
        (u) =>
          u.nickname.toLowerCase().includes(needle) ||
          u.email.toLowerCase().includes(needle) ||
          (u.inviteCode ?? "").toLowerCase().includes(needle),
      );
    }
    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "createdAt") {
        cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      } else if (sortKey === "coins") {
        cmp = (a.coins ?? 0) - (b.coins ?? 0);
      } else if (sortKey === "nickname") {
        cmp = a.nickname.localeCompare(b.nickname, "zh-CN");
      } else if (sortKey === "inviteCount") {
        cmp = (a.inviteCount ?? 0) - (b.inviteCount ?? 0);
      }
      return sortAsc ? cmp : -cmp;
    });
    return list;
  }, [users, q, sortKey, sortAsc]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((v) => !v);
    else { setSortKey(key); setSortAsc(false); }
  }

  function sortIcon(key: SortKey) {
    if (sortKey !== key) return <span className="text-gray-300">↕</span>;
    return sortAsc ? <span className="text-primary-500">↑</span> : <span className="text-primary-500">↓</span>;
  }

  function openAdjust(u: AdminUser) {
    setAdjusting(u);
    setAdjustAmount("");
    setAdjustReason("");
    setAdjustError(null);
  }

  async function submitAdjust() {
    if (!adjusting) return;
    const amount = parseInt(adjustAmount, 10);
    if (!Number.isInteger(amount) || amount === 0) {
      setAdjustError("请输入非零整数(正数加币/负数扣币)");
      return;
    }
    setAdjustingState(true);
    setAdjustError(null);
    try {
      await apiClient.post(`/api/admin/users/${adjusting.id}/coins`, {
        amount,
        reason: adjustReason.trim() || (amount > 0 ? "管理员加币" : "管理员扣币"),
      });
      setAdjusting(null);
      loadUsers();
    } catch (e) {
      setAdjustError(e?.message || "调整失败");
    } finally {
      setAdjustingState(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface-secondary text-text-primary">
      <Navbar
        navLinks={[{ id: "admin", label: "管理后台", href: "/admin", activeClass: "text-primary-500" }]}
        activeNavId="admin"
      />

      <main className="pt-20 px-6 pb-10">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* 标题 */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-black tracking-tight">管理后台</h1>
              <p className="text-sm text-text-tertiary mt-1">当前登录:{user?.email}</p>
            </div>
          </div>

          {/* 统计卡片 */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-4">
            <StatCard icon="Users" label="用户总数" value={stats.total} />
            <StatCard icon="Shield" label="管理员" value={stats.admins} color="text-danger-600" />
            <StatCard icon="Gift" label="会员数" value={stats.members} color="text-amber-600" />
            <StatCard icon="Coins" label="系统喵币总量" value={stats.totalCoins} color="text-primary-600" />
            <StatCard
              icon="Wallet"
              label="系统可用喵币"
              value={availableCoins}
              color="text-violet-600"
              editable
              onEdit={() => { setAvailableCoinsInput(String(availableCoins)); setConfigError(null); setEditingConfig(true); }}
            />
            <StatCard icon="Gift" label="新用户赠送" value={stats.totalSignupBonus} color="text-emerald-600" />
            <StatCard icon="Coins" label="充值总额" value={stats.totalRecharge} color="text-sky-600" />
          </div>

          {/* 系统可用喵币编辑弹窗 */}
          {editingConfig && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setEditingConfig(false)}>
              <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-lg font-bold text-text-primary">修改系统可用喵币</h3>
                <div>
                  <label className="text-[11px] uppercase tracking-wider text-text-tertiary mb-1 block">可用喵币数量</label>
                  <input
                    type="number"
                    min={0}
                    value={availableCoinsInput}
                    onChange={(e) => setAvailableCoinsInput(e.target.value)}
                    placeholder="输入可用喵币数量"
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:ring-2 focus:ring-primary-100 focus:border-primary-400 outline-none"
                    autoFocus
                  />
                </div>
                {configError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-600">{configError}</div>
                )}
                <div className="flex justify-end gap-2 pt-1">
                  <button type="button" onClick={() => setEditingConfig(false)} className="px-4 py-2 rounded-lg text-[12px] border border-border text-text-secondary hover:bg-surface-secondary transition-colors">取消</button>
                  <button
                    type="button"
                    onClick={saveAvailableCoins}
                    disabled={savingConfig}
                    className="px-4 py-2 rounded-lg text-[12px] bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 transition-colors"
                  >
                    {savingConfig ? '保存中…' : '确认修改'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 定价规则 */}
          <PricingRules />

          {/* 工具栏 */}
          <div className="flex items-center gap-3">
            <div className="flex-1 relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary">
                <AppIcon symbol="Eye" size={16} />
              </span>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="搜索昵称 / 邮箱 / 邀请码…"
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-border bg-surface text-sm placeholder:text-text-tertiary focus:ring-2 focus:ring-primary-100 focus:border-primary-400 outline-none"
              />
            </div>
            <div className="text-xs text-text-tertiary shrink-0">
              共 {rows.length} / {users.length} 人
            </div>
          </div>

          {/* 内测码管理 */}
          <BetaCodeManager />

          {/* 表格 */}
          <div className="rounded-2xl border border-border bg-surface overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-[13px] border-collapse">
                <thead>
                  <tr className="text-left text-text-tertiary border-b border-border bg-surface-secondary/50">
                    <th className="px-4 py-3 font-medium">昵称</th>
                    <th className="px-4 py-3 font-medium">邮箱</th>
                    <th className="px-4 py-3 font-medium">等级</th>
                    <th className="px-4 py-3 font-medium">
                      <SortBtn active={sortKey === "coins"} onClick={() => toggleSort("coins")}>
                                喵币余额 {sortIcon("coins")}
                              </SortBtn>
                            </th>
                            <th className="px-4 py-3 font-medium">邀请</th>
                            <th className="px-4 py-3 font-medium">
                              <SortBtn active={sortKey === "createdAt"} onClick={() => toggleSort("createdAt")}>
                                注册时间 {sortIcon("createdAt")}
                              </SortBtn>
                            </th>
                            <th className="px-4 py-3 font-medium">操作</th>
                          </tr>
                        </thead>
                        <tbody>
                          {loading ? (
                            <tr>
                              <td colSpan={7} className="px-4 py-16 text-center text-text-tertiary">
                                <div className="flex flex-col items-center gap-2">
                                  <div className="w-6 h-6 border-2 border-primary-200 border-t-primary-500 rounded-full animate-spin" />
                                  <span>加载中…</span>
                                </div>
                              </td>
                            </tr>
                          ) : rows.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="px-4 py-16 text-center text-text-tertiary">
                                {q ? "未找到匹配的用户" : "暂无用户"}
                              </td>
                            </tr>
                          ) : (
                            rows.map((u) => {
                              const badge = ROLE_BADGE[u.role] ?? ROLE_BADGE.user;
                              const isMe = u.id === user?.id;
                              const summary = u.coinsSummary ?? { signupBonus: 0, inviteReward: 0, recharge: 0 };
                              return (
                                <tr
                                  key={u.id}
                                  className={`border-b border-border transition-colors ${
                                    isMe ? "bg-primary-50/40" : "hover:bg-surface-secondary/40"
                                  }`}
                                >
                                  <td className="px-4 py-3">
                                    <div className="flex items-center gap-2">
                                      <div className="w-7 h-7 rounded-full bg-primary-100 text-primary-600 text-xs font-bold flex items-center justify-center shrink-0">
                                        {u.nickname.charAt(0).toUpperCase()}
                                      </div>
                                      <div className="min-w-0">
                                        <div className="font-medium text-text-primary truncate">
                                          {u.nickname}
                                          {isMe && (
                                            <span className="ml-1.5 text-[10px] text-primary-600 font-normal">(我)</span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-text-secondary font-mono text-[12px]">{u.email}</td>
                                  <td className="px-4 py-3">
                                    <span className={`inline-block px-2 py-0.5 rounded-full border text-[11px] font-semibold ${badge.bg} ${badge.text}`}>
                                      {ROLE_LABEL[u.role] ?? u.role}
                                    </span>
                                  </td>
                                  {/* 喵币余额:总额 + 三来源 */}
                                  <td className="px-4 py-3">
                                    <div className="flex flex-col gap-1">
                                      <div><MeowCoinDisplay size={14} amount={u.coins ?? 0} className="font-bold text-text-primary" /></div>
                                      <div className="flex items-center gap-1 text-[10px]">
                                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                                          赠+{summary.signupBonus}
                                        </span>
                                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                                          邀+{summary.inviteReward}
                                        </span>
                                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200">
                                          充+{summary.recharge}
                                        </span>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-text-secondary">
                                    {u.inviteCode ? (
                                      <span className="text-[11px]">
                                        {u.inviteCount} 人
                                      </span>
                                    ) : (
                                      <span className="text-text-tertiary">—</span>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 text-text-tertiary text-[12px] whitespace-nowrap">
                                    {new Date(u.createdAt).toLocaleString("zh-CN")}
                                  </td>
                                  <td className="px-4 py-3">
                                    <button
                                      type="button"
                                      onClick={() => openAdjust(u)}
                                      className="px-2.5 py-1 rounded-lg text-[11px] border border-primary-200 bg-primary-50 text-primary-700 hover:bg-primary-100 transition-colors"
                                    >
                                      调整
                                    </button>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </main>

      {/* 调整喵币弹窗 */}
      {adjusting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setAdjusting(null)}>
          <div
            className="bg-surface border border-border rounded-2xl p-6 w-full max-w-md space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3 className="text-lg font-bold text-text-primary">调整喵币</h3>
              <p className="text-sm text-text-tertiary mt-1">
                用户:<span className="text-text-primary font-medium ml-1">{adjusting.nickname}</span>
                <span className="ml-3">当前余额:<span className="text-primary-600 font-bold ml-1">{adjusting.coins}</span></span>
              </p>
            </div>

            <div>
              <label className="text-[11px] uppercase tracking-wider text-text-tertiary mb-1 block">
                调整数量 <span className="text-red-500">*</span>
              </label>
              <input
                value={adjustAmount}
                onChange={(e) => { setAdjustAmount(e.target.value); setAdjustError(null); }}
                placeholder="正数加币,负数扣币,如: 100 或 -50"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm placeholder:text-text-tertiary focus:ring-2 focus:ring-primary-100 focus:border-primary-400 outline-none"
                autoFocus
              />
            </div>

            <div>
              <label className="text-[11px] uppercase tracking-wider text-text-tertiary mb-1 block">
                调整原因
              </label>
              <input
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                placeholder="如: 活动补偿 / 充值补发 / 违规扣除…"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm placeholder:text-text-tertiary focus:ring-2 focus:ring-primary-100 focus:border-primary-400 outline-none"
              />
            </div>

            {adjustError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-600">
                {adjustError}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setAdjusting(null)}
                className="px-4 py-2 rounded-lg text-[12px] border border-border text-text-secondary hover:bg-surface-secondary transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={submitAdjust}
                disabled={adjustingState}
                className="px-4 py-2 rounded-lg text-[12px] bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 transition-colors"
              >
                {adjustingState ? "处理中…" : "确认调整"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  function SortBtn({
    active,
    onClick,
    children,
  }: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
  }) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 uppercase tracking-wider text-[11px] font-semibold transition-colors ${
          active ? "text-primary-600 hover:text-primary-700" : "hover:text-text-primary"
        }`}
      >
        {children}
      </button>
    );
  }

  function StatCard({
    icon,
    label,
    value,
    color = "text-text-primary",
    editable = false,
    onEdit,
  }: {
    icon: string;
    label: string;
    value: number;
    color?: string;
    editable?: boolean;
    onEdit?: () => void;
  }) {
    return (
      <div
        className={`rounded-2xl border border-border bg-surface p-4 flex items-center gap-3 ${editable ? "cursor-pointer hover:border-primary-300 hover:shadow-sm transition-all" : ""}`}
        onClick={editable ? onEdit : undefined}
        role={editable ? "button" : undefined}
        tabIndex={editable ? 0 : undefined}
        onKeyDown={editable ? (e) => { if (e.key === "Enter") onEdit?.(); } : undefined}
      >
        <div className="w-10 h-10 rounded-xl bg-surface-tertiary flex items-center justify-center shrink-0">
          <AppIcon symbol={icon} size={18} className={color} />
        </div>
        <div>
          <div className={`text-xl font-black ${color}`}>{value.toLocaleString("zh-CN")}</div>
          <div className="text-[11px] text-text-tertiary flex items-center gap-1">
            {label}
            {editable && <span className="text-primary-500 text-[9px]">✎</span>}
          </div>
        </div>
      </div>
    );
  }
}

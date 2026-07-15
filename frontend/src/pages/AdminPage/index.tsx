// @ts-nocheck
/**
 * AdminPage —— 管理员后台首页。
 *
 * 展示全部用户列表:名称、邮箱、等级、喵币余额、注册时间。
 * 仅 role==='admin' 可访问(由 main.tsx AdminRoute 守卫)。
 */
import { useEffect, useMemo, useState } from "react";
import { apiClient } from "../../utils/apiClient";
import { useAuth } from "../../contexts/AuthContext";
import MeowCoin from "../../components/MeowCoin";
import Navbar from "../../components/Navbar";
import { AppIcon } from "../../components/icons/AppIcon";

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

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    apiClient
      .get<{ users: AdminUser[] }>("/api/admin/users")
      .then((d) => {
        if (mounted) setUsers(d.users ?? []);
      })
      .catch(() => { /* apiClient 已 toast */ })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  // 汇总统计
  const stats = useMemo(() => {
    const total = users.length;
    const admins = users.filter((u) => u.role === "admin").length;
    const members = users.filter((u) => u.role === "member").length;
    const totalCoins = users.reduce((s, u) => s + (u.coins ?? 0), 0);
    return { total, admins, members, totalCoins };
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard icon="Users" label="用户总数" value={stats.total} />
            <StatCard icon="Shield" label="管理员" value={stats.admins} color="text-danger-600" />
            <StatCard icon="Gift" label="会员数" value={stats.members} color="text-amber-600" />
            <StatCard icon="Coins" label="系统喵币总量" value={stats.totalCoins} color="text-primary-600" />
          </div>

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
                          </tr>
                        </thead>
                        <tbody>
                          {loading ? (
                            <tr>
                              <td colSpan={6} className="px-4 py-16 text-center text-text-tertiary">
                                <div className="flex flex-col items-center gap-2">
                                  <div className="w-6 h-6 border-2 border-primary-200 border-t-primary-500 rounded-full animate-spin" />
                                  <span>加载中…</span>
                                </div>
                              </td>
                            </tr>
                          ) : rows.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="px-4 py-16 text-center text-text-tertiary">
                                {q ? "未找到匹配的用户" : "暂无用户"}
                              </td>
                            </tr>
                          ) : (
                            rows.map((u) => {
                              const badge = ROLE_BADGE[u.role] ?? ROLE_BADGE.user;
                              const isMe = u.id === user?.id;
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
                                  <td className="px-4 py-3 font-bold text-text-primary inline-flex items-center gap-1"><MeowCoin size={14} /> {u.coins ?? 0}</td>
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
            </div>
          );
        }

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
        }: {
          icon: string;
          label: string;
          value: number;
          color?: string;
        }) {
          return (
            <div className="rounded-2xl border border-border bg-surface p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-surface-tertiary flex items-center justify-center shrink-0">
                <AppIcon symbol={icon} size={18} className={color} />
              </div>
              <div>
                <div className={`text-xl font-black ${color}`}>{value.toLocaleString("zh-CN")}</div>
                <div className="text-[11px] text-text-tertiary">{label}</div>
              </div>
            </div>
          );
        }

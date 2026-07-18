import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { apiClient } from '../../utils/apiClient';
import { showToast } from '../../components/Toast';
import Navbar from '../../components/Navbar';
import { AppIcon } from '../../components/icons/AppIcon';
import { useIsMobile } from '../../hooks/use-media-query';
import MeowCoinDisplay from '../../components/MeowCoinDisplay';
import MeowCoin from '../../components/MeowCoin';

interface Tx {
  id: string;
  amount: number;
  balanceAfter: number;
  type: string;
  note?: string | null;
  createdAt: string;
}

interface InviteInfo {
  code: string;
  url: string;
  count: number;
  max: number;
  reward: number;
  earned: number;
}

interface RedeemTier {
  name: string;
  coins: number;
  yuan: number;
}

type RedeemTierId = 'basic' | 'plus' | 'pro';

const TX_TYPE_LABELS: Record<string, string> = {
  recharge: '充值',
  signup_bonus: '注册奖励',
  invite_reward: '邀请奖励',
  ai_consume: 'AI 消费',
  refund: '退款',
};

const ROLE_LABELS: Record<string, string> = {
  admin: '管理员',
  member: '会员',
  user: '普通用户',
};

type TabId = 'profile' | 'recharge' | 'recharge-records' | 'tx' | 'invite';

/** 左侧 Tab 配置(含 Lucide 图标名,传给 AppIcon 渲染) */
const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'profile', label: '个人信息', icon: 'User' },
  { id: 'recharge', label: '充值', icon: 'Wallet' },
  { id: 'recharge-records', label: '充值明细', icon: 'ArrowDownCircle' },
  { id: 'tx', label: '用量明细', icon: 'ClipboardList' },
  { id: 'invite', label: '邀请好友', icon: 'Gift' },
];

/**
 * AccountPage —— 个人中心:个人信息 / 充值 / 充值明细 / 用量明细 / 邀请好友
 *
 * 布局:全局 Navbar + 左侧 Sidebar(Hero + 竖排 Tab) + 右侧内容区;
 * 移动端(<md):Sidebar 收起为抽屉,Navbar 提供汉堡按钮。
 */
const AccountPage: React.FC = () => {
  const { user, updateUser, refreshUser } = useAuth();
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [nickname, setNickname] = useState('');
  const [saving, setSaving] = useState(false);
  const [tiers, setTiers] = useState<Record<RedeemTierId, RedeemTier> | null>(null);
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [rechargeRecords, setRechargeRecords] = useState<Tx[]>([]);
  const [rechargeLoading, setRechargeLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('profile');
  const [systemCoins, setSystemCoins] = useState<number>(0);

  // 兑换码
  const [redeemCode, setRedeemCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [redeemMsg, setRedeemMsg] = useState<{ type: 'success' | 'error'; text: string; coins?: number } | null>(null);

  // 密码管理
  const [pwdModal, setPwdModal] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [showOldPw, setShowOldPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

  // 注销帐号弹窗
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (user) setNickname(user.nickname);
  }, [user?.nickname]);

  // 加载兑换码档位 + 邀请信息
  useEffect(() => {
    apiClient.get<{ tiers: Record<RedeemTierId, RedeemTier> }>('/api/account/redeem-tiers').then((d) => setTiers(d.tiers)).catch(() => { });
    apiClient.get<InviteInfo>('/api/account/invite').then((d) => setInvite(d)).catch(() => { });
  }, []);

  const loadTx = useCallback(async () => {
    setTxLoading(true);
    try {
      const d = await apiClient.get<{ items: Tx[]; total: number }>('/api/account/transactions?take=100');
      setTxs(d.items);
    } catch { /* toast by apiClient */ } finally {
      setTxLoading(false);
    }
  }, []);

  const loadRechargeRecords = useCallback(async () => {
    setRechargeLoading(true);
    try {
      const d = await apiClient.get<{ items: Tx[] }>('/api/account/recharge-records');
      setRechargeRecords(d.items ?? []);
    } catch { /* toast by apiClient */ } finally {
      setRechargeLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'tx') loadTx();
    if (activeTab === 'recharge-records') loadRechargeRecords();
    if (activeTab === 'recharge') {
      // 刷新 systemCoins 以判断库存
      apiClient.get<{ systemCoins: number }>('/api/account/me').then((d) => {
        setSystemCoins(d.systemCoins ?? 0);
      }).catch(() => { });
    }
  }, [activeTab, loadTx, loadRechargeRecords]);

  const handleSaveProfile = async () => {
    if (!nickname.trim()) { showToast('昵称不能为空', 'warning'); return; }
    setSaving(true);
    try {
      const updated = await apiClient.put<{ nickname: string }>('/api/account/profile', { nickname: nickname.trim() });
      updateUser({ nickname: updated.nickname });
      showToast('保存成功', 'success');
    } catch { /* toast */ } finally {
      setSaving(false);
    }
  };

  // 打开修改密码弹窗
  const openPwdModal = () => {
    setOldPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPwdError(null);
    setPwdModal(true);
  };

  // 修改密码(弹窗)
  const handleChangePassword = async () => {
    if (!oldPassword) { setPwdError('请输入原密码'); return; }
    if (!newPassword || newPassword.length < 6) { setPwdError('新密码至少 6 位'); return; }
    if (newPassword !== confirmPassword) { setPwdError('两次输入的新密码不一致'); return; }
    if (newPassword === oldPassword) { setPwdError('新密码不能与原密码相同'); return; }
    setPwdSaving(true);
    setPwdError(null);
    try {
      await apiClient.put('/api/account/profile', { oldPassword, newPassword });
      showToast('密码修改成功', 'success');
      setPwdModal(false);
    } catch (err: any) {
      setPwdError(err?.message || '修改失败');
    } finally {
      setPwdSaving(false);
    }
  };

  const handleRedeem = async () => {
    if (!redeemCode.trim()) { showToast('请输入兑换码', 'warning'); return; }
    setRedeeming(true);
    setRedeemMsg(null);
    try {
      const res = await apiClient.post<{ coins: number; name: string }>('/api/account/redeem', { code: redeemCode.trim() });
      await refreshUser();
      setRedeemMsg({ type: 'success', text: `兑换成功!获得 ${res.name} ${res.coins}`, coins: res.coins });
      showToast(`兑换成功!获得 ${res.coins} 喵币`, 'success');
      setRedeemCode('');
    } catch (err: any) {
      const msg = err?.message || '兑换失败';
      setRedeemMsg({ type: 'error', text: msg });
      showToast(msg, 'error');
    } finally {
      setRedeeming(false);
    }
  };

  const handleCopyInvite = () => {
    if (!invite) return;
    navigator.clipboard.writeText(invite.url).then(
      () => showToast('邀请链接已复制', 'success'),
      () => showToast('复制失败，请手动复制', 'warning'),
    );
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      await apiClient.delete('/api/auth/account');
      showToast('帐号已注销', 'success');
      setDeleteModal(false);
      // 跳登出 -> 登录页
      window.location.href = '/login';
    } catch (err: any) {
      showToast(err?.message || '注销失败', 'error');
    } finally {
      setDeleting(false);
    }
  };

  /** 切换 Tab;移动端同时关闭抽屉 */
  const switchTab = (id: TabId) => {
    setActiveTab(id);
    if (isMobile) setDrawerOpen(false);
  };

  if (!user) return null;

  /* ── 左侧 Sidebar 内容(桌面端直出 / 移动端抽屉,同一份) ── */
  const renderSidebar = () => (
    <>
      {/* Hero 信息卡 */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-primary-100 border border-primary-200 flex items-center justify-center text-xl font-black text-primary-600 shrink-0">
            {user.nickname.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-black text-text-primary truncate">{user.nickname}</div>
            <div className="text-[11px] text-text-tertiary truncate">{user.email}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-3">
          <span className="px-2 py-0.5 bg-primary-50 border border-primary-200 text-primary-600 rounded-full text-[10px] font-bold uppercase tracking-widest">
            {ROLE_LABELS[user.role] || user.role}
          </span>
          <MeowCoinDisplay size={14} amount={user.coins} className="text-xs font-bold text-text-primary" />
        </div>
      </div>

      {/* 竖排 Tab */}
      <nav className="flex flex-col gap-1 p-2">
        {TABS.map((t) => {
          const current = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => switchTab(t.id)}
              className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-colors flex items-center gap-2.5 ${current
                ? 'bg-primary-500 text-white font-bold shadow-sm'
                : 'text-text-secondary hover:bg-surface-tertiary hover:text-text-primary'
                }`}
            >
              <AppIcon symbol={t.icon} size={16} className={current ? 'text-white' : 'text-text-tertiary'} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );

  // 充值 tab 是否库存不足(用户余额 > 系统总量 95%)
  const stockOut = systemCoins > 0 && (user?.coins ?? 0) > systemCoins * 0.95;

  /* ── 右侧内容区 ── */
  const renderActiveTab = () => (
    <div className="p-6 md:p-8">
      {/* 个人信息 */}
      {activeTab === 'profile' && (
        <div className="rounded-[20px] border border-border bg-surface p-6 space-y-5">
          <h2 className="text-base font-black text-text-primary">个人信息</h2>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">昵称</label>
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              className="w-full max-w-md px-4 py-3 rounded-xl border border-border-strong bg-surface-secondary focus:bg-surface focus:ring-2 focus:ring-primary-400 focus:border-transparent outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">邮箱</label>
            <div className="w-full max-w-md px-4 py-3 rounded-xl border border-border bg-surface-secondary text-text-tertiary">{user.email}</div>
            <p className="text-xs text-text-tertiary mt-1">邮箱不可修改</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">密码</label>
            <div className="w-full max-w-md">
              <div className="relative">
                <input
                  type="text"
                  value="******"
                  readOnly
                  className="w-full px-4 py-3 pr-16 rounded-xl border border-border bg-surface-secondary text-text-tertiary select-none outline-none"
                />
                <button
                  type="button"
                  onClick={openPwdModal}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-primary-600 hover:text-primary-700 text-[11px] font-medium"
                >
                  修改
                </button>
              </div>
              <p className="text-xs text-text-tertiary mt-1.5">密码已加密存储,无法查看原密码。如需修改请点「修改」。</p>
            </div>
          </div>
          <button
            onClick={handleSaveProfile}
            disabled={saving || !nickname.trim() || nickname.trim() === user.nickname}
            className="px-6 py-2.5 bg-primary-500 text-white font-bold rounded-xl hover:bg-primary-600 transition-colors disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存修改'}
          </button>
          <div className="pt-4 mt-4 border-t border-border">
            <button
              type="button"
              onClick={() => setDeleteModal(true)}
              className="px-4 py-2 rounded-lg text-[12px] border border-danger-200 bg-danger-50 text-danger-600 hover:bg-danger-100 transition-colors"
            >
              注销帐号
            </button>
            <p className="text-[11px] text-text-tertiary mt-2">注销后,您的帐号及所有数据将被永久删除,不可恢复。</p>
          </div>
        </div>
      )}

      {/* 充值(兑换码) */}
      {activeTab === 'recharge' && (
        <div className="space-y-6">
          {/* 余额 */}
          <div className="rounded-[20px] border border-border bg-surface p-4 flex items-center justify-between">
            <span className="text-sm text-text-secondary">当前余额</span>
            <MeowCoinDisplay size={22} amount={user.coins} className="text-xl font-black text-text-primary" />
          </div>

          {stockOut && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] text-amber-700">
              ⚠ 您的喵币余额已超过系统总量的 95%,充值入口暂不可用(库存不足)。
            </div>
          )}

          {/* 三档介绍 */}
          {tiers && (
            <div>
              <h3 className="text-sm font-bold text-text-primary mb-3">可选档位</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {(Object.entries(tiers) as [RedeemTierId, RedeemTier][]).map(([id, t]) => (
                  <div key={id} className={`rounded-[20px] border border-border bg-surface p-5 flex flex-col items-center text-center ${stockOut ? 'opacity-50' : ''}`}>
                    <div className="mb-1"><MeowCoinDisplay size={22} amount={t.coins} className="text-2xl font-black text-primary-600" /></div>
                    <div className="text-sm font-bold text-text-primary mb-1">{t.name}</div>
                    <div className="text-xs text-text-tertiary">≈ {Math.round(t.coins / 15)} 次生图</div>
                    <div className="text-xs text-text-tertiary mt-1">¥{t.yuan}</div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-text-tertiary mt-3">兑换码请在官方渠道购买获得,一码一次有效。</p>
            </div>
          )}

          {/* 输入兑换码 */}
          <div className={`rounded-[20px] border border-border bg-surface p-6 space-y-4 ${stockOut ? 'opacity-50 pointer-events-none' : ''}`}>
            <h3 className="text-sm font-bold text-text-primary">输入兑换码</h3>
            <div className="flex gap-2">
              <input
                value={redeemCode}
                onChange={(e) => { setRedeemCode(e.target.value); setRedeemMsg(null); }}
                placeholder="请输入兑换码(如 B-XXXXXX)"
                maxLength={32}
                disabled={stockOut}
                className="flex-1 px-4 py-3 rounded-xl border border-border-strong bg-surface-secondary focus:bg-surface focus:ring-2 focus:ring-primary-400 focus:border-transparent outline-none uppercase tracking-widest"
                onKeyDown={(e) => { if (e.key === 'Enter') handleRedeem(); }}
              />
              <button
                onClick={handleRedeem}
                disabled={redeeming || !redeemCode.trim() || stockOut}
                className="px-6 py-2.5 bg-primary-500 text-white font-bold rounded-xl hover:bg-primary-600 transition-colors disabled:opacity-50 shrink-0"
              >
                {redeeming ? '兑换中...' : '兑换'}
              </button>
            </div>
            {redeemMsg && (
              <p className={`text-sm inline-flex items-center gap-1 ${redeemMsg.type === 'success' ? 'text-primary-600' : 'text-red-500'}`}>
                <MeowCoinDisplay size={14} amount={redeemMsg.coins || 0} className="text-sm" />
              </p>
            )}
          </div>
        </div>
      )}

      {/* 充值明细 */}
      {activeTab === 'recharge-records' && (
        <div className="rounded-[20px] border border-border bg-surface overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-base font-black text-text-primary">充值明细</h2>
            <p className="text-xs text-text-tertiary mt-0.5">新用户赠送 / 邀请赠送 / 充值三类收入记录</p>
          </div>
          {rechargeLoading ? (
            <p className="p-8 text-center text-text-tertiary">加载中…</p>
          ) : rechargeRecords.length === 0 ? (
            <p className="p-8 text-center text-text-tertiary">暂无充值记录</p>
          ) : (
            <ul className="divide-y divide-border max-h-[60vh] overflow-y-auto">
              {rechargeRecords.map((tx) => {
                const before = tx.balanceAfter - tx.amount;
                return (
                  <li key={tx.id} className="px-5 py-3 flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${tx.type === 'signup_bonus' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                          tx.type === 'invite_reward' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                            'bg-sky-50 text-sky-700 border border-sky-200'
                          }`}>
                          {TX_TYPE_LABELS[tx.type] || tx.type}
                        </span>
                        <span className="text-sm font-bold text-text-primary">{tx.note || '—'}</span>
                      </div>
                      <div className="text-[11px] text-text-tertiary mt-0.5">{new Date(tx.createdAt).toLocaleString('zh-CN')}</div>
                    </div>
                    <div className="text-right shrink-0 ml-4">
                      <div className="text-sm font-black text-primary-600 inline-flex items-center gap-1">
                        + <MeowCoinDisplay size={12} amount={tx.amount} className="text-sm" />
                      </div>
                      <div className="text-[11px] text-text-tertiary">{before} → {tx.balanceAfter}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* 用量明细 */}
      {activeTab === 'tx' && (
        <div className="rounded-[20px] border border-border bg-surface overflow-hidden">
          {txLoading ? (
            <p className="p-8 text-center text-text-tertiary">加载中…</p>
          ) : txs.length === 0 ? (
            <p className="p-8 text-center text-text-tertiary">暂无流水记录</p>
          ) : (
            <ul className="divide-y divide-border max-h-[60vh] overflow-y-auto">
              {txs.map((tx) => (
                <li key={tx.id} className="px-5 py-3 flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-text-primary">{TX_TYPE_LABELS[tx.type] || tx.type}</div>
                    <div className="text-xs text-text-tertiary truncate">{tx.note || '—'}</div>
                    <div className="text-[11px] text-text-tertiary">{new Date(tx.createdAt).toLocaleString('zh-CN')}</div>
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <div className={`text-sm font-black inline-flex items-center gap-1 ${tx.amount > 0 ? 'text-primary-600' : 'text-text-primary'}`}>
                      {tx.amount > 0 ? '+' : ''}<MeowCoinDisplay size={12} amount={tx.amount} className="text-sm" />
                    </div>
                    <div className="text-[11px] text-text-tertiary">余额 {tx.balanceAfter}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* 邀请好友 */}
      {activeTab === 'invite' && invite && (
        <div className="rounded-[20px] border border-border bg-surface p-6 space-y-5">
          <h2 className="text-base font-black text-text-primary">邀请好友</h2>
          <p className="text-sm text-text-secondary">每邀请一位好友注册,你和好友各得
            <MeowCoinDisplay size={14} amount={invite.reward} />(上限 {invite.max} 人)。</p>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">邀请链接</label>
            <div className="flex gap-2">
              <input readOnly value={invite.url} className="flex-1 px-4 py-3 rounded-xl border border-border bg-surface-secondary text-sm text-text-primary outline-none" />
              <button onClick={handleCopyInvite} className="px-5 py-2.5 bg-primary-500 text-white font-bold rounded-xl hover:bg-primary-600 transition-colors shrink-0">复制</button>
            </div>
          </div>
          <div className="flex gap-6">
            <div>
              <div className="text-2xl font-black text-text-primary">{invite.count}<span className="text-sm text-text-tertiary font-normal">/{invite.max}</span></div>
              <div className="text-xs text-text-tertiary">已邀请</div>
            </div>
            <div>
              <MeowCoinDisplay size={22} amount={invite.earned} className="text-2xl font-black text-primary-600" />
              <div className="text-xs text-text-tertiary">累计奖励</div>
            </div>
          </div>
        </div>
      )
      }
    </div >
  );

  return (
    <div className="min-h-screen bg-surface-secondary text-text-primary">
      {/* 全局 Navbar —— afterLogo 放"个人中心" breadcrumb,移动端加汉堡按钮 */}
      <Navbar
        afterLogo={
          <div className="flex items-center gap-3">
            {isMobile && (
              <button
                onClick={() => setDrawerOpen(true)}
                aria-label="打开导航"
                title="导航"
                className="md:hidden w-9 h-9 rounded-lg border border-border flex items-center justify-center text-text-secondary hover:bg-surface-tertiary active:bg-surface-tertiary transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </button>
            )}
            <Link to="/dashboard" className="text-sm font-bold text-primary-600 hover:text-primary-700 transition-colors">
              ← 工作台
            </Link>
            <span className="text-text-tertiary text-sm">/</span>
            <span className="text-sm font-black tracking-tight text-text-primary">个人中心</span>
          </div>
        }
      />

      {/* 主体:左侧 Sidebar + 右侧内容 */}
      <div className="flex h-[calc(100vh-64px)] min-h-0">
        {/* 桌面端左侧 Sidebar */}
        <aside className="hidden md:flex w-64 shrink-0 border-r border-border bg-surface flex-col overflow-y-auto">
          {renderSidebar()}
        </aside>

        {/* 右侧主内容区 */}
        <main className="flex-1 min-w-0 overflow-y-auto">
          {renderActiveTab()}
        </main>
      </div>

      {/* 移动端抽屉式 Sidebar(<md 才渲染) */}
      {isMobile && (
        <>
          {/* 遮罩 */}
          {drawerOpen && (
            <div
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
              onClick={() => setDrawerOpen(false)}
            />
          )}
          {/* 抽屉 */}
          <aside
            className={`fixed top-0 left-0 z-50 h-full w-72 bg-surface border-r border-border shadow-xl flex-col overflow-y-auto transition-transform duration-200 ${drawerOpen ? 'translate-x-0' : '-translate-x-full'
              } flex`}
          >
            {/* 抽屉顶部 Close */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="text-sm font-bold text-text-primary">个人中心</span>
              <button
                onClick={() => setDrawerOpen(false)}
                aria-label="关闭导航"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-text-secondary hover:bg-surface-tertiary transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            {renderSidebar()}
          </aside>
        </>
      )}

      {/* 修改密码弹窗 */}
      {pwdModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setPwdModal(false)}>
          <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-sm space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-text-primary">修改密码</h3>
            <div>
              <label className="text-[11px] uppercase tracking-wider text-text-tertiary mb-1 block">原密码 <span className="text-red-500">*</span></label>
              <div className="relative">
                <input
                  type={showOldPw ? 'text' : 'password'}
                  value={oldPassword}
                  onChange={(e) => { setOldPassword(e.target.value); setPwdError(null); }}
                  placeholder="请输入原密码"
                  className="w-full px-4 py-3 pr-10 rounded-xl border border-border-strong bg-surface-secondary focus:bg-surface focus:ring-2 focus:ring-primary-400 focus:border-transparent outline-none"
                  autoFocus
                />
                <button type="button" onClick={() => setShowOldPw(!showOldPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary" tabIndex={-1}>
                  {showOldPw ? '隐藏' : '显示'}
                </button>
              </div>
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wider text-text-tertiary mb-1 block">新密码 <span className="text-red-500">*</span></label>
              <div className="relative">
                <input
                  type={showNewPw ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => { setNewPassword(e.target.value); setPwdError(null); }}
                  placeholder="至少 6 位"
                  className="w-full px-4 py-3 pr-10 rounded-xl border border-border-strong bg-surface-secondary focus:bg-surface focus:ring-2 focus:ring-primary-400 focus:border-transparent outline-none"
                />
                <button type="button" onClick={() => setShowNewPw(!showNewPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary" tabIndex={-1}>
                  {showNewPw ? '隐藏' : '显示'}
                </button>
              </div>
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wider text-text-tertiary mb-1 block">确认新密码 <span className="text-red-500">*</span></label>
              <div className="relative">
                <input
                  type={showConfirmPw ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setPwdError(null); }}
                  placeholder="再次输入新密码"
                  className="w-full px-4 py-3 pr-10 rounded-xl border border-border-strong bg-surface-secondary focus:bg-surface focus:ring-2 focus:ring-primary-400 focus:border-transparent outline-none"
                  onKeyDown={(e) => { if (e.key === 'Enter') handleChangePassword(); }}
                />
                <button type="button" onClick={() => setShowConfirmPw(!showConfirmPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary" tabIndex={-1}>
                  {showConfirmPw ? '隐藏' : '显示'}
                </button>
              </div>
            </div>
            {pwdError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-600">{pwdError}</div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setPwdModal(false)} className="px-4 py-2 rounded-lg text-[12px] border border-border text-text-secondary hover:bg-surface-secondary transition-colors">取消</button>
              <button type="button" onClick={handleChangePassword} disabled={pwdSaving} className="px-4 py-2 rounded-lg text-[12px] bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 transition-colors">
                {pwdSaving ? '处理中…' : '确认修改'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 注销帐号弹窗 */}
      {deleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setDeleteModal(false)}>
          <div
            className="bg-surface border border-danger-200 rounded-2xl p-6 w-full max-w-sm space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3 className="text-lg font-bold text-danger-600">⚠ 注销帐号</h3>
              <p className="text-sm text-text-secondary mt-2">
                此操作<span className="font-bold text-danger-600">不可恢复</span>。您的帐号、喵币余额、作品、邀请关系等所有数据将被永久删除。
              </p>
              <p className="text-xs text-text-tertiary mt-2">
                当前余额:<MeowCoinDisplay size={16} amount={user?.coins ?? 0} className="font-bold text-text-primary ml-1" />(一并清空)
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setDeleteModal(false)}
                className="px-4 py-2 rounded-lg text-[12px] border border-border text-text-secondary hover:bg-surface-secondary transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={deleting}
                className="px-4 py-2 rounded-lg text-[12px] bg-danger-600 text-white hover:bg-danger-700 disabled:opacity-50 transition-colors"
              >
                {deleting ? '处理中…' : '确认注销'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AccountPage;

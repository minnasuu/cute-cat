import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { apiClient } from '../../utils/apiClient';
import { showToast } from '../../components/Toast';
import Navbar from '../../components/Navbar';
import { AppIcon } from '../../components/icons/AppIcon';
import { useIsMobile } from '../../hooks/use-media-query';

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

type TabId = 'profile' | 'recharge' | 'tx' | 'invite';

/** 左侧 Tab 配置(含 Lucide 图标名,传给 AppIcon 渲染) */
const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'profile', label: '个人信息', icon: 'User' },
  { id: 'recharge', label: '充值', icon: 'Wallet' },
  { id: 'tx', label: '用量明细', icon: 'ClipboardList' },
  { id: 'invite', label: '邀请好友', icon: 'Gift' },
];

/**
 * AccountPage —— 个人中心:个人信息 / 充值 / 用量明细 / 邀请好友
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
  const [activeTab, setActiveTab] = useState<TabId>('profile');

  // 兑换码
  const [redeemCode, setRedeemCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [redeemMsg, setRedeemMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (user) setNickname(user.nickname);
  }, [user?.nickname]);

  // 加载兑换码档位 + 邀请信息
  useEffect(() => {
    apiClient.get<{ tiers: Record<RedeemTierId, RedeemTier> }>('/api/account/redeem-tiers').then((d) => setTiers(d.tiers)).catch(() => {});
    apiClient.get<InviteInfo>('/api/account/invite').then((d) => setInvite(d)).catch(() => {});
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

  useEffect(() => {
    if (activeTab === 'tx') loadTx();
  }, [activeTab, loadTx]);

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

  const handleRedeem = async () => {
    if (!redeemCode.trim()) { showToast('请输入兑换码', 'warning'); return; }
    setRedeeming(true);
    setRedeemMsg(null);
    try {
      const res = await apiClient.post<{ coins: number; name: string }>('/api/account/redeem', { code: redeemCode.trim() });
      await refreshUser();
      setRedeemMsg({ type: 'success', text: `兑换成功!获得 ${res.name} ${res.coins} 🐾` });
      showToast(`兑换成功!获得 ${res.coins} 🐾`, 'success');
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
          <span className="text-xs font-bold text-text-primary">🐾 {user.coins}</span>
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
              className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-colors flex items-center gap-2.5 ${
                current
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

  /* ── 右侧内容区 ── */
  const renderActiveTab = () => (
    <div className="p-6 md:p-8 max-w-3xl">
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
          <button
            onClick={handleSaveProfile}
            disabled={saving || !nickname.trim() || nickname.trim() === user.nickname}
            className="px-6 py-2.5 bg-primary-500 text-white font-bold rounded-xl hover:bg-primary-600 transition-colors disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存修改'}
          </button>
        </div>
      )}

      {/* 充值(兑换码) */}
      {activeTab === 'recharge' && (
        <div className="space-y-6">
          {/* 余额 */}
          <div className="rounded-[20px] border border-border bg-surface p-4 flex items-center justify-between">
            <span className="text-sm text-text-secondary">当前余额</span>
            <span className="text-xl font-black text-text-primary">🐾 {user.coins}</span>
          </div>

          {/* 三档介绍 */}
          {tiers && (
            <div>
              <h3 className="text-sm font-bold text-text-primary mb-3">可选档位</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {(Object.entries(tiers) as [RedeemTierId, RedeemTier][]).map(([id, t]) => (
                  <div key={id} className="rounded-[20px] border border-border bg-surface p-5 flex flex-col items-center text-center">
                    <div className="text-2xl font-black text-primary-600 mb-1">🐾 {t.coins}</div>
                    <div className="text-sm font-bold text-text-primary mb-1">{t.name}</div>
                    <div className="text-xs text-text-tertiary">≈ {Math.round(t.coins / 9)} 次生图</div>
                    <div className="text-xs text-text-tertiary mt-1">¥{t.yuan}</div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-text-tertiary mt-3">兑换码请在官方渠道购买获得,一码一次有效。</p>
            </div>
          )}

          {/* 输入兑换码 */}
          <div className="rounded-[20px] border border-border bg-surface p-6 space-y-4">
            <h3 className="text-sm font-bold text-text-primary">输入兑换码</h3>
            <div className="flex gap-2">
              <input
                value={redeemCode}
                onChange={(e) => { setRedeemCode(e.target.value); setRedeemMsg(null); }}
                placeholder="请输入兑换码(如 B-XXXXXX)"
                maxLength={32}
                className="flex-1 px-4 py-3 rounded-xl border border-border-strong bg-surface-secondary focus:bg-surface focus:ring-2 focus:ring-primary-400 focus:border-transparent outline-none uppercase tracking-widest"
                onKeyDown={(e) => { if (e.key === 'Enter') handleRedeem(); }}
              />
              <button
                onClick={handleRedeem}
                disabled={redeeming || !redeemCode.trim()}
                className="px-6 py-2.5 bg-primary-500 text-white font-bold rounded-xl hover:bg-primary-600 transition-colors disabled:opacity-50 shrink-0"
              >
                {redeeming ? '兑换中...' : '兑换'}
              </button>
            </div>
            {redeemMsg && (
              <p className={`text-sm ${redeemMsg.type === 'success' ? 'text-primary-600' : 'text-red-500'}`}>
                {redeemMsg.text}
              </p>
            )}
          </div>
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
                    <div className={`text-sm font-black ${tx.amount > 0 ? 'text-primary-600' : 'text-text-primary'}`}>
                      {tx.amount > 0 ? '+' : ''}{tx.amount} 🐾
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
          <p className="text-sm text-text-secondary">每邀请一位好友注册,你和好友各得 <span className="font-bold text-primary-600">{invite.reward} 🐾</span>(上限 {invite.max} 人)。</p>
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
              <div className="text-2xl font-black text-primary-600">{invite.earned} 🐾</div>
              <div className="text-xs text-text-tertiary">累计奖励</div>
            </div>
          </div>
        </div>
      )}
    </div>
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
            className={`fixed top-0 left-0 z-50 h-full w-72 bg-surface border-r border-border shadow-xl flex-col overflow-y-auto transition-transform duration-200 ${
              drawerOpen ? 'translate-x-0' : '-translate-x-full'
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
    </div>
  );
};

export default AccountPage;

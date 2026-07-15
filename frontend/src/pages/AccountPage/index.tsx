import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { apiClient } from '../../utils/apiClient';
import { showToast } from '../../components/Toast';

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

interface Package {
  id: string;
  name: string;
  coins: number;
  yuan: number;
}

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

/**
 * AccountPage —— 个人中心:个人信息 / 充值 / 用量明细 / 邀请好友
 */
const AccountPage: React.FC = () => {
  const { user, updateUser, refreshUser } = useAuth();

  const [nickname, setNickname] = useState('');
  const [saving, setSaving] = useState(false);
  const [packages, setPackages] = useState<Package[]>([]);
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'profile' | 'recharge' | 'tx' | 'invite'>('profile');

  useEffect(() => {
    if (user) setNickname(user.nickname);
  }, [user?.nickname]);

  // 加载套餐 + 邀请信息
  useEffect(() => {
    apiClient.get<{ packages: Package[] }>('/api/account/packages').then((d) => setPackages(d.packages)).catch(() => {});
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

  const handleRecharge = async (pkg: Package) => {
    try {
      const res = await apiClient.post<{ coins: number; role: string }>('/api/account/recharge', { packageId: pkg.id });
      if (res.coins != null) {
        // 刷新完整用户信息(role 可能从 user 变为 member)
        await refreshUser();
        showToast(`充值成功!获得 ${pkg.coins} 🐾`, 'success');
      }
    } catch { /* toast */ }
  };

  const handleCopyInvite = () => {
    if (!invite) return;
    navigator.clipboard.writeText(invite.url).then(
      () => showToast('邀请链接已复制', 'success'),
      () => showToast('复制失败，请手动复制', 'warning'),
    );
  };

  if (!user) return null;

  const tabs: { id: typeof activeTab; label: string }[] = [
    { id: 'profile', label: '个人信息' },
    { id: 'recharge', label: '充值' },
    { id: 'tx', label: '用量明细' },
    { id: 'invite', label: '邀请好友' },
  ];

  return (
    <div className="min-h-screen bg-surface-secondary text-text-primary">
      <header className="sticky top-0 z-20 border-b border-border bg-surface/85 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center gap-3">
          <Link to="/dashboard" className="text-sm font-bold text-primary-600 hover:text-primary-700 transition-colors">← 工作台</Link>
          <span className="text-text-tertiary text-sm">/</span>
          <h1 className="text-sm font-black tracking-tight">个人中心</h1>
        </div>
      </header>

      {/* Hero */}
      <div className="max-w-4xl mx-auto px-6 pt-8 pb-4">
        <div className="rounded-[20px] border border-border bg-surface p-6 flex items-center gap-5">
          <div className="w-16 h-16 rounded-full bg-primary-100 border border-primary-200 flex items-center justify-center text-2xl font-black text-primary-600 shrink-0">
            {user.nickname.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="text-lg font-black text-text-primary truncate">{user.nickname}</div>
            <div className="text-xs text-text-tertiary truncate">{user.email}</div>
            <div className="flex items-center gap-3 mt-1.5">
              <span className="px-2 py-0.5 bg-primary-50 border border-primary-200 text-primary-600 rounded-full text-[10px] font-bold uppercase tracking-widest">
                {ROLE_LABELS[user.role] || user.role}
              </span>
              <span className="text-sm font-bold text-text-primary">🐾 {user.coins}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-4xl mx-auto px-6">
        <div className="flex gap-1 border-b border-border overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-4 py-2.5 text-sm font-bold border-b-2 transition-all whitespace-nowrap ${
                activeTab === t.id ? 'border-primary-500 text-primary-600' : 'border-transparent text-text-tertiary hover:text-text-primary'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-6 py-6">
        {/* 个人信息 */}
        {activeTab === 'profile' && (
          <div className="rounded-[20px] border border-border bg-surface p-6 space-y-5">
            <h2 className="text-sm font-bold text-text-primary">个人信息</h2>
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

        {/* 充值 */}
        {activeTab === 'recharge' && (
          <div className="space-y-4">
            <div className="rounded-[20px] border border-border bg-surface p-4 flex items-center justify-between">
              <span className="text-sm text-text-secondary">当前余额</span>
              <span className="text-xl font-black text-text-primary">🐾 {user.coins}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {packages.map((pkg) => (
                <div key={pkg.id} className="rounded-[20px] border border-border bg-surface p-6 flex flex-col items-center text-center hover:border-primary-300 transition-colors">
                  <div className="text-3xl font-black text-primary-600 mb-1">🐾 {pkg.coins}</div>
                  <div className="text-sm font-bold text-text-primary mb-1">{pkg.name}</div>
                  <div className="text-xs text-text-tertiary mb-4">≈ {Math.round(pkg.coins / 9)} 次生图</div>
                  <div className="text-lg font-black text-text-primary mb-3">¥{pkg.yuan}</div>
                  <button
                    onClick={() => handleRecharge(pkg)}
                    className="w-full py-2.5 bg-primary-500 text-white font-bold rounded-xl hover:bg-primary-600 transition-colors"
                  >
                    立即充值
                  </button>
                </div>
              ))}
            </div>
            <p className="text-xs text-text-tertiary">灰测期间为模拟支付,选择套餐即可到账。真实支付通道即将接入。</p>
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
            <h2 className="text-sm font-bold text-text-primary">邀请好友</h2>
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
      </main>
    </div>
  );
};

export default AccountPage;

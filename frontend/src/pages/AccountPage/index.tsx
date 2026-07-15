import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

/**
 * AccountPage —— 个人中心(占位,Step 4 完善)
 */
const AccountPage: React.FC = () => {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <div className="min-h-screen bg-surface-secondary text-text-primary">
      <header className="sticky top-0 z-20 border-b border-border bg-surface/85 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center gap-3">
          <Link to="/dashboard" className="text-sm font-bold text-primary-600 hover:text-primary-700">← 工作台</Link>
          <span className="text-text-tertiary text-sm">/</span>
          <h1 className="text-sm font-black tracking-tight">个人中心</h1>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-6 py-10 space-y-6">
        <div className="rounded-[20px] border border-border bg-surface p-6">
          <p className="text-sm text-text-secondary">昵称: <span className="font-bold text-text-primary">{user.nickname}</span></p>
          <p className="text-sm text-text-secondary mt-1">邮箱: <span className="font-bold text-text-primary">{user.email}</span></p>
          <p className="text-sm text-text-secondary mt-1">角色: <span className="font-bold text-text-primary">{user.role}</span></p>
          <p className="text-sm text-text-secondary mt-1">喵币余额: <span className="font-bold text-text-primary">🪙 {user.coins}</span></p>
        </div>
        <p className="text-sm text-text-tertiary">充值、用量明细、邀请等功能将在下一步完善。</p>
      </main>
    </div>
  );
};

export default AccountPage;

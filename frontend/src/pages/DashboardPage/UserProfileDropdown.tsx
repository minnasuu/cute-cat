import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';

interface User {
  id: string;
  email: string;
  nickname: string;
  avatar?: string;
  plan?: string;
  role: 'admin' | 'member' | 'user';
  coins: number;
}

interface UserProfileDropdownProps {
  user: User;
  /** 工作流累计执行记录数(可选,通用团队工作台下不传) */
  workflowRuns?: number;
  /** AI 调用日志按猫聚合总和(可选,通用团队工作台下不传) */
  totalAiCalls?: number;
  onLogout: () => void | Promise<void>;
}

const ROLE_LABELS: Record<string, string> = {
  admin: '管理员',
  member: '会员',
  user: '用户',
};

const UserProfileDropdown: React.FC<UserProfileDropdownProps> = ({
  user,
  workflowRuns,
  totalAiCalls,
  onLogout,
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const roleLabel = ROLE_LABELS[user.role] || user.role;

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2.5 px-3 py-1.5 rounded-full ${open ? 'bg-surface-secondary':'hover:bg-surface-secondary'} transition-colors`}
      >
        <div className="w-8 h-8 rounded-full bg-primary-100 border border-primary-200 flex items-center justify-center text-sm font-black text-primary-600 select-none">
          {user.nickname.charAt(0).toUpperCase()}
        </div>
        <span className="text-sm font-bold text-text-primary hidden sm:inline truncate max-w-[200px]">{user.nickname}</span>
        <span className="px-2 py-0.5 bg-primary-50 border border-primary-200 text-primary-600 rounded-full text-[10px] font-bold uppercase tracking-widest">
          {roleLabel}
        </span>
        <svg
          className={`w-3.5 h-3.5 text-text-tertiary transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Panel */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 rounded-[20px] border border-border bg-surface shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          {/* User info header */}
          <div className="px-5 pt-5 pb-4 border-b border-border">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-primary-100 border border-primary-200 flex items-center justify-center text-base font-black text-primary-600 select-none shrink-0">
                {user.nickname.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-text-primary truncate">{user.nickname}</div>
                <div className="text-xs text-text-tertiary truncate">{user.email}</div>
              </div>
            </div>
          </div>

          {/* Coins section */}
          <div className="px-5 py-4 space-y-3">
            <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-widest">我的喵币</p>

            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-text-secondary">余额</span>
              <span className="text-sm font-black text-text-primary">🪙 {user.coins}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-text-secondary">历史执行次数</span>
              <span className="text-xs font-bold text-text-primary">{workflowRuns}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-text-secondary">角色 AI 调用（计次）</span>
              <span className="text-xs font-bold text-text-primary">{totalAiCalls}</span>
            </div>
            <Link
              to="/account"
              onClick={() => setOpen(false)}
              className="block w-full py-2 text-center text-sm font-bold text-primary-600 bg-primary-50 hover:bg-primary-100 rounded-xl transition-colors"
            >
              充值 / 账户管理
            </Link>
          </div>

          {/* Actions */}
          <div className="px-3 py-2 border-t border-border">
            <Link
              to="/account"
              onClick={() => setOpen(false)}
              className="block w-full px-3 py-2.5 text-sm font-medium text-text-tertiary hover:text-text-primary hover:bg-surface-secondary rounded-xl transition-colors"
            >
              个人中心
            </Link>
            <button
              onClick={onLogout}
              className="w-full px-3 py-2.5 text-sm font-medium text-text-tertiary hover:text-danger-500 hover:bg-danger-50 rounded-xl transition-colors text-left cursor-pointer"
            >
              退出登录
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserProfileDropdown;

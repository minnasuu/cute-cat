import React, { useState, useRef, useEffect } from 'react';

interface User {
  id: string;
  email: string;
  nickname: string;
  avatar?: string;
  plan: string;
  aiQuota?: number;
  aiUsed?: number;
}

interface UserProfileDropdownProps {
  user: User;
  teamCount: number;
  totalCats: number;
  totalWorkflows: number;
  onLogout: () => void;
}

const PLAN_LIMITS: Record<string, { maxTeams: number; maxCatsPerTeam: number; maxWorkflowsPerTeam: number }> = {
  free:       { maxTeams: 3,   maxCatsPerTeam: 5,   maxWorkflowsPerTeam: 5   },
  pro:        { maxTeams: 999, maxCatsPerTeam: 20,  maxWorkflowsPerTeam: 999 },
  enterprise: { maxTeams: 999, maxCatsPerTeam: 999, maxWorkflowsPerTeam: 999 },
};

const PLAN_LABELS: Record<string, string> = {
  free: 'Free',
  pro: 'Pro',
  enterprise: 'Enterprise',
};

const UserProfileDropdown: React.FC<UserProfileDropdownProps> = ({ user, teamCount, totalCats, totalWorkflows, onLogout }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const limits = PLAN_LIMITS[user.plan] || PLAN_LIMITS.free;
  const planLabel = PLAN_LABELS[user.plan] || user.plan;
  const aiQuota = user.aiQuota ?? 100;
  const aiUsed = user.aiUsed ?? 0;
  const aiPercent = aiQuota > 0 ? Math.min(100, Math.round((aiUsed / aiQuota) * 100)) : 0;

  const formatLimit = (val: number) => (val >= 999 ? '∞' : String(val));

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
          {planLabel}
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

          {/* Quota section */}
          <div className="px-5 py-4 space-y-3">
            <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-widest">账户用量</p>

            {/* Teams */}
            <QuotaRow
              label="团队"
              used={teamCount}
              max={limits.maxTeams}
            />
            {/* Cats per team */}
            <QuotaRow
              label="猫猫 / 团队"
              used={totalCats}
              max={limits.maxCatsPerTeam}
            />
            {/* Workflows per team */}
            <QuotaRow
              label="工作流 / 团队"
              used={totalWorkflows}
              max={limits.maxWorkflowsPerTeam}
            />
            {/* AI Calls */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-text-secondary">AI 额度</span>
                <span className="text-xs font-bold text-text-primary">{aiUsed} / {formatLimit(aiQuota)}</span>
              </div>
              <div className="h-1.5 rounded-full bg-surface-secondary overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${aiPercent >= 90 ? 'bg-danger-500' : aiPercent >= 70 ? 'bg-warning-400' : 'bg-primary-400'}`}
                  style={{ width: `${aiPercent}%` }}
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="px-3 py-2 border-t border-border">
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

/* Quota row sub-component */
const QuotaRow: React.FC<{
  label: string;
  used: number | null;
  max: number;
  description?: string;
}> = ({  label, used, max, description }) => {
  const formatLimit = (val: number) => (val >= 999 ? '∞' : String(val));
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs font-medium text-text-secondary">{label}</span>
      <div className="text-right">
          <span className="text-xs font-bold text-text-primary">
            {used||0} / <span className="text-xs text-text-tertiary">{formatLimit(max)}</span>
          </span>
        {description && (
          <span className="text-[10px] text-text-tertiary ml-1.5">{description}</span>
        )}
      </div>
    </div>
  );
};

export default UserProfileDropdown;

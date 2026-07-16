import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import CatLogo from './CatLogo';
import ThemeToggle from './ThemeToggle';

/* ── Shared Navbar ── */

interface NavLink {
  id: string;
  label: string;
  /** Active class applied when this link matches */
  activeClass?: string;
  /** href for hash-scroll links */
  href?: string;
  /** onClick override (e.g. smooth scroll) */
  onClick?: (e: React.MouseEvent) => void;
  /** 紧贴该 nav 项右侧的附属控件(如团队切换),与该项视为一体 */
  accessory?: React.ReactNode;
  /** 禁用态:渲染为灰色不可点击,悬浮提示「暂未开放」 */
  disabled?: boolean;
}

interface NavbarProps {
  /** Visual variant: 'fixed' makes it position-fixed with transparency, 'sticky' uses sticky top-0 */
  variant?: 'fixed' | 'sticky';
  /** Whether the header is in "scrolled" state (adds backdrop blur) — only used for variant='fixed' */
  scrolled?: boolean;
  /** In-page nav links (e.g. LandingPage sections) */
  navLinks?: NavLink[];
  /** Currently active nav link id */
  activeNavId?: string;
  /** Right-side slot for custom content (e.g. UserProfileDropdown) — replaces default right section */
  rightSlot?: React.ReactNode;
  /** Shown immediately to the right of the logo (e.g. greeting bubble on Dashboard) */
  afterLogo?: React.ReactNode;
  /** Logo size */
  logoSize?: number;
}

const Navbar: React.FC<NavbarProps> = ({
  variant = 'sticky',
  scrolled = false,
  navLinks,
  activeNavId,
  rightSlot,
  afterLogo,
  logoSize = 40,
}) => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const ROLE_LABELS: Record<string, string> = {
    admin: '管理员',
    member: '会员',
    user: '体验用户',
  };

  const isFixed = variant === 'fixed';

  // 用户菜单:开关 + 点击外部关闭
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [menuOpen]);

  const handleLogout = async () => {
    setMenuOpen(false);
    await logout();
    navigate('/login');
  };
  const handleSwitchAccount = async () => {
    setMenuOpen(false);
    await logout();
    navigate('/login');
  };
  const handlePersonalCenter = () => {
    setMenuOpen(false);
    navigate("/account");
  };

  const headerClass = isFixed
    ? `fixed top-0 w-full z-50 transition-all duration-500 flex justify-between px-6 items-center ${scrolled ? 'py-3 bg-surface/80 backdrop-blur-xl' : 'py-5 bg-transparent'}`
    : 'sticky top-0 z-50 bg-surface/80 backdrop-blur-xl border-b border-border';

  const innerClass = isFixed
    ? "" // fixed variant uses the header itself as flex container
    : "mx-auto px-6 h-16 flex items-center justify-between";

  /* Default right section: 用户头像(可展开菜单) + 名称 / 未登录登录入口 */
  const initial = (user?.nickname || user?.email || "?").trim().charAt(0).toUpperCase();
  const defaultRight = user ? (
    <div className="flex items-center gap-2">
      <ThemeToggle />
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setMenuOpen((o) => !o)}
          className="flex items-center gap-2 rounded-full pr-0.5 pl-3 py-0.5 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
        >
          <span className="text-sm font-medium text-text-secondary max-w-[120px] truncate">
            {user.nickname || user.email}
          </span>
          <div className="w-8 h-8 rounded-full bg-primary-500 text-white text-sm font-bold flex items-center justify-center shrink-0">
            {initial}
          </div>
        </button>
        {menuOpen && (
          <div className="absolute right-0 mt-2 w-44 rounded-xl border border-border bg-surface shadow-lg overflow-hidden text-sm z-50">
            <div className="px-3 py-2 border-b border-border">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-medium text-text-primary truncate">
                  {user.nickname || user.email}
                </span>
                {user.role && (
                  <span
                    className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${user.role === 'admin'
                      ? 'bg-danger-50 text-danger-600 border border-danger-100'
                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}
                  >
                    {ROLE_LABELS[user.role] || user.role}
                  </span>
                )}
              </div>
              {user.nickname && (
                <div className="text-[11px] text-text-secondary truncate">
                  {user.email}
                </div>
              )}
            </div>
            <button
              onClick={handleSwitchAccount}
              className="w-full text-left px-3 py-2 text-text-secondary hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            >
              切换账号
            </button>
            <button
              onClick={handlePersonalCenter}
              className="w-full text-left px-3 py-2 text-text-secondary hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            >
              个人中心
            </button>
            <button
              onClick={handleLogout}
              className="w-full text-left px-3 py-2 text-red-500 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            >
              退出登录
            </button>
          </div>
        )}
      </div>
    </div>
  ) : (
    <div className="flex items-center gap-2">
      <ThemeToggle />
      <Link
        to="/login"
        className="text-sm font-semibold text-text-secondary hover:text-text-primary transition-colors"
      >
        登录
      </Link>
      <Link
        to="/register"
        className="px-5 py-2.5 text-sm font-bold bg-text-primary text-text-inverse rounded-full hover:scale-105 active:scale-95 transition-all"
      >
        申请内测
      </Link>
    </div>
  );

  const logo = (
    <Link to="/" className="flex items-center gap-2 group cursor-pointer shrink-0">
      <CatLogo size={logoSize} className="group-hover:rotate-12 transition-transform" />
      <span className="text-xl font-bold tracking-tight">CuCaTopia</span>
    </Link>
  );

  const logoCluster = (
    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
      {logo}
      {afterLogo}
    </div>
  );

  const navSection = navLinks && navLinks.length > 0 ? (
    <nav className="hidden md:flex items-center gap-8">
      {navLinks.map(item => {
        const cls = `text-sm font-medium transition-colors ${activeNavId === item.id ? (item.activeClass || 'text-primary-500') : 'text-text-secondary hover:text-text-primary'}`;
        let linkEl: React.ReactNode;
        if (item.disabled) {
          // 禁用态:灰色不可点击 + 提示暂未开放
          linkEl = (
            <span
              className="text-sm font-medium text-text-tertiary cursor-not-allowed select-none"
              title="暂未开放"
            >
              {item.label}
              <span className="ml-1 text-[10px] text-text-tertiary">(暂未开放)</span>
            </span>
          );
        } else if (item.onClick) {
          // 有 onClick → 走自定义逻辑(原行为)
          linkEl = (
            <a href={item.href || `#${item.id}`} onClick={item.onClick} className={cls}>
              {item.label}
            </a>
          );
        } else if (item.href && item.href.startsWith('/')) {
          // 内部路由用 Link,避免整页刷新
          linkEl = (
            <Link to={item.href} className={cls}>
              {item.label}
            </Link>
          );
        } else {
          // 锚点/hash 走 a
          linkEl = (
            <a href={item.href || `#${item.id}`} className={cls}>
              {item.label}
            </a>
          );
        }
        return (
          <div key={item.id} className="flex items-center gap-2">
            {linkEl}
            {item.accessory}
          </div>
        );
      })}
    </nav>
  ) : null;

  if (isFixed) {
    return (
      <header className={headerClass}>
        {logoCluster}
        {navSection}
        {rightSlot !== undefined ? rightSlot : defaultRight}
      </header>
    );
  }

  return (
    <header className={headerClass}>
      <div className={innerClass}>
        {logoCluster}
        {navSection}
        {rightSlot !== undefined ? rightSlot : defaultRight}
      </div>
    </header>
  );
};

export default Navbar;

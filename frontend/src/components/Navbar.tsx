import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import CatLogo from './CatLogo';

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
  const { user } = useAuth();

  const isFixed = variant === 'fixed';

  const headerClass = isFixed
    ? `fixed top-0 w-full z-50 transition-all duration-500 flex justify-between px-6 items-center ${scrolled ? 'py-3 bg-surface/80 backdrop-blur-xl' : 'py-5 bg-transparent'}`
    : 'sticky top-0 z-50 bg-surface/80 backdrop-blur-xl border-b border-border';

  const innerClass = isFixed
    ? '' // fixed variant uses the header itself as flex container
    : 'max-w-6xl mx-auto px-6 h-16 flex items-center justify-between';

  /* Default right section based on auth state */
  const defaultRight = user ? (
    <div className="flex items-center gap-3">
      <button
        onClick={() => navigate('/dashboard')}
        className="px-5 py-2 text-sm font-bold bg-text-primary text-text-inverse rounded-full hover:scale-105 active:scale-95 transition-all cursor-pointer"
      >
        进入工作台
      </button>
    </div>
  ) : (
    <div className="flex items-center gap-4">
      <Link to="/login" className="text-sm font-semibold text-text-secondary hover:text-text-primary transition-colors">登录</Link>
      <Link to="/register" className="px-5 py-2.5 text-sm font-bold bg-text-primary text-text-inverse rounded-full hover:scale-105 active:scale-95 transition-all">申请内测</Link>
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
      {navLinks.map(item => (
        <a
          key={item.id}
          href={item.href || `#${item.id}`}
          onClick={item.onClick}
          className={`text-sm font-medium transition-colors ${activeNavId === item.id ? (item.activeClass || 'text-primary-500') : 'text-text-secondary hover:text-text-primary'}`}
        >
          {item.label}
        </a>
      ))}
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

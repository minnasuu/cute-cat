import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import CatLogo from '../../components/CatLogo';
import Navbar from '../../components/Navbar';
import { LandHeroCtas } from './LandHeroCtas';
import { LandFeatureRoles } from './LandFeatureRoles';
import { LandFeatureWorkflows } from './LandFeatureWorkflows';
import { LandCta } from './LandCta';

const NAV_ITEMS = [
  { id: 'roles', label: '角色', activeClass: 'text-primary-500' },
  { id: 'skills', label: '技能', activeClass: 'text-accent-500' },
  { id: 'workflows', label: '工作流', activeClass: 'text-secondary-500' },
];

const LandingPage: React.FC = () => {
  const [scrollY, setScrollY] = useState(0);
  const [activeSection, setActiveSection] = useState('');

  useEffect(() => {
    const h = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', h, { passive: true });
    return () => window.removeEventListener('scroll', h);
  }, []);

  useEffect(() => {
    const ids = NAV_ITEMS.map(n => n.id);
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          } else {
            setActiveSection(prev => prev === entry.target.id ? '' : prev);
          }
        }
      },
      { rootMargin: '-40% 0px -50% 0px', threshold: 0 }
    );
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="min-h-screen bg-surface text-text-primary selection:bg-primary-100 selection:text-primary-900">
      {/* Navbar */}
      <Navbar
        variant="fixed"
        scrolled={scrollY > 20}
        logoSize={48}
        navLinks={NAV_ITEMS.map(item => ({
          ...item,
          href: `#${item.id}`,
          onClick: (e: React.MouseEvent) => { e.preventDefault(); document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth' }); },
        }))}
        activeNavId={activeSection}
      />

      {/* Hero */}
      <section className="relative pt-20 pb-20 md:pt-32 md:pb-40 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-6xl h-full -z-10 pointer-events-none">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary-100/40 rounded-full blur-[120px] animate-pulse" />
          <div className="absolute top-20 right-1/4 w-96 h-96 bg-accent-100/40 rounded-full blur-[120px] animate-pulse [animation-delay:2s]" />
        </div>

        <div className="mx-auto text-center">
          <LandHeroCtas/>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            内测进行中 · 凭邀请码体验
          </div>
          
          <h1 className="text-5xl md:text-7xl font-black leading-[1.1] tracking-tighter text-text-primary mb-8 px-6">
            集结完毕<br />
            <span className="text-text-secondary">你的 AI 自动化猫猫军团</span>
          </h1>
          
          <p className="text-lg md:text-xl text-text-secondary max-w-2xl mx-auto leading-relaxed mb-12 font-medium px-6">
            告别繁琐，让可爱的 AI 猫猫们各司其职。<br className="hidden md:block" />
            基于团队协作的可视化自动化平台：落地页、海报、品牌卡，一键生成可编辑成果并导出。
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 px-6">
            <Link to="/register" className="w-full sm:w-auto px-10 py-4 text-lg font-bold bg-primary-500 text-text-inverse rounded-2xl hover:bg-primary-600 transition-all">申请内测体验</Link>
            <a href="#roles" onClick={e => { e.preventDefault(); document.getElementById('roles')?.scrollIntoView({ behavior: 'smooth' }) }} className="w-full sm:w-auto px-10 py-4 text-lg font-bold bg-surface-secondary text-text-primary rounded-2xl border border-border-strong hover:bg-surface-tertiary transition-all">查看功能详情</a>
          </div>
        </div>
      </section>

      {/* Stats/Social Proof (Lens.xyz style minimal cards) */}
      <section className="py-12 border-y border-border bg-surface-secondary/30">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {[
              { label: '活跃猫猫', val: '2.4k+' },
              { label: '工作流运行', val: '150k+' },
              { label: '协作团队', val: '800+' },
              { label: '平均耗时', val: '-85%' },
            ].map((s, i) => (
              <div key={i} className="text-center">
                <div className="text-2xl font-black text-text-primary">{s.val}</div>
                <div className="text-xs font-bold text-text-tertiary uppercase tracking-widest mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features: Roles / Skills / Workflows */}
      <LandFeatureRoles />
      <LandFeatureWorkflows />

      {/* Call to Action */}
      <LandCta />

      {/* Footer */}
      <footer className="py-4 border-t border-border">
        <div className="mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-1">
          <Link to="/" className="flex items-center gap-2 group cursor-pointer">
                <CatLogo size={48} className="group-hover:rotate-12 transition-transform" />
          </Link>
          <p className="text-text-tertiary text-xs font-medium">© 2026 CuCaTopia.</p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;

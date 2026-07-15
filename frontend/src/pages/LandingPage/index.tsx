import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import CatLogo from '../../components/CatLogo';
import Navbar from '../../components/Navbar';
import { AppIcon } from '../../components/icons';
import MeowCoin from '../../components/MeowCoin';

const NAV_ITEMS = [
  { id: 'workspaces', label: '工作台', activeClass: 'text-primary-500' },
  { id: 'community', label: '社区', activeClass: 'text-accent-500' },
  { id: 'pricing', label: '计费', activeClass: 'text-secondary-500' },
];

const WORKSPACES = [
  { icon: '✂️', name: '服装工作台', desc: '灵感扩散 → 方案 → 线稿 → 选材料 → 成图,材料组合一键出效果图', active: true },
  { icon: '🧶', name: '编织工作台', desc: '即将开放', active: false },
  { icon: '📿', name: '串珠工作台', desc: '即将开放', active: false },
];

const InlineCoin = () => <MeowCoin size={14} className="inline-block" />;

const PRICING = [
  { emoji: '🐾', title: <>按次计费,透明无套路</>, desc: <>充值喵币(7 元 = 1000 <InlineCoin />),GPT-Image-2 生图 9 <InlineCoin />/张、文本 1 <InlineCoin />/次,无隐藏费用。</> },
  { emoji: '🎁', title: <>新用户送 100 <InlineCoin /></>, desc: <>注册即赠体验金,先试后买,满意再充值。</> },
  { emoji: '🤝', title: <>邀请好友各得 100 <InlineCoin /></>, desc: <>分享邀请链接,邀请好友注册双方各得奖励,上限 10 人。</> },
];

const CoinOrEmoji: React.FC<{ emoji: string; size?: number }> = ({ emoji, size = 32 }) =>
  emoji === '🐾' ? <MeowCoin size={size} /> : <span>{emoji}</span>;

const LandingPage: React.FC = () => {
  const [scrollY, setScrollY] = useState(0);
  const [activeSection, setActiveSection] = useState('');

  useEffect(() => {
    const h = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', h, { passive: true });
    return () => window.removeEventListener('scroll', h);
  }, []);

  useEffect(() => {
    const ids = NAV_ITEMS.map((n) => n.id);
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveSection(entry.target.id);
          else setActiveSection((prev) => (prev === entry.target.id ? '' : prev));
        }
      },
      { rootMargin: '-40% 0px -50% 0px', threshold: 0 },
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="min-h-screen bg-surface text-text-primary selection:bg-primary-100 selection:text-primary-900">
      <Navbar
        variant="fixed"
        scrolled={scrollY > 20}
        logoSize={48}
        navLinks={NAV_ITEMS.map((item) => ({
          ...item,
          href: `#${item.id}`,
          onClick: (e: React.MouseEvent) => {
            e.preventDefault();
            document
              .getElementById(item.id)
              ?.scrollIntoView({ behavior: "smooth" });
          },
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
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            灰测进行中 · 凭内测码注册体验
          </div>

          <h1 className="text-5xl md:text-7xl font-black leading-[1.1] tracking-tighter text-text-primary mb-8 px-6">
            你的 AI 设计
            <br />
            <span className="text-text-secondary">工作台矩阵</span>
          </h1>

          <p className="text-lg md:text-xl text-text-secondary max-w-2xl mx-auto leading-relaxed mb-5 font-medium px-6">
            服装、编织、串珠…每个工作台都是一条专属创作流水线。
            按次计费透明公开,作品一键公开到创作者社区。
          </p>

          {/* 生图模型强调 */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-primary-50 to-accent-50 border border-primary-200 mb-10">
            <span className="text-sm font-bold text-primary-600">生图模型</span>
            <span className="text-sm font-black text-text-primary bg-white px-2.5 py-0.5 rounded-full shadow-sm">GPT-Image-2</span>
            <span className="text-xs text-text-tertiary">驱动全系工作台出图</span>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 px-6">
            <Link
              to="/register"
              className="w-full sm:w-auto px-10 py-4 text-lg font-bold bg-primary-500 text-text-inverse rounded-2xl hover:bg-primary-600 transition-all"
            >
              申请内测体验
            </Link>
            <Link
              to="/community"
              className="w-full sm:w-auto px-10 py-4 text-lg font-bold bg-surface-secondary text-text-primary rounded-2xl border border-border-strong hover:bg-surface-tertiary transition-all"
            >
              浏览社区作品
            </Link>
          </div>
        </div>
      </section>

      {/* Highlights */}
      <section className="py-12 border-y border-border bg-surface-secondary/30">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {[
              { label: "生图模型", val: "GPT-Image-2", coin: false },
              { label: "喵币计费", val: "7元=1000", coin: true },
              { label: "生图单价", val: "9 /张", coin: true },
              { label: "新人礼包", val: "100 ", coin: true },
            ].map((s, i) => (
              <div key={i} className="text-center">
                <div className="text-2xl font-black text-text-primary inline-flex items-center gap-1">
                  {s.val}
                  {(s as { coin?: boolean }).coin && <MeowCoin size={20} />}
                </div>
                <div className="text-xs font-bold text-text-tertiary uppercase tracking-widest mt-1">
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Workspaces */}
      <section id="workspaces" className="py-24 md:py-32">
        <div className="max-w-6xl mx-auto px-6">
          <div className="mb-16 text-center">
            <p className="text-sm font-bold text-primary-500 uppercase tracking-widest mb-4">
              工作台
            </p>
            <h2 className="text-4xl md:text-5xl font-black tracking-tight mb-6">
              每条赛道,一条专属流水线
            </h2>
            <p className="text-lg text-text-secondary max-w-2xl mx-auto">
              切换工作台即可进入对应创作模式,各工作台额度通用。
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {WORKSPACES.map((w, i) => (
              <div
                key={i}
                className={`rounded-[24px] border p-6 transition-all ${w.active ? "border-primary-200 bg-primary-50/50 shadow-lg" : "border-border bg-surface opacity-70"}`}
              >
                <div className="text-4xl mb-4">{w.icon}</div>
                <h3 className="text-xl font-black text-text-primary mb-2">
                  {w.name}
                </h3>
                <p className="text-sm text-text-secondary">{w.desc}</p>
                {w.active && (
                  <span className="inline-block mt-4 px-3 py-1 bg-primary-500 text-white text-xs font-bold rounded-full">
                    当前开放
                  </span>
                )}
                {!w.active && (
                  <span className="inline-block mt-4 px-3 py-1 bg-surface-secondary text-text-tertiary text-xs font-bold rounded-full">
                    即将推出
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24 md:py-32 bg-surface-secondary/30">
        <div className="max-w-6xl mx-auto px-6">
          <div className="mb-16 text-center">
            <p className="text-sm font-bold text-secondary-500 uppercase tracking-widest mb-4">
              计费
            </p>
            <h2 className="text-4xl md:text-5xl font-black tracking-tight mb-6">
              透明按次,先试后买
            </h2>
            <p className="text-lg text-text-secondary max-w-2xl mx-auto">
              无月费、无捆绑,按实际用量喵币计费。新用户送 100 <InlineCoin />{" "}
              先体验。
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {PRICING.map((p, i) => (
              <div
                key={i}
                className="rounded-[24px] border border-border bg-surface p-6"
              >
                <div className="text-3xl mb-3">
                  <CoinOrEmoji emoji={p.emoji} />
                </div>
                <h3 className="text-lg font-black text-text-primary mb-2">
                  {p.title}
                </h3>
                <p className="text-sm text-text-secondary">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Community */}
      <section id="community" className="py-24 md:py-32">
        <div className="max-w-6xl mx-auto px-6 text-center">
          <p className="text-sm font-bold text-accent-500 uppercase tracking-widest mb-4">
            社区
          </p>
          <h2 className="text-4xl md:text-5xl font-black tracking-tight mb-6">
            从工作台到舞台
          </h2>
          <p className="text-lg text-text-secondary max-w-2xl mx-auto mb-10">
            将设计作品一键公开,在社区展示、获得反馈,与其他创作者交流灵感。
          </p>
          <Link
            to="/community"
            className="inline-flex items-center gap-2 px-8 py-4 text-lg font-bold bg-accent-500 text-white rounded-2xl hover:bg-accent-600 transition-all"
          >
            <AppIcon symbol="Users" size={20} className="text-white" />
            逛逛社区
          </Link>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 md:py-32 bg-surface-secondary/30">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-4xl md:text-5xl font-black tracking-tight mb-6">
            开始你的创作
          </h2>
          <p className="text-lg text-text-secondary max-w-xl mx-auto mb-10">
            注册即送 100 <InlineCoin />
            ,免费体验 AI 设计工作台的完整能力。
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/register"
              className="w-full sm:w-auto px-10 py-4 text-lg font-bold bg-primary-500 text-text-inverse rounded-2xl hover:bg-primary-600 transition-all"
            >
              免费注册
            </Link>
            <Link
              to="/login"
              className="w-full sm:w-auto px-10 py-4 text-lg font-bold bg-surface text-text-primary rounded-2xl border border-border-strong hover:bg-surface-tertiary transition-all"
            >
              登录
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-6 border-t border-border">
        <div className="mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-2">
          <Link to="/" className="flex items-center gap-2 group cursor-pointer">
            <CatLogo
              size={48}
              className="group-hover:rotate-12 transition-transform"
            />
          </Link>
          <div className="flex items-center gap-6 text-sm text-text-tertiary">
            <Link
              to="/community"
              className="hover:text-text-primary transition-colors"
            >
              社区
            </Link>
            <Link
              to="/login"
              className="hover:text-text-primary transition-colors"
            >
              登录
            </Link>
            <Link
              to="/register"
              className="hover:text-text-primary transition-colors"
            >
              注册
            </Link>
          </div>
          <p className="text-text-tertiary text-xs font-medium">
            © 2026 CuCaTopia.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;

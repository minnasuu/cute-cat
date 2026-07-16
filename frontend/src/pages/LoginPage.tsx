import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import CatLogo from '../components/CatLogo';
import { showToast } from '../components/Toast';
import { AppIcon } from '../components/icons';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// const PIPELINE = [
//   { icon: 'Sparkles', label: '灵感' },
//   { icon: 'Layers', label: '方案' },
//   { icon: 'Pencil', label: '线稿' },
//   { icon: 'Palette', label: '材料' },
//   { icon: 'Image', label: '成图' },
// ] as const;

const FEATURES = [
  {
    icon: 'Shirt',
    title: '专属创作流水线',
    desc: '服装工作台已开放：灵感生图、材料组合、款式裂变，多种设计方式。',
  },
  {
    icon: 'Coins',
    title: '按次透明计费',
    desc: '喵币按用量扣费，无月费捆绑。新用户注册即送体验额度。',
  },
  {
    icon: 'Users',
    title: '作品一键进社区',
    desc: '设计完成后可公开展示，获取反馈，和其他创作者交换灵感。',
  },
] as const;

const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // 切换账号跳转过来会带 ?email=xxx,预填
  useEffect(() => {
    const e = searchParams.get('email');
    if (e) setEmail(e);
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!EMAIL_REGEX.test(email)) { showToast('请输入有效的邮箱地址', 'warning'); return; }
    if (!password) { showToast('请输入密码', 'warning'); return; }
    setLoading(true);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch {
      // apiClient already shows toast with specific error message
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-facade min-h-screen bg-surface text-text-primary selection:bg-primary-100 selection:text-primary-900">
      <div className="min-h-screen grid lg:grid-cols-2">
        {/* ── Brand / mechanism panel（桌面左侧；移动端在表单下方） ── */}
        <aside className="relative order-2 lg:order-1 flex flex-col justify-between overflow-hidden px-8 py-10 md:px-12 lg:px-14 lg:py-12">
          <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
            <div className="absolute inset-0 bg-gradient-to-br from-primary-50 via-surface to-secondary-50/60 dark:from-primary-50/40 dark:via-surface-secondary dark:to-secondary-50/20" />
            <div className="login-orb absolute -top-24 -left-16 h-72 w-72 rounded-full bg-primary-200/50 blur-3xl dark:bg-primary-600/20" />
            <div className="login-orb-delay absolute bottom-0 right-0 h-80 w-80 rounded-full bg-secondary-200/40 blur-3xl dark:bg-secondary-600/15" />
            <div
              className="absolute inset-0 opacity-[0.35] dark:opacity-[0.15]"
              style={{
                backgroundImage:
                  'radial-gradient(circle at 1px 1px, var(--color-border-strong) 1px, transparent 0)',
                backgroundSize: '28px 28px',
              }}
            />
          </div>

          <div className="login-rise hidden lg:block">
            <Link to="/" className="inline-flex items-center gap-3 group">
              <CatLogo size={52} className="group-hover:scale-105 transition-transform" />
              <span className="text-2xl md:text-3xl font-black tracking-tight text-text-primary">
                CuCaTopia
              </span>
            </Link>
          </div>

          <div className="my-4 lg:my-0 max-w-xl login-rise" style={{ animationDelay: '80ms' }}>
            <h1 className="text-3xl md:text-5xl xl:text-[3.4rem] font-black leading-[1.08] tracking-tight text-text-primary">
              AI 设计工作台
              <span className="block mt-1 text-primary-600">从灵感到成图</span>
            </h1>
            <p className="mt-5 text-base md:text-lg text-text-secondary leading-relaxed max-w-md">
              每条创作赛道一条专属流水线。按次计费、先试后买，作品还能一键晒进社区。
            </p>

            {/* Pipeline mechanism */}
            {/* <div className="mt-10" aria-label="创作流水线">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-text-tertiary mb-4">
                创作机制
              </p>
              <div className="flex flex-wrap items-center gap-y-3">
                {PIPELINE.map((step, i) => (
                  <React.Fragment key={step.label}>
                    <div
                      className="login-step flex flex-col items-center gap-2 min-w-[4.25rem]"
                      style={{ animationDelay: `${160 + i * 70}ms` }}
                    >
                      <div className="w-11 h-11 rounded-2xl bg-surface/80 border border-border-strong flex items-center justify-center text-primary-600 shadow-sm backdrop-blur-sm">
                        <AppIcon symbol={step.icon} size={20} />
                      </div>
                      <span className="text-xs font-bold text-text-secondary">{step.label}</span>
                    </div>
                    {i < PIPELINE.length - 1 && (
                      <span className="mx-1.5 mb-5 text-text-tertiary shrink-0" aria-hidden>
                        <AppIcon symbol="ArrowRight" size={14} />
                      </span>
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div> */}

            {/* Feature list */}
            <ul className="mt-10 space-y-5">
              {FEATURES.map((f, i) => (
                <li
                  key={f.title}
                  className="login-rise flex gap-3.5"
                  style={{ animationDelay: `${420 + i * 90}ms` }}
                >
                  <div className="mt-0.5 w-10 h-10 shrink-0 rounded-xl bg-surface border border-border-strong flex items-center justify-center text-secondary-600">
                    <AppIcon symbol={f.icon} size={18} />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-text-primary">{f.title}</h2>
                    <p className="mt-0.5 text-sm text-text-secondary leading-relaxed">{f.desc}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* <p className="lg:hidden mt-8 flex items-center justify-center gap-2 text-xs text-text-tertiary">
            <AppIcon symbol="Cat" size={14} className="text-text-tertiary shrink-0" />
            让可爱的猫猫帮你工作
          </p>
          <p className="hidden lg:flex items-center gap-2 text-xs text-text-tertiary login-rise" style={{ animationDelay: '700ms' }}>
            <AppIcon symbol="Cat" size={14} className="text-text-tertiary shrink-0" />
            让可爱的猫猫帮你工作
          </p> */}
        </aside>

        {/* ── Login panel（移动端优先展示） ── */}
        <main className="order-1 lg:order-2 flex items-center justify-center px-6 py-10 md:px-10 lg:px-16 bg-surface lg:border-l border-border-strong">
          <div className="w-full max-w-md login-rise" style={{ animationDelay: '120ms' }}>
            <div className="lg:hidden mb-8 text-center">
              <Link to="/" className="inline-flex flex-col items-center gap-2 group">
                <CatLogo size={48} className="group-hover:scale-105 transition-transform" />
                <span className="text-xl font-black tracking-tight text-text-primary">CuCaTopia</span>
              </Link>
              <p className="mt-2 text-sm font-medium text-text-secondary">登录以进入你的工作台</p>
            </div>

            <div className="hidden lg:block mb-8">
              <h2 className="text-2xl font-black tracking-tight text-text-primary">欢迎回来</h2>
              <p className="mt-1.5 text-sm text-text-secondary">登录后继续你的创作</p>
            </div>
            <h2 className="lg:hidden text-xl font-semibold text-text-primary mb-6">登录</h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5" htmlFor="login-email">
                  邮箱
                </label>
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  autoComplete="email"
                  className="w-full px-4 py-3 rounded-xl border border-border-strong bg-surface-secondary focus:bg-surface focus:ring-2 focus:ring-primary-400 focus:border-transparent transition-all outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5" htmlFor="login-password">
                  密码
                </label>
                <div className="relative">
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="输入密码"
                    required
                    autoComplete="current-password"
                    className="w-full px-4 py-3 rounded-xl border border-border-strong bg-surface-secondary focus:bg-surface focus:ring-2 focus:ring-primary-400 focus:border-transparent transition-all outline-none pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? '隐藏密码' : '显示密码'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary transition-colors p-1 cursor-pointer"
                  >
                    <AppIcon symbol={showPassword ? 'EyeOff' : 'Eye'} size={18} />
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-gradient-to-r from-primary-500 to-primary-600 text-text-inverse font-semibold rounded-xl hover:from-primary-600 hover:to-primary-700 transition-all disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
              >
                {loading ? '登录中...' : '登录'}
              </button>
            </form>

            <div className="mt-6 flex flex-col items-center gap-3 text-sm">
              <Link to="/forgot-password" className="text-primary-600 hover:text-primary-700">
                忘记密码？
              </Link>
              <p className="text-text-secondary">
                还没有账号？{' '}
                <Link to="/register" className="text-primary-600 hover:text-primary-700 font-medium">
                  免费注册
                </Link>
              </p>
            </div>

            <div className="mt-10 pt-6 border-t border-border flex items-start gap-3 text-xs text-text-tertiary leading-relaxed">
              <AppIcon symbol="Gift" size={16} className="text-secondary-500 shrink-0 mt-0.5" />
              <span>
                新用户注册即送体验喵币，先跑通一条流水线，满意再充值。
              </span>
            </div>
          </div>
        </main>
      </div>

      <style>{`
        @keyframes login-rise {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes login-orb {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(12px, -10px) scale(1.05); }
        }
        @keyframes login-step-in {
          from { opacity: 0; transform: translateY(8px) scale(0.94); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .login-facade .login-rise {
          opacity: 0;
          animation: login-rise 0.7s ease-out forwards;
        }
        .login-facade .login-step {
          opacity: 0;
          animation: login-step-in 0.55s ease-out forwards;
        }
        .login-facade .login-orb {
          animation: login-orb 12s ease-in-out infinite;
        }
        .login-facade .login-orb-delay {
          animation: login-orb 14s ease-in-out infinite reverse;
          animation-delay: -4s;
        }
        @media (prefers-reduced-motion: reduce) {
          .login-facade .login-rise,
          .login-facade .login-step,
          .login-facade .login-orb,
          .login-facade .login-orb-delay {
            animation: none;
            opacity: 1;
            transform: none;
          }
        }
      `}</style>
    </div>
  );
};

export default LoginPage;

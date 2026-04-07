import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import CatLogo from '../components/CatLogo';
import { showToast } from '../components/Toast';
import { AppIcon } from '../components/icons';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

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
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-surface to-secondary-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary-100 mb-4">
            <CatLogo size={48} />
          </div>
        </div>

        {/* Form */}
        <div className="bg-surface rounded-2xl p-8 border border-border-strong">
          <h2 className="text-xl font-semibold text-text-primary mb-6">登录</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">邮箱</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                className="w-full px-4 py-3 rounded-xl border border-border-strong bg-surface-secondary focus:bg-surface focus:ring-2 focus:ring-primary-400 focus:border-transparent transition-all outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">密码</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="输入密码"
                  required
                  className="w-full px-4 py-3 rounded-xl border border-border-strong bg-surface-secondary focus:bg-surface focus:ring-2 focus:ring-primary-400 focus:border-transparent transition-all outline-none pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary transition-colors text-sm select-none"
                >
                  {showPassword ? '隐藏' : '显示'}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-primary-500 to-primary-600 text-text-inverse font-medium rounded-xl hover:from-primary-600 hover:to-primary-700 transition-all disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
            >
              {loading ? '登录中...' : '登录'}
            </button>
          </form>

          <div className="mt-6 text-center space-y-2">
            <Link to="/forgot-password" className="text-sm text-primary-600 hover:text-primary-700">忘记密码？</Link>
            <div className="text-sm text-text-secondary">
              还没有账号？{' '}
              <Link to="/register" className="text-primary-600 hover:text-primary-700 font-medium">免费注册</Link>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-text-tertiary mt-6 flex items-center justify-center gap-1.5">
          让可爱的猫猫帮你工作
          <AppIcon symbol="Cat" size={14} className="text-text-tertiary shrink-0" />
        </p>
      </div>
    </div>
  );
};

export default LoginPage;

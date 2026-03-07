import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { apiClient } from '../utils/apiClient';
import CatLogo from '../components/CatLogo';
import { showToast } from '../components/Toast';

const RegisterPage: React.FC = () => {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [code, setCode] = useState('');
  const [betaCode, setBetaCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [codeLoading, setCodeLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const handleSendCode = async () => {
    if (!email) { showToast('请先输入邮箱', 'warning'); return; }
    setCodeLoading(true);
    try {
      const result = await apiClient.post('/api/auth/send-code', { email, type: 'register' });
      setCodeSent(true);
      if (result.code) setCode(result.code);
      setCountdown(60);
      const timer = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) { clearInterval(timer); return 0; }
          return prev - 1;
        });
      }, 1000);
    } catch {
      // toast shown by apiClient
    } finally {
      setCodeLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) { showToast('密码至少 6 位', 'warning'); return; }
    if (!betaCode.trim()) { showToast('请输入内测码', 'warning'); return; }
    setLoading(true);
    try {
      await register(email, password, nickname, code, betaCode.trim());
      navigate('/dashboard');
    } catch (err: any) {
      showToast(err.message || '注册失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-secondary-50 via-surface to-primary-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-surface shadow-lg mb-4">
            <CatLogo size={48} />
          </div>
          <h1 className="text-3xl font-bold text-text-primary">加入 Cute Cat</h1>
          <p className="text-text-secondary mt-1">创建你的 AI 猫猫团队</p>
        </div>

        {/* Form */}
        <div className="bg-surface rounded-2xl shadow-xl p-8 border border-border">
          <h2 className="text-xl font-semibold text-text-primary mb-6">注册</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <label className="block text-sm font-semibold text-amber-700 mb-1">🔑 内测码</label>
              <input
                type="text"
                value={betaCode}
                onChange={(e) => setBetaCode(e.target.value.toUpperCase())}
                placeholder="请输入内测邀请码"
                required
                className="w-full px-4 py-3 rounded-xl border border-amber-300 bg-white focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all outline-none font-mono tracking-widest text-center text-lg"
              />
              <p className="text-xs text-amber-600 mt-1.5">当前为内测阶段，需要邀请码才能注册</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">昵称</label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="你的昵称"
                required
                className="w-full px-4 py-3 rounded-xl border border-border-strong bg-surface-secondary focus:bg-surface focus:ring-2 focus:ring-secondary-400 focus:border-transparent transition-all outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">邮箱</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                className="w-full px-4 py-3 rounded-xl border border-border-strong bg-surface-secondary focus:bg-surface focus:ring-2 focus:ring-secondary-400 focus:border-transparent transition-all outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">验证码</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="6位验证码"
                  required
                  maxLength={6}
                  className="flex-1 px-4 py-3 rounded-xl border border-border-strong bg-surface-secondary focus:bg-surface focus:ring-2 focus:ring-secondary-400 focus:border-transparent transition-all outline-none"
                />
                <button
                  type="button"
                  onClick={handleSendCode}
                  disabled={codeLoading || countdown > 0}
                  className="px-4 py-3 bg-secondary-100 text-secondary-700 font-medium rounded-xl hover:bg-secondary-200 transition-all disabled:opacity-50 whitespace-nowrap text-sm"
                >
                  {codeLoading ? '...' : countdown > 0 ? `${countdown}s` : codeSent ? '重发' : '获取验证码'}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">密码</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="至少6位密码"
                required
                minLength={6}
                className="w-full px-4 py-3 rounded-xl border border-border-strong bg-surface-secondary focus:bg-surface focus:ring-2 focus:ring-secondary-400 focus:border-transparent transition-all outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-secondary-500 to-secondary-600 text-text-inverse font-medium rounded-xl hover:from-secondary-600 hover:to-secondary-700 transition-all shadow-lg shadow-secondary-200 disabled:opacity-50"
            >
              {loading ? '注册中...' : '加入内测'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <div className="text-sm text-text-secondary">
              已有账号？{' '}
              <Link to="/login" className="text-secondary-600 hover:text-secondary-700 font-medium">去登录</Link>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-text-tertiary mt-6">🧪 内测阶段 · 免费体验全部功能</p>
      </div>
    </div>
  );
};

export default RegisterPage;

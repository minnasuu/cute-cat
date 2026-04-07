import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { apiClient } from '../utils/apiClient';
import CatLogo from '../components/CatLogo';
import { showToast } from '../components/Toast';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const RegisterPage: React.FC = () => {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [nickname, setNickname] = useState('');
  const [code, setCode] = useState('');
  const [betaCode, setBetaCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [codeLoading, setCodeLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [betaRequired, setBetaRequired] = useState(true);

  useEffect(() => {
    apiClient
      .get<{ betaRequired: boolean }>('/api/auth/public-config')
      .then((d) => setBetaRequired(d.betaRequired))
      .catch(() => setBetaRequired(true));
  }, []);

  const handleSendCode = async () => {
    if (!email) { showToast('请先输入邮箱', 'warning'); return; }
    if (!EMAIL_REGEX.test(email)) { showToast('请输入有效的邮箱地址', 'warning'); return; }
    setCodeLoading(true);
    try {
      const result = await apiClient.post('/api/auth/send-code', { email, type: 'register' });
      setCodeSent(true);
      if (result.code) setCode(result.code);
      showToast(result.message || '验证码已发送', 'success');
      setCountdown(60);
      if (countdownRef.current) clearInterval(countdownRef.current);
      countdownRef.current = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) { clearInterval(countdownRef.current!); countdownRef.current = null; return 0; }
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
    if (!nickname.trim()) { showToast('请输入昵称', 'warning'); return; }
    if (!EMAIL_REGEX.test(email)) { showToast('请输入有效的邮箱地址', 'warning'); return; }
    if (!code.trim()) { showToast('请输入验证码', 'warning'); return; }
    if (password.length < 6) { showToast('密码至少 6 位', 'warning'); return; }
    if (password !== confirmPassword) { showToast('两次输入的密码不一致', 'warning'); return; }
    if (betaRequired && !betaCode.trim()) { showToast('请输入邀请码', 'warning'); return; }
    setLoading(true);
    try {
      await register(
        email,
        password,
        nickname.trim(),
        code.trim(),
        betaRequired ? betaCode.trim() : undefined,
      );
      showToast('注册成功，欢迎加入！', 'success');
      navigate('/dashboard');
    } catch {
      // apiClient already shows toast with specific error message
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-secondary-50 via-surface to-primary-50 flex items-center justify-center p-4">
      <div className="w-full max-w-xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-secondary-100 mb-3">
            <CatLogo size={48} />
          </div>
        </div>

        {/* Form */}
        <div className="bg-surface rounded-2xl p-8 border border-border-strong">
          <h2 className="text-xl text-center font-semibold text-text-primary mb-6">注册</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {betaRequired && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <label className="block text-sm font-semibold text-amber-700 mb-1">🔑 内测码</label>
                <input
                  type="text"
                  value={betaCode}
                  onChange={(e) => setBetaCode(e.target.value.toUpperCase())}
                  placeholder="请输入内测邀请码"
                  required={betaRequired}
                  className="w-full px-4 py-3 rounded-xl border border-amber-300 bg-white focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all outline-none font-mono tracking-widest text-center text-lg"
                />
                <p className="text-xs text-amber-600 mt-1.5">当前为内测阶段，需要邀请码才能注册</p>
              </div>
            )}

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

            <div className="flex gap-2">
              <div className='flex-1'>
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

            <div className='flex-1'>
              <label className="block text-sm font-medium text-text-secondary mb-1">验证码</label>
              <p className="text-xs text-text-tertiary mb-1.5">验证码 10 分钟内有效，请填写最新一封邮件中的 6 位数字。</p>
              <div className="relative flex gap-2">
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
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-2 bg-secondary-100 text-secondary-700 font-medium rounded-lg cursor-pointer hover:bg-secondary-200 transition-all disabled:opacity-50 whitespace-nowrap text-sm"
                >
                  {codeLoading ? '...' : countdown > 0 ? `${countdown}s` : codeSent ? '重发' : '获取验证码'}
                </button>
              </div>
            </div>
            </div>

            <div className="flex gap-2">
              <div className='flex-1'>
              <label className="block text-sm font-medium text-text-secondary mb-1">密码</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="至少6位密码"
                  required
                  minLength={6}
                  className="w-full px-4 py-3 rounded-xl border border-border-strong bg-surface-secondary focus:bg-surface focus:ring-2 focus:ring-secondary-400 focus:border-transparent transition-all outline-none pr-12"
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

            <div className='flex-1'>
              <label className="block text-sm font-medium text-text-secondary mb-1">确认密码</label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="再次输入密码"
                  required
                  minLength={6}
                  className={`w-full px-4 py-3 rounded-xl border bg-surface-secondary focus:bg-surface focus:ring-2 focus:ring-secondary-400 focus:border-transparent transition-all outline-none pr-12 ${confirmPassword && confirmPassword !== password ? 'border-red-400' : 'border-border-strong'}`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary transition-colors text-sm select-none"
                >
                  {showConfirmPassword ? '隐藏' : '显示'}
                </button>
              </div>
              {confirmPassword && confirmPassword !== password && (
                <p className="text-xs text-red-500 mt-1">两次输入的密码不一致</p>
              )}
            </div>
            </div>

            <button
              type="submit"
              disabled={loading || (!!confirmPassword && confirmPassword !== password)}
              className="w-full py-3 bg-gradient-to-r from-secondary-500 to-secondary-600 text-text-inverse font-medium rounded-xl hover:from-secondary-600 hover:to-secondary-700 transition-all disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
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
      </div>
    </div>
  );
};

export default RegisterPage;

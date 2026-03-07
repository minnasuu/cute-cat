import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiClient } from '../utils/apiClient';
import { showToast } from '../components/Toast';

const ForgotPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<'email' | 'reset'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const handleSendCode = async () => {
    if (!email) { showToast('请输入邮箱', 'warning'); return; }
    setLoading(true);
    try {
      const result = await apiClient.post('/api/auth/send-code', { email, type: 'reset_password' });
      if (result.code) setCode(result.code);
      setStep('reset');
      setCountdown(60);
      const timer = setInterval(() => {
        setCountdown(prev => { if (prev <= 1) { clearInterval(timer); return 0; } return prev - 1; });
      }, 1000);
    } catch {
      // toast shown by apiClient
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) { showToast('密码至少 6 位', 'warning'); return; }
    setLoading(true);
    try {
      await apiClient.post('/api/auth/reset-password', { email, password, code });
      showToast('密码重置成功', 'success');
      navigate('/login');
    } catch {
      // toast shown by apiClient
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-accent-50 via-surface to-primary-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-text-primary">重置密码</h1>
          <p className="text-text-secondary mt-1">通过邮箱验证码重置密码</p>
        </div>

        <div className="bg-surface rounded-2xl shadow-xl p-8 border border-border">
          {step === 'email' ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">注册邮箱</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your@email.com" className="w-full px-4 py-3 rounded-xl border border-border-strong bg-surface-secondary focus:bg-surface focus:ring-2 focus:ring-accent-400 focus:border-transparent transition-all outline-none" />
              </div>
              <button onClick={handleSendCode} disabled={loading} className="w-full py-3 bg-gradient-to-r from-accent-500 to-accent-600 text-text-inverse font-medium rounded-xl hover:from-accent-600 hover:to-accent-700 transition-all shadow-lg shadow-accent-200 disabled:opacity-50">
                {loading ? '发送中...' : '发送验证码'}
              </button>
            </div>
          ) : (
            <form onSubmit={handleReset} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">验证码</label>
                <input type="text" value={code} onChange={(e) => setCode(e.target.value)} placeholder="6位验证码" required maxLength={6} className="w-full px-4 py-3 rounded-xl border border-border-strong bg-surface-secondary focus:bg-surface focus:ring-2 focus:ring-accent-400 focus:border-transparent transition-all outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">新密码</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="至少6位" required minLength={6} className="w-full px-4 py-3 rounded-xl border border-border-strong bg-surface-secondary focus:bg-surface focus:ring-2 focus:ring-accent-400 focus:border-transparent transition-all outline-none" />
              </div>
              <button type="submit" disabled={loading} className="w-full py-3 bg-gradient-to-r from-accent-500 to-accent-600 text-text-inverse font-medium rounded-xl hover:from-accent-600 hover:to-accent-700 transition-all shadow-lg shadow-accent-200 disabled:opacity-50">
                {loading ? '重置中...' : '重置密码'}
              </button>
              <button type="button" onClick={handleSendCode} disabled={countdown > 0} className="w-full py-2 text-sm text-accent-600 hover:text-accent-700 disabled:text-text-tertiary">
                {countdown > 0 ? `${countdown}s 后重新发送` : '重新发送验证码'}
              </button>
            </form>
          )}

          <div className="mt-6 text-center">
            <Link to="/login" className="text-sm text-text-secondary hover:text-text-primary">返回登录</Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;

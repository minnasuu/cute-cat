import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { apiClient } from '../utils/apiClient';
import { setOnAiUsageUpdate, setGetCurrentUserEmail } from '../utils/backendClient';

export interface User {
  id: string;
  email: string;
  nickname: string;
  avatar?: string;
  plan: string;
  aiQuota?: number;
  aiUsed?: number;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, nickname: string, code: string, betaCode?: string) => Promise<void>;
  logout: () => void;
  updateUser: (data: Partial<User>) => void;
  /** 更新 AI 用量（由 AI 调用响应触发） */
  updateAiUsage: (aiUsed: number, aiQuota?: number) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // On mount, check for saved token and fetch user
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      apiClient.get('/api/auth/me')
        .then(data => setUser(data))
        .catch(() => {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiClient.post('/api/auth/login', { email, password });
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    setUser(data.user);
  }, []);

  const register = useCallback(async (email: string, password: string, nickname: string, code: string, betaCode?: string) => {
    const data = await apiClient.post('/api/auth/register', { email, password, nickname, code, betaCode });
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    setUser(data.user);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    setUser(null);
  }, []);

  const updateUser = useCallback((data: Partial<User>) => {
    setUser(prev => prev ? { ...prev, ...data } : null);
  }, []);

  const updateAiUsage = useCallback((aiUsed: number, aiQuota?: number) => {
    setUser(prev => prev ? { ...prev, aiUsed, ...(aiQuota !== undefined ? { aiQuota } : {}) } : null);
  }, []);

  // 注册全局回调：AI 调用后自动同步用量到 context
  useEffect(() => {
    setOnAiUsageUpdate(updateAiUsage);
    return () => setOnAiUsageUpdate(null);
  }, [updateAiUsage]);

  // 注册全局获取当前用户邮箱
  useEffect(() => {
    setGetCurrentUserEmail(() => user?.email ?? null);
    return () => setGetCurrentUserEmail(null);
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateUser, updateAiUsage }}>
      {children}
    </AuthContext.Provider>
  );
};

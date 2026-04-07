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

/** 管理员邮箱白名单 */
const ADMIN_EMAILS = ['minhansu508@gmail.com'];

interface AuthContextType {
  user: User | null;
  loading: boolean;
  /** 当前用户是否为管理员 */
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, nickname: string, code: string, betaCode?: string) => Promise<void>;
  logout: () => Promise<void>;
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
  const isAdmin = ADMIN_EMAILS.includes(user?.email ?? '');

  useEffect(() => {
    apiClient
      .get<User>('/api/auth/me')
      .then((data) => setUser(data))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiClient.post<{ user: User }>('/api/auth/login', { email, password });
    setUser(data.user);
  }, []);

  const register = useCallback(async (email: string, password: string, nickname: string, code: string, betaCode?: string) => {
    const data = await apiClient.post<{ user: User }>('/api/auth/register', { email, password, nickname, code, betaCode });
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiClient.post('/api/auth/logout');
    } catch {
      /* ignore */
    }
    setUser(null);
  }, []);

  const updateUser = useCallback((data: Partial<User>) => {
    setUser((prev) => (prev ? { ...prev, ...data } : null));
  }, []);

  const updateAiUsage = useCallback((aiUsed: number, aiQuota?: number) => {
    setUser((prev) =>
      prev ? { ...prev, aiUsed, ...(aiQuota !== undefined ? { aiQuota } : {}) } : null,
    );
  }, []);

  useEffect(() => {
    setOnAiUsageUpdate(updateAiUsage);
    return () => setOnAiUsageUpdate(null);
  }, [updateAiUsage]);

  useEffect(() => {
    setGetCurrentUserEmail(() => user?.email ?? null);
    return () => setGetCurrentUserEmail(null);
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, loading, isAdmin, login, register, logout, updateUser, updateAiUsage }}>
      {children}
    </AuthContext.Provider>
  );
};

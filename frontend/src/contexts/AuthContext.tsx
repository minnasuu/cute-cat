import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { apiClient } from '../utils/apiClient';
import { setOnAiUsageUpdate, setGetCurrentUserEmail } from '../utils/backendClient';

export interface User {
  id: string;
  email: string;
  nickname: string;
  avatar?: string;
  plan?: string;
  aiQuota?: number;   // legacy
  aiUsed?: number;    // legacy
  /** 用户角色: admin / member(会员/充值用户) / user(普通用户) */
  role: 'admin' | 'member' | 'user';
  /** 喵币余额(7 元 = 1000 喵币) */
  coins: number;
  /** 个人邀请码 */
  inviteCode?: string;
  /** 已邀请成功人数 */
  inviteCount?: number;
  invitedById?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  /** 当前用户是否为管理员 */
  isAdmin: boolean;
  /** 当前用户是否为会员(充值用户) */
  isMember: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, nickname: string, code: string, betaCode?: string, inviteCode?: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (data: Partial<User>) => void;
  /** 更新 AI 用量（由 AI 调用响应触发,legacy） */
  updateAiUsage: (aiUsed: number, aiQuota?: number) => void;
  /** 更新喵币余额 */
  updateCoins: (coins: number) => void;
  /** 刷新当前用户(从 /me 拉最新) */
  refreshUser: () => Promise<void>;
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
  const isAdmin = user?.role === 'admin';
  const isMember = user?.role === 'member' || user?.role === 'admin';

  const refreshUser = useCallback(async () => {
    try {
      const data = await apiClient.get<User>('/api/auth/me');
      setUser(data);
    } catch {
      /* ignore */
    }
  }, []);

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

  const register = useCallback(async (email: string, password: string, nickname: string, code: string, betaCode?: string, inviteCode?: string) => {
    const data = await apiClient.post<{ user: User }>('/api/auth/register', { email, password, nickname, code, betaCode, inviteCode });
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

  const updateCoins = useCallback((coins: number) => {
    setUser((prev) => (prev ? { ...prev, coins } : null));
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
    <AuthContext.Provider value={{ user, loading, isAdmin, isMember, login, register, logout, updateUser, updateAiUsage, updateCoins, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

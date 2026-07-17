// @ts-nocheck
/**
 * useStyleMutateTour —— 款式裂变新手引导流程控制器。
 *
 * 流程:
 *   输入名称 → 选择品类 → 添加母款 → 勾选裂变轴 → 生成 → 查看结果
 *
 * 使用管理员指定 productId 的真实生成结果作为演示,不调用 AI 生图。
 * 引导完成后清除演示数据,写服务端 onboardingDone 标记(与灵感/材料组合引导共用字段)。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../../contexts/AuthContext";
import { apiClient } from "../../../utils/apiClient";

const DEMO_PRODUCT_ID = '987a1baf-e961-4c97-b834-0eafd9dc8baf';
const TOUR_DONE_KEY = 'style-mutate:tour-done';

export interface StyleMutateDemoData {
  name: string;
  description: string;
  plan: string;
  lineartUrl: string | null;
  finalUrl: string | null;
  recommendation: any;
  imageUrls: string[];
  mode: string;
}

export function fetchStyleMutateTourDemo(): Promise<StyleMutateDemoData | null> {
  return apiClient.get<StyleMutateDemoData>(`/api/auth/tour-demo?productId=${DEMO_PRODUCT_ID}`).catch(() => null);
}

/** 是否已完成引导:优先读服务端状态(换浏览器也不丢),localStorage 仅作短期缓存兜底 */
export function isTourDone(user: { onboardingDone?: boolean } | null): boolean {
  if (user?.onboardingDone) return true;
  return localStorage.getItem(TOUR_DONE_KEY) === '1';
}

interface TourArgs {
  setName: (v: string) => void;
  setDescription: (v: string) => void;
  setCategory: (c: any) => void;
  setMother: (m: any) => void;
  setSelected: (s: any) => void;
  setCustomMutations: (m: any) => void;
  setBatch: (b: any) => void;
  setSelectedMutations: (m: any) => void;
}

export function useStyleMutateTour(args: TourArgs) {
  const { user, updateUser } = useAuth();
  const { setName, setDescription, setCategory, setMother, setSelected, setCustomMutations, setBatch } = args;

  const [tourActive, setTourActive] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const [demo, setDemo] = useState<StyleMutateDemoData | null>(null);
  const [demoLoading, setDemoLoading] = useState(false);

  const totalSteps = 6;

  const shouldRegister = !isTourDone(user);

  const clearTimer = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  }, []);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearDemo = useCallback(() => {
    setName('');
    setDescription('');
    setCategory('');
    setMother(null);
    setSelected(new Set());
    setCustomMutations([]);
    setBatch(null);
  }, [setName, setDescription, setCategory, setMother, setSelected, setCustomMutations, setBatch]);

  const startTour = useCallback(async () => {
    setDemoLoading(true);
    try {
      const data = await fetchStyleMutateTourDemo();
      setDemo(data);
      setName(data?.name || '');
      setDescription(data?.description || '');
      setCategory('top'); // 默认上衣品类
      // 用演示图片作母款
      if (data?.imageUrls?.[0]) {
        setMother({
          kind: 'library-style',
          id: 'tour-mother',
          styleId: 'demo',
          name: '演示母款',
          url: data.imageUrls[0],
        });
      }
    } catch {
      setDemo(null);
    } finally {
      setDemoLoading(false);
    }
    setTourStep(0);
    setTourActive(true);
  }, [setName, setDescription, setCategory, setMother]);

  const advance = useCallback(() => {
    if (tourStep >= totalSteps - 1) {
      complete();
      return;
    }
    const step = tourStep;
    // 第 4 步(生成):模拟批次结果
    if (step === 4 && demo?.imageUrls?.length) {
      setBatch({
        batchId: 'tour-demo',
        status: 'done',
        mode: 'batch',
        total: demo.imageUrls.length,
        completed: demo.imageUrls.length,
        failed: 0,
        items: demo.imageUrls.slice(1).map((url, i) => ({
          mi: i,
          label: `裂变选项${i + 1}`,
          url,
          status: 'done',
        })),
        mutations: [],
        mother: { url: demo.imageUrls[0], name: '演示母款' },
      });
    }
    // 第 3 步(勾选裂变轴):默认勾几个
    if (step === 2) {
      setSelected(new Set(['silhouette-slim', 'sleeve-short']));
    }
    setTourStep((s) => s + 1);
  }, [tourStep, totalSteps, demo, setBatch, setSelected]);

  const complete = useCallback(() => {
    localStorage.setItem(TOUR_DONE_KEY, '1');
    apiClient.put('/api/auth/profile', { onboardingDone: true }).catch(() => {});
    updateUser({ onboardingDone: true });
    clearDemo();
    clearTimer();
    setTourActive(false);
    setTourStep(0);
  }, [clearDemo, clearTimer, updateUser]);

  const skip = useCallback(() => {
    clearDemo();
    clearTimer();
    setTourActive(false);
    setTourStep(0);
  }, [clearDemo, clearTimer]);

  const prev = useCallback(() => {
    setTourStep((s) => Math.max(0, s - 1));
  }, []);

  useEffect(() => () => clearTimer(), [clearTimer]);

  return useMemo(() => ({
    tourActive, tourStep, totalSteps, shouldRegister, demo, demoLoading,
    startTour, next: advance, prev, skip, complete,
  }), [tourActive, tourStep, totalSteps, shouldRegister, demo, demoLoading, startTour, advance, prev, skip, complete]);
}

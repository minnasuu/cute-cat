// @ts-nocheck
/**
 * useMaterialComboTour —— 材料组合新手引导流程控制器。
 *
 * 流程:
 *   叉乘模式:选名称 → 添加面料 → 添加款式 → 生成 → 查看结果
 *   拼色模式:选名称 → 添加多面料(单款式) → 生成 → 查看结果
 *
 * 使用管理员指定 productId 的真实生成结果作为演示,不调用 AI 生图。
 * 引导完成后清除演示数据,写服务端 onboardingDone 标记(与灵感引导复用同一字段)。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../../contexts/AuthContext";
import { apiClient } from "../../../utils/apiClient";

/** 叉乘演示 productId */
const CROSS_DEMO_PRODUCT_ID = '3e7d1f30-6776-4d50-9a2a-24dc0530ed80';
/** 拼色演示 productId */
const COLOR_MIX_DEMO_PRODUCT_ID = '9534b0fb-aa69-445d-9b67-e1ea90bcec49';

const TOUR_DONE_KEY = 'material-combo:tour-done';

export interface TourDemoData {
  name: string;
  description: string;
  plan: string;
  lineartUrl: string | null;
  finalUrl: string | null;
  recommendation: any;
  imageUrls: string[];
  mode: string;
}

export type ComboMode = 'cross' | 'color-mix';

export function fetchMaterialComboTourDemo(mode: ComboMode): Promise<TourDemoData | null> {
  const productId = mode === 'cross' ? CROSS_DEMO_PRODUCT_ID : COLOR_MIX_DEMO_PRODUCT_ID;
  return apiClient.get<TourDemoData>(`/api/auth/tour-demo?productId=${productId}`).catch(() => null);
}

/** 是否已完成引导:优先读服务端状态(换浏览器也不丢),localStorage 仅作短期缓存兜底 */
export function isTourDone(user: { onboardingDone?: boolean } | null): boolean {
  if (user?.onboardingDone) return true;
  return localStorage.getItem(TOUR_DONE_KEY) === '1';
}

export function useMaterialComboTour(args: {
  mode: ComboMode;
  setName: (v: string) => void;
  setDescription: (v: string) => void;
  setFabricRows: (fn: (prev: any[]) => any[]) => void;
  setStyleRows: (fn: (prev: any[]) => any[]) => void;
  setBatch: (b: any) => void;
  switchMode: (m: ComboMode) => void;
}) {
  const { user, updateUser } = useAuth();
  const { mode, setName, setDescription, setFabricRows, setStyleRows, setBatch, switchMode } = args;

  const [tourActive, setTourActive] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const [demo, setDemo] = useState<TourDemoData | null>(null);
  const [demoLoading, setDemoLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // TODO:重新启用新手引导时恢复为 !isTourDone(user)
  const shouldRegister = false;

  // 叉乘 6 步;拼色 5 步
  const totalSteps = mode === 'color-mix' ? 5 : 6;

  const clearTimer = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  }, []);

  // 清除演示数据
  const clearDemo = useCallback(() => {
    setName('');
    setDescription('');
    setFabricRows(() => []);
    setStyleRows(() => []);
    setBatch(null);
  }, [setName, setDescription, setFabricRows, setStyleRows, setBatch]);

  // 启动引导
  const startTour = useCallback(async () => {
    setDemoLoading(true);
    try {
      const data = await fetchMaterialComboTourDemo(mode);
      setDemo(data);
      setName(data?.name || '');
      setDescription(data?.description || '');
      // 模拟:用演示图片填充面料/款式槽位(仅展示,不实际调用 AI)
      if (data?.imageUrls?.length) {
        const urls = data.imageUrls;
        // 第一张作款式,其余作面料
        setStyleRows(() => [{
          kind: 'library-style',
          id: 'tour-style-1',
          styleId: 'demo',
          name: '演示款式',
          url: urls[0],
        }]);
        setFabricRows(() => urls.slice(1).map((url, i) => ({
          kind: 'library-fabric',
          id: `tour-fabric-${i}`,
          matId: 'demo',
          colorIdx: i,
          name: `演示面料${i + 1}`,
          url,
        })));
      }
    } catch {
      setDemo(null);
    } finally {
      setDemoLoading(false);
    }
    setTourStep(0);
    setTourActive(true);
  }, [mode, setName, setDescription, setFabricRows, setStyleRows]);

  // 下一步
  const advance = useCallback(() => {
    if (tourStep >= totalSteps - 1) {
      complete();
      return;
    }
    const step = tourStep;
    // 最后一步前模拟生成结果
    if (step === totalSteps - 2 && demo?.imageUrls?.length) {
      // 模拟批次结果
      setBatch({
        batchId: 'tour-demo',
        status: 'done',
        mode,
        total: 1,
        completed: 1,
        failed: 0,
        items: [{ fi: 0, si: 0, url: demo.imageUrls[0], status: 'done' }],
        fabrics: demo.imageUrls.slice(1).map((url, i) => ({ url, name: `演示面料${i + 1}`, text: '' })),
        styles: [{ url: demo.imageUrls[0], name: '演示款式', text: '' }],
      });
    }
    setTourStep((s) => s + 1);
  }, [tourStep, totalSteps, demo, mode, setBatch]);

  // 完成引导
  const complete = useCallback(() => {
    localStorage.setItem(TOUR_DONE_KEY, '1');
    apiClient.put('/api/auth/profile', { onboardingDone: true }).catch(() => {});
    updateUser({ onboardingDone: true });
    clearDemo();
    clearTimer();
    setTourActive(false);
    setTourStep(0);
  }, [clearDemo, clearTimer, updateUser]);

  // 跳过引导
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

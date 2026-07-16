// @ts-nocheck
/**
 * useTourController —— 灵感扩散新手引导流程控制器。
 *
 * 职责:
 *   - 维护引导状态(tourActive / tourStep)
 *   - 暴露 startTour / next / prev / skip / complete
 *   - 把「下一步」动作映射到各步的演示生成(使用管理员真实生成结果,不调用 AI)
 *   - 引导启动时自动拉取演示素材并填入真实内容
 *
 * 仅 mode === 'single' 时注册,完成后写服务端 onboardingDone 标记不再自动触发。
 * 跳过引导不写标记,下次进入仍自动触发,但演示数据会被清除。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DesignStage } from "../pages/Composer";
import type { MaterialRecommendation } from "../types/design";
import type { GeneratedImage } from "../pages/image-card";
import { useAuth } from "../../../contexts/AuthContext";
import { apiClient } from "../../../utils/apiClient";

/** 演示素材(从管理员用户的真实生成结果拉取,避免引导时调用 AI) */
export interface TourDemoData {
  name: string;
  description: string;
  plan: string;
  lineartUrl: string | null;
  finalUrl: string | null;
  recommendation: MaterialRecommendation | null;
}

/** 拉取演示素材(首次加载/启动引导时调用) */
export async function fetchTourDemo(): Promise<TourDemoData | null> {
  try {
    const data = await apiClient.get<TourDemoData>("/api/auth/tour-demo");
    return data || null;
  } catch {
    return null;
  }
}

/** 是否已完成引导:优先读服务端状态(换浏览器也不丢),localStorage 仅作短期缓存兜底 */
export function isTourDone(user: { onboardingDone?: boolean } | null): boolean {
  if (user?.onboardingDone) return true;
  return localStorage.getItem(TOUR_DONE_KEY) === "1";
}

interface TourControllerArgs {
  mode: DesignModeLike;
  setStage: (s: DesignStage | ((cur: DesignStage) => DesignStage)) => void;
  setPlanText: (s: string) => void;
  setImages: (fn: (prev: GeneratedImage[]) => GeneratedImage[]) => void;
  setRecommendation: (r: MaterialRecommendation) => void;
  setDesignName: (v: string) => void;
  setDescription: (v: string) => void;
}

type DesignModeLike = string;

export function useTourController(args: TourControllerArgs) {
  const {
    mode, setStage, setPlanText, setImages, setRecommendation,
    setDesignName, setDescription,
  } = args;
  const { user, updateUser } = useAuth();

  const [tourActive, setTourActive] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  /** 当前步是否正在执行异步演示(锁住「下一步」防重复点) */
  const [tourBusy, setTourBusy] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 演示素材(管理员真实生成结果) */
  const [demo, setDemo] = useState<TourDemoData | null>(null);
  const [demoLoading, setDemoLoading] = useState(false);

  // 仅 single 模式 + 未完成过 → 注册自动触发候选
  const shouldRegister = mode === "single" && !isTourDone(user);

  const totalSteps = 7;

  /** 清理进行中的定时器 */
  const clearTimer = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  }, []);

  /** 清除所有演示填入的内容 */
  const clearDemo = useCallback(() => {
    setPlanText("");
    setImages(() => []);
    setRecommendation(null);
    setDesignName("");
    setDescription("");
  }, [setPlanText, setImages, setRecommendation, setDesignName, setDescription]);

  /** 跳过引导:只关闭,不写标记,下次进入仍自动触发,但需清除演示数据 */
  const skip = useCallback(() => {
    clearDemo();
    clearTimer();
    setTourActive(false);
    setTourStep(0);
    setTourBusy(false);
  }, [clearTimer, clearDemo]);

  /** 完成引导:关闭 + 写服务端状态(换浏览器也不丢) + localStorage 兜底 + 清除演示数据 */
  const complete = useCallback(() => {
    localStorage.setItem(TOUR_DONE_KEY, "1");
    // 同步到服务端(失败不阻塞引导流程,下次进入仍会尝试)
    apiClient.put("/api/auth/profile", { onboardingDone: true }).catch(() => {});
    updateUser({ onboardingDone: true });
    clearDemo();
    clearTimer();
    setTourActive(false);
    setTourStep(0);
    setTourBusy(false);
  }, [clearTimer, updateUser]);

  /** 上一步 */
  const prev = useCallback(() => {
    setTourStep((s) => Math.max(0, s - 1));
  }, []);

  /**
   * 下一步:先执行当前步的「推进动作」(如有),再步进。
   * 全程使用管理员真实生成结果作为演示,不调用 AI 生图。
   * 推进动作映射:
   *   步 0,1,2: 纯高亮,无动作
   *   步 3: 展示真实方案文案 → stage=proposal
   *   步 4: 展示真实线稿(模拟 1.5s 加载) → stage=presenting-lineart
   *   步 5: 展示真实材质推荐 → stage=material-recommend
   *   步 6: 展示真实终稿(模拟 1.5s 加载) → stage=presenting → complete
   */
  const advance = useCallback(() => {
    if (tourBusy) return;
    const step = tourStep;
    if (step === 3) {
      // 展示真实方案文案
      setPlanText(demo?.plan || "");
      setStage("proposal");
      setTourStep((s) => s + 1);
      return;
    }
    if (step === 4) {
      // 展示真实线稿(模拟加载 1.5s)
      setTourBusy(true);
      setStage("generating-lineart");
      timerRef.current = setTimeout(() => {
        const url = demo?.lineartUrl;
        if (url) {
          setImages(() => ([{ slot: "lineart", label: "设计线稿", url }]));
        }
        setStage("presenting-lineart");
        setTourBusy(false);
        setTourStep((s) => s + 1);
      }, 1500);
      return;
    }
    if (step === 5) {
      // 展示真实材质推荐
      if (demo?.recommendation) {
        setRecommendation(demo.recommendation);
      }
      setStage("material-recommend");
      setTourStep((s) => s + 1);
      return;
    }
    if (step === 6) {
      // 展示真实终稿(模拟加载 1.5s) + 完成引导
      setTourBusy(true);
      setStage("generating-final");
      timerRef.current = setTimeout(() => {
        const url = demo?.finalUrl;
        if (url) {
          setImages((prev) => [
            ...prev,
            { slot: "final", label: "最终成图", url },
          ]);
        }
        setStage("presenting");
        setTourBusy(false);
        complete();
      }, 1500);
      return;
    }
    // 步 0,1,2: 纯步进
    setTourStep((s) => Math.min(totalSteps - 1, s + 1));
  }, [tourStep, tourBusy, demo, setPlanText, setStage, setImages, setRecommendation, complete]);

  /** 启动引导:拉取演示素材 + 填入真实名称/描述 + 复位状态 */
  const startTour = useCallback(async () => {
    setDemoLoading(true);
    try {
      const data = await fetchTourDemo();
      setDemo(data);
      // 填入真实名称/描述(若接口返回了的话)
      setDesignName(data?.name || "");
      setDescription(data?.description || "");
    } catch {
      setDemo(null);
    } finally {
      setDemoLoading(false);
    }
    setPlanText("");
    setImages(() => []);
    setRecommendation(null);
    setStage("greeting");
    setTourStep(0);
    setTourBusy(false);
    setTourActive(true);
  }, [setDesignName, setDescription, setPlanText, setImages, setRecommendation, setStage]);

  // 卸载时清理定时器
  useEffect(() => () => clearTimer(), [clearTimer]);

  return useMemo(() => ({
    tourActive, tourStep, tourBusy, totalSteps, shouldRegister, demo, demoLoading,
    startTour, next: advance, prev, skip, complete,
  }), [tourActive, tourStep, tourBusy, shouldRegister, demo, demoLoading, startTour, advance, prev, skip, complete]);
}

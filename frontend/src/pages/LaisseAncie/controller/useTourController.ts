// @ts-nocheck
/**
 * useTourController —— 灵感扩散新手引导流程控制器。
 *
 * 职责:
 *   - 维护引导状态(tourActive / tourStep)
 *   - 暴露 startTour / next / prev / skip / complete
 *   - 把「下一步」动作映射到各步的模拟生成(前端 mock,不调用真实 AI)
 *   - 引导启动时自动填入示例内容
 *
 * 仅 mode === 'single' 时注册,完成后写 localStorage 标记不再自动触发。
 * 跳过引导不写标记,下次进入仍自动触发。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DesignStage } from "../pages/Composer";
import type { MaterialRecommendation } from "../types/design";
import type { GeneratedImage } from "../pages/image-card";

/** 本地存储 key:是否已完成引导 */
const TOUR_DONE_KEY = "laisse-ancie:tour-done";

/** 模拟生成的 SVG 占位图(浅色底 + 灰线 + 主色点缀,避免依赖外网/后端) */
const MOCK_LINEART = "data:image/svg+xml;utf8," + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
    <rect width="400" height="400" fill="#f8fafc"/>
    <path d="M200 60 C160 60 140 100 140 140 C140 170 155 185 165 200 L165 200 L120 320 L280 320 L235 200 C245 185 260 170 260 140 C260 100 240 60 200 60 Z" fill="none" stroke="#94a3b8" stroke-width="2"/>
    <path d="M165 200 L235 200" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="4 3"/>
    <ellipse cx="200" cy="105" rx="28" ry="32" fill="none" stroke="#3ed475" stroke-width="1.5" stroke-dasharray="2 4"/>
    <text x="200" y="365" text-anchor="middle" font-family="system-ui" font-size="13" fill="#64748b">设计线稿 · 演示</text>
  </svg>`
);

const MOCK_FINAL = "data:image/svg+xml;utf8," + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#3ed475" stop-opacity="0.15"/>
        <stop offset="1" stop-color="#2ce2e8" stop-opacity="0.15"/>
      </linearGradient>
    </defs>
    <rect width="400" height="400" fill="url(#g)"/>
    <path d="M200 50 C155 50 130 95 130 140 C130 175 148 192 160 210 L110 330 L290 330 L240 210 C252 192 270 175 270 140 C270 95 245 50 200 50 Z" fill="#fef3c7" stroke="#92400e" stroke-width="2"/>
    <circle cx="180" cy="150" r="6" fill="#3ed475"/>
    <circle cx="215" cy="130" r="5" fill="#2ce2e8"/>
    <circle cx="165" cy="180" r="4" fill="#f59e0b"/>
    <circle cx="230" cy="175" r="5" fill="#ec4899"/>
    <path d="M155 240 Q200 225 245 240" stroke="#92400e" stroke-width="1.5" fill="none"/>
    <text x="200" y="370" text-anchor="middle" font-family="system-ui" font-size="13" fill="#64748b">最终成图 · 演示</text>
  </svg>`
);

/** mock 企划方案文本 */
const MOCK_PLAN = `🌸 **春日雏菊连衣裙企划方案**

**核心概念**:
以春日田野的雏菊为灵感，打造一条温柔复古的少女连衣裙，融合法式田园与现代都市的日常穿着场景。

**设计亮点**:
- **廓形**: 复古小方口领 + 泡泡袖 + A 字大裙摆，收腰设计修饰比例
- **图案**: 清新雏菊碎花满铺，底色米白，花色以嫩黄+草绿点缀
- **材质**: 首选 100% 纯棉府绸，触感柔滑、透气舒适
- **细节**: 领口与袖口做荷叶边工艺，后背隐藏拉链

**目标人群**: 18-28 岁年轻女性，日常约会、郊游、咖啡探店等轻休闲场景`;

/** mock 材质推荐 */
const MOCK_RECOMMENDATION: MaterialRecommendation = {
  name: "100% 纯棉府绸",
  category: "面料",
  texture: "柔滑细腻，略带丝光感",
  composition: "100% 棉",
  finish: "半漂白轻水洗",
  colors: ["#FDFBF5", "#F6E27F", "#84A98C", "#F2D0A4"],
  reason: "契合春日田园主题,纯棉透气亲肤,A 字裙摆需要府绸的微挺括度来撑起廓形,米白/嫩黄/草绿呼应雏菊花色。",
};

export function isTourDone(): boolean {
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

  const [tourActive, setTourActive] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  /** 当前步是否正在执行异步模拟(锁住「下一步」防重复点) */
  const [tourBusy, setTourBusy] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 仅 single 模式 + 未完成过 → 注册自动触发候选
  const shouldRegister = mode === "single" && !isTourDone();

  const totalSteps = 7;

  /** 清理进行中的定时器 */
  const clearTimer = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  }, []);

  /** 跳过引导:只关闭,不写标记,下次进入仍自动触发 */
  const skip = useCallback(() => {
    clearTimer();
    setTourActive(false);
    setTourStep(0);
    setTourBusy(false);
  }, [clearTimer]);

  /** 完成引导:关闭 + 写 localStorage 标记 */
  const complete = useCallback(() => {
    localStorage.setItem(TOUR_DONE_KEY, "1");
    clearTimer();
    setTourActive(false);
    setTourStep(0);
    setTourBusy(false);
  }, [clearTimer]);

  /** 上一步 */
  const prev = useCallback(() => {
    setTourStep((s) => Math.max(0, s - 1));
  }, []);

  /**
   * 下一步:先执行当前步的「推进动作」(如有),再步进。
   * 推进动作映射:
   *   步 0,1,2: 纯高亮,无动作
   *   步 3: mock 生成方案 → stage=proposal
   *   步 4: mock 生成线稿(3s) → stage=presenting-lineart
   *   步 5: mock 推荐材质 → stage=material-recommend
   *   步 6: mock 生成终稿(3s) → stage=presenting → complete
   */
  const advance = useCallback(() => {
    if (tourBusy) return;
    const step = tourStep;
    if (step === 3) {
      // 生成方案
      setPlanText(MOCK_PLAN);
      setStage("proposal");
      setTourStep((s) => s + 1);
      return;
    }
    if (step === 4) {
      // 模拟生成线稿(3s)
      setTourBusy(true);
      setStage("generating-lineart");
      timerRef.current = setTimeout(() => {
        setImages(() => ([{ slot: "lineart", label: "设计线稿", url: MOCK_LINEART }]));
        setStage("presenting-lineart");
        setTourBusy(false);
        setTourStep((s) => s + 1);
      }, 3000);
      return;
    }
    if (step === 5) {
      // 推荐材质
      setRecommendation(MOCK_RECOMMENDATION);
      setStage("material-recommend");
      setTourStep((s) => s + 1);
      return;
    }
    if (step === 6) {
      // 模拟生成终稿(3s) + 完成引导
      setTourBusy(true);
      setStage("generating-final");
      timerRef.current = setTimeout(() => {
        setImages((prev) => [
          ...prev,
          { slot: "final", label: "最终成图", url: MOCK_FINAL },
        ]);
        setStage("presenting");
        setTourBusy(false);
        complete();
      }, 3000);
      return;
    }
    // 步 0,1,2: 纯步进
    setTourStep((s) => Math.min(totalSteps - 1, s + 1));
  }, [tourStep, tourBusy, setPlanText, setStage, setImages, setRecommendation, complete]);

  /** 启动引导:自动填入示例 + 复位状态(幂等,清空可能的残留产物) */
  const startTour = useCallback(() => {
    setDesignName("春日雏菊连衣裙");
    setDescription("温柔复古的少女连衣裙，碎花收腰,法式田园轻休闲");
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
    tourActive, tourStep, tourBusy, totalSteps, shouldRegister,
    startTour, next: advance, prev, skip, complete,
  }), [tourActive, tourStep, tourBusy, shouldRegister, startTour, advance, prev, skip, complete]);
}

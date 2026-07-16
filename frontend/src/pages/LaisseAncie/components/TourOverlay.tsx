// @ts-nocheck
/**
 * TourOverlay —— 新手引导 spotlight + tooltip 浮层。
 *
 * 在全屏半透明蒙版上按 data-tour 找到目标元素「挖孔」露出,
 * 旁边悬浮 tooltip 卡片(步骤计数 + 标题 + 描述 + 操作按钮)。
 * 目标切换时通过 CSS transition 平滑过渡。
 */
import { useEffect, useState } from "react";

export interface TourStep {
  /** 目标元素的 data-tour 属性值 */
  target: string;
  title: string;
  description: string;
  /** 「下一步」按钮在该步的定制文案 */
  actionLabel?: string;
  /** 挖孔内边距(px) */
  spotlightPadding?: number;
}

interface Props {
  steps: TourStep[];
  /** 当前步骤(父组件驱动) */
  stepIdx: number;
  /** 点击「下一步」(最后一步时等同于完成) */
  onAdvance: () => void;
  /** 点击「上一步」 */
  onPrev: () => void;
  /** 点击「跳过引导」 */
  onSkip: () => void;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const VIEWPORT_PAD = 8;
const TOOLTIP_WIDTH = 300;
const TOOLTIP_GAP = 16;

export default function TourOverlay({ steps, stepIdx, onAdvance, onPrev, onSkip }: Props) {
  const [rect, setRect] = useState<Rect | null>(null);
  const [done, setDone] = useState(false);

  const step = steps[stepIdx];
  const padding = step?.spotlightPadding ?? 8;

  // 计算当前目标元素的 rect(滚动/resize 时重新计算)
  useEffect(() => {
    if (!step) return;
    let raf = 0;
    const compute = () => {
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      if (!el) { setRect(null); return; }
      const r = el.getBoundingClientRect();
      setRect({
        top: r.top - padding,
        left: r.left - padding,
        width: r.width + padding * 2,
        height: r.height + padding * 2,
      });
    };
    compute();
    // 滚动 / resize / 短暂延迟后再算一次(目标渲染可能有延迟)
    window.addEventListener("scroll", compute, true);
    window.addEventListener("resize", compute);
    const retry = setTimeout(compute, 120);
    return () => {
      window.removeEventListener("scroll", compute, true);
      window.removeEventListener("resize", compute);
      clearTimeout(retry);
      cancelAnimationFrame(raf);
    };
  }, [step, stepIdx, padding]);

  if (!step || !rect) return null;

  const isLast = stepIdx === steps.length - 1;
  const stepNum = stepIdx + 1;
  const total = steps.length;

  /** 下一步/完成:统一交给父组件的 onAdvance 处理(含 mock 生成 + 步进 + 完成) */
  function next() {
    if (isLast) {
      setDone(true);
      // 让完成卡片短暂可见,再由父组件关闭
      setTimeout(onAdvance, 1400);
    } else {
      onAdvance();
    }
  }

  /** 上一步 */
  function prev() { onPrev(); }

  // —— tooltip 位置:优先放在目标下方,空间不足则上方;水平居中于目标,贴边收进 ——
  const tooltipLeft = clamp(
    rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2,
    VIEWPORT_PAD,
    window.innerWidth - TOOLTIP_WIDTH - VIEWPORT_PAD,
  );
  const spaceBelow = window.innerHeight - (rect.top + rect.height);
  const placeBelow = spaceBelow >= 200 || spaceBelow >= rect.top;
  const tooltipTop = placeBelow
    ? rect.top + rect.height + TOOLTIP_GAP
    : rect.top - TOOLTIP_GAP - estimatedTooltipHeight(step);

  // 完成卡片:屏幕居中
  if (done) {
    return (
      <div className="fixed inset-0 z-[100]" onClick={(e) => e.stopPropagation()}>
        <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white shadow-2xl border border-gray-200 px-10 py-8 text-center min-w-[280px]">
          <div className="text-4xl mb-3">🎉</div>
          <div className="text-lg font-semibold text-gray-800 mb-1">引导完成!</div>
          <div className="text-sm text-gray-500">你已经走完了灵感扩散的完整流程,快去创作你的第一个作品吧~</div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[100]"
      onClick={(e) => e.stopPropagation()}
    >
      {/* 蒙层:box-shadow 挖孔 */}
      <div
        className="absolute inset-0 transition-all duration-500 ease-out"
        style={{
          boxShadow: `0 0 0 9999px rgba(0,0,0,0.55)`,
          clipPath: `polygon(
            0 0, 100% 0, 100% 100%, 0 100%, 0 0,
            ${rect.left}px ${rect.top}px,
            ${rect.left}px ${rect.top + rect.height}px,
            ${rect.left + rect.width}px ${rect.top + rect.height}px,
            ${rect.left + rect.width}px ${rect.top}px,
            ${rect.left}px ${rect.top}px
          )`,
        }}
      />

      {/* 目标呼吸光环 */}
      <div
        className="absolute rounded-xl ring-2 ring-primary-400/70 animate-pulse pointer-events-none transition-all duration-500 ease-out"
        style={{
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        }}
      />

      {/* tooltip 卡片 */}
      <div
        className="absolute rounded-2xl bg-white shadow-2xl border border-gray-200 p-5 pointer-events-auto transition-all duration-400 ease-out"
        style={{
          top: tooltipTop,
          left: tooltipLeft,
          width: TOOLTIP_WIDTH,
        }}
      >
        {/* 步骤计数 */}
        <div className="text-[11px] text-gray-400 font-mono mb-2 tabular-nums">
          {stepNum} / {total}
        </div>
        {/* 标题 */}
        <div className="text-[15px] font-semibold text-gray-800 mb-2 leading-snug">
          {step.title}
        </div>
        {/* 描述 */}
        <div className="text-[12.5px] text-gray-600 leading-relaxed mb-4 whitespace-pre-line">
          {step.description}
        </div>
        {/* 操作按钮 */}
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={onSkip}
            className="text-[12px] text-gray-400 hover:text-gray-600 transition-colors"
          >
            跳过引导
          </button>
          <div className="flex items-center gap-2">
            {stepIdx > 0 && (
              <button
                onClick={prev}
                className="text-[12px] px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:border-gray-400 transition-colors"
              >
                上一步
              </button>
            )}
            <button
              onClick={next}
              className="text-[12px] px-4 py-1.5 rounded-lg bg-primary-500 hover:bg-primary-600 text-white font-medium transition-colors shadow-sm"
            >
              {isLast ? "完成 ✨" : (step.actionLabel ?? "下一步")}
            </button>
          </div>
        </div>
        {/* 小三角(指向目标) */}
        <div
          className="absolute w-3 h-3 bg-white border-l border-t border-gray-200 rotate-45"
          style={placeBelow
            ? { top: -6, left: TOOLTIP_WIDTH / 2 - 6 }
            : { bottom: -6, left: TOOLTIP_WIDTH / 2 - 6, transform: "rotate(-135deg)" }
          }
        />
      </div>
    </div>
  );
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

/** tooltip 高度估算(用于上方布局) */
function estimatedTooltipHeight(step: TourStep): number {
  // 标题 24 + 描述约 16 /行 * 行数 + 按钮 40 + 间距
  const descLines = Math.ceil(step.description.length / 26);
  return 24 + 24 + descLines * 16 + 16 + 40 + 40;
}

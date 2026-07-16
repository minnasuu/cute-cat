// @ts-nocheck
/**
 * MaterialComboTourOverlay —— 材料组合新手引导浮层。
 *
 * 步骤式 spotlight + tooltip,与灵感扩散 TourOverlay 风格一致。
 */
import { useEffect, useState } from 'react';

interface TourStep {
  target: string;
  title: string;
  description: string;
  actionLabel?: string;
}

interface Props {
  steps: TourStep[];
  stepIdx: number;
  onAdvance: () => void;
  onPrev: () => void;
  onSkip: () => void;
}

export default function MaterialComboTourOverlay({ steps, stepIdx, onAdvance, onPrev, onSkip }: Props) {
  const step = steps[stepIdx];
  const [pos, setPos] = useState({ top: 0, left: 0, w: 0, h: 0 });

  useEffect(() => {
    if (!step) return;
    const el = document.querySelector(`[data-tour="${step.target}"]`);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({ top: rect.top, left: rect.left, w: rect.width, h: rect.height });
  }, [stepIdx, step]);

  if (!step) return null;

  const tooltipLeft = Math.min(Math.max(12, pos.left), window.innerWidth - 300);
  const tooltipTop = pos.top + pos.h + 12;

  return (
    <div className="fixed inset-0 z-50">
      {/* 半透明遮罩 */}
      <div className="absolute inset-0 bg-black/40" onClick={onSkip} />
      {/* spotlight 高亮区 */}
      <div
        className="absolute rounded-xl ring-4 ring-primary-400 shadow-[0_0_0_9999px_rgba(0,0,0,0.4)] transition-all duration-300"
        style={{ top: pos.top - 4, left: pos.left - 4, width: pos.w + 8, height: pos.h + 8 }}
      />
      {/* tooltip 卡片 */}
      <div
        className="absolute w-72 rounded-2xl bg-white shadow-2xl p-5 space-y-3"
        style={{ top: tooltipTop, left: tooltipLeft }}
      >
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-primary-600 font-medium">步骤 {stepIdx + 1}/{steps.length}</span>
          <button onClick={onSkip} className="text-[10px] text-gray-400 hover:text-gray-600">跳过</button>
        </div>
        <h3 className="text-sm font-semibold text-gray-800">{step.title}</h3>
        <p className="text-[12px] text-gray-600 leading-relaxed whitespace-pre-line">{step.description}</p>
        <div className="flex items-center justify-between pt-1">
          <button onClick={onPrev} disabled={stepIdx === 0} className="text-[11px] text-gray-500 hover:text-gray-700 disabled:opacity-30">← 上一步</button>
          <button onClick={onAdvance} className="px-4 py-1.5 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-[12px] font-medium transition-colors">
            {step.actionLabel || (stepIdx === steps.length - 1 ? '完成' : '下一步')}
          </button>
        </div>
      </div>
    </div>
  );
}

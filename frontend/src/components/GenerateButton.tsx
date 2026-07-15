// @ts-nocheck
/**
 * GenerateButton —— 统一的 AI 生成按钮。
 *
 * 所有工作台发起生成(单品/材料组合/款式裂变等)的入口按钮都应使用此组件,保证:
 *   - 视觉一致:主题绿底 + Tiffany 蓝渐变叠加
 *   - 文案规范:「立即生成(预计花费 N 喵币)」,loading 态为「生成中…」
 *   - 内置余额提示:可选手动传入 userCoins,余额不足时按钮禁用并提示
 *
 * 用法:
 *   <GenerateButton
 *     loading={submitting || generating}
 *     estimatedCoins={images.length * AI_COST_PER_IMAGE}
 *     userCoins={user?.coins}
 *     onClick={startGeneration}
 *   />
 */

import MeowCoin from './MeowCoin';

/** AI 单图生成成本(喵币/张),与后端 AI_COSTS.image_generate 对齐 */
export const AI_COST_PER_IMAGE = 9;

interface Props {
  /** 是否正在进行(提交 / 生成中) */
  loading: boolean;
  /** 预计花费喵币总数,不传则不显示花费 */
  estimatedCoins?: number;
  /** 用户当前喵币余额,传入后余额不足时自动禁用 + 提示 */
  userCoins?: number;
  /** 按钮文案(不含花费部分),默认「立即生成」 */
  label?: string;
  /** 额外 class(宽度/间距等) */
  className?: string;
  disabled?: boolean;
  onClick?: () => void;
}

export function GenerateButton({
  loading,
  estimatedCoins,
  userCoins,
  label = "立即生成",
  className = "",
  disabled,
  onClick,
}: Props) {
  // 花费文案
  const costText =
    estimatedCoins != null && estimatedCoins > 0
      ? `(预计花费 ${estimatedCoins} 喵币)`
      : "";

  // 余额是否充足
  const insufficient =
    userCoins != null && estimatedCoins != null && userCoins < estimatedCoins;

  const isDisabled = loading || insufficient || disabled;

  return (
    <div className={`flex flex-col items-center gap-1.5 ${className}`}>
      <button
        type="button"
        onClick={onClick}
        disabled={isDisabled}
        className={`relative overflow-hidden px-8 py-3 rounded-2xl text-white font-bold text-sm shadow-lg transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:hover:scale-100 disabled:cursor-not-allowed ${
          insufficient ? "ring-2 ring-red-300 ring-offset-1" : ""
        }`}
        style={{
          background: isDisabled
            ? insufficient
              ? "#b0b7c3" // 余额不足:偏冷的浅灰,带红色 ring 警示
              : "#9ca3af" // 其他禁用态:普通灰
            : "linear-gradient(135deg, #3ed475 35%, #2ce2e8 100%)",
        }}
      >
        {/* 光泽高光条(仅非 loading 且非禁用) */}
        {!loading && !isDisabled && (
          <span className="pointer-events-none absolute top-0 left-0 right-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent rounded-t-2xl" />
        )}
        {loading ? (
          <span className="flex items-center gap-2">
            <svg
              className="w-4 h-4 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="3"
                className="opacity-25"
              />
              <path
                d="M4 12a8 8 0 018-8"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                className="opacity-75"
              />
            </svg>
            生成中…
          </span>
        ) : insufficient ? (
          <span className="flex items-center gap-1.5">
            <svg
              className="w-3.5 h-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            余额不足,需充值
          </span>
        ) : (
          <span className="flex items-center gap-1.5">
            {label}
            {costText && (
              <span className="text-white/85 text-[11px] font-medium">
                {costText}
              </span>
            )}
          </span>
        )}
      </button>

      {/* 余额不足具体差额提示 */}
      {insufficient && (
        <span className="text-[11px] text-red-500 inline-flex items-center gap-1">
          还需 {(estimatedCoins ?? 0) - (userCoins ?? 0)} <MeowCoin size={12} />
          ,请
          <a href="/account" className="underline hover:text-red-600">
            充值
          </a>
        </span>
      )}
    </div>
  );
}

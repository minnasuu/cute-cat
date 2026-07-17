import React from 'react';
import MeowCoin from './MeowCoin';
import type { CatColors } from './CatSVG';

/**
 * 喵币金额展示组件。
 * 统一渲染「<MeowCoin图标> {amount} 喵币」格式，替代散落在各处的 inline-flex + MeowCoin + 数字 + "喵币" 组合。
 *
 * 用法：
 *   <MeowCoinDisplay amount={user.coins} />                          // 默认 size 16
 *   <MeowCoinDisplay size={22} amount={user.coins} />                 // 配合大号余额
 *   <MeowCoinDisplay size={14} amount={user.coins} className="font-black text-text-primary" />
 */
interface MeowCoinDisplayProps {
  /** 喵币数量 */
  amount: number;
  /** 图标尺寸(px) */
  size?: number;
  /** 外层 span 额外样式(文字颜色/字重等) */
  className?: string;
  /** 主题配色,默认品牌金色 */
  colors?: CatColors;
}

const MeowCoinDisplay: React.FC<MeowCoinDisplayProps> = ({
  amount,
  size = 16,
  className,
  colors,
}) => (
  <span className={`inline-flex items-center gap-1 ${className ?? ''}`}>
    <MeowCoin size={size} colors={colors} /> {amount} 喵币
  </span>
);

export default MeowCoinDisplay;

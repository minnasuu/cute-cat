// @ts-nocheck
/**
 * useImageRetry —— 生图自动重试 hook(供 StyleMutate / MaterialCombo 等批量生图页复用)。
 *
 * 职责:
 *   - 按 cellKey 记录每个格子的重试次数
 *   - 提供 tryAutoRetry:失败时若未达上限则自动重试,否则回调 onFailed
 *   - 提供 resetRetries:轮询开始/新批次时清零
 *
 * 调用方只需传入:
 *   - retryFn(item, isAutoRetry) —— 实际的重试逻辑(调后端的 regenerate 接口)
 *   - onFailed(item, error) —— 所有重试耗尽后的处理(显示错误到该格子)
 *   - getKey(item) —— 提取格子的唯一 key
 */
import { useRef, useCallback } from 'react';

export function useImageRetry({
  maxRetries = 1,
  getKey,
  retryFn,
  onFailed,
}: {
  maxRetries?: number;
  getKey: (item: any) => string | number;
  retryFn: (item: any, isAutoRetry: boolean) => Promise<any>;
  onFailed: (item: any, error: string) => void;
}) {
  const retryCount = useRef<Map<string | number, number>>(new Map());

  const resetRetries = useCallback(() => {
    retryCount.current.clear();
  }, []);

  const getRetryCount = useCallback((item: any) => {
    return retryCount.current.get(getKey(item)) || 0;
  }, [getKey]);

  /**
   * 尝试自动重试:
   *   - 当前重试次数 < maxRetries → 调 retryFn(item, true) 静默重试
   *   - 已达上限 → 调 onFailed(item, error) 显示错误
   */
  const tryAutoRetry = useCallback(async (item: any, error: string) => {
    const key = getKey(item);
    const retries = retryCount.current.get(key) || 0;
    if (retries < maxRetries) {
      retryCount.current.set(key, retries + 1);
      console.warn(`[imageRetry] 格子 ${key} 失败,自动重试(${retries + 1}/${maxRetries}):`, error);
      try {
        await retryFn(item, true);
      } catch (e: any) {
        // retryFn 内部已处理状态回写,忽略
      }
    } else {
      onFailed(item, error);
    }
  }, [getKey, maxRetries, retryFn, onFailed]);

  return { resetRetries, getRetryCount, tryAutoRetry };
}

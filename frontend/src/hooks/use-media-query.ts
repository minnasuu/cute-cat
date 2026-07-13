import { useEffect, useState } from 'react';

/**
 * useMediaQuery —— 订阅一个 CSS media query,返回是否命中。
 * 用于 JS 逻辑里根据断点分支(如移动端打开抽屉)。
 *
 * 用法:const isMobile = useMediaQuery('(max-width: 767px)');
 */
export function useMediaQuery(query: string): boolean {
  const get = () => (typeof window !== 'undefined' ? window.matchMedia(query).matches : false);
  const [matches, setMatches] = useState<boolean>(get);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    // 现代浏览器用 addListener,老浏览器用 addListener
    if (mql.addEventListener) mql.addEventListener('change', handler);
    else mql.addListener(handler);
    setMatches(mql.matches);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener('change', handler);
      else mql.removeListener(handler);
    };
  }, [query]);

  return matches;
}

/** 快捷:是否为移动端(<md,即 <768px)。 */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 767px)');
}

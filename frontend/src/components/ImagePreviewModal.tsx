/**
 * ImagePreviewModal —— 工作台通用全屏大图预览。
 *
 * 特性:
 *   - 点击缩略图放大到全屏
 *   - 多张图时左右切换(按钮 + 键盘 ←/→)
 *   - 点击背景 / 按 Escape 关闭
 *   - 显示当前序号(如 2/5)与图标签
 *
 * 用法(通过 hook,一处声明即可在多处使用):
 *   const preview = useImagePreview();
 *   // 任意可点击元素:
 *   <img src={url} onClick={() => preview.open(images, index)} />
 *   // 渲染模态(通常放在组件树末尾):
 *   {preview.modal}
 */

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

/** 预览项:兼容 GeneratedImage 及其他只包含 url/label 的结构 */
export interface PreviewItem {
  url?: string | null;
  label?: string;
}

interface Props {
  images: PreviewItem[];
  initialIndex: number;
  open: boolean;
  onClose: () => void;
}

function ImagePreviewModal({ images, initialIndex, open, onClose }: Props) {
  const [index, setIndex] = useState(initialIndex);

  // open / initialIndex 变化时同步当前索引
  useEffect(() => {
    if (open) setIndex(initialIndex);
  }, [open, initialIndex]);

  // 键盘:← → 切换,Esc 关闭
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") setIndex((i) => (i - 1 + images.length) % images.length);
      if (e.key === "ArrowRight") setIndex((i) => (i + 1) % images.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, images.length, onClose]);

  if (!open || !images.length) return null;

  const current = images[index];
  const hasPrev = images.length > 1;
  const hasNext = images.length > 1;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      {/* 顶部工具栏:序号 + 关闭 */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/60 to-transparent text-white">
        <div className="text-sm font-medium">
          {current.label ? <span className="mr-2">{current.label}</span> : null}
          <span className="text-white/70 text-[12px]">{index + 1} / {images.length}</span>
        </div>
        <button onClick={onClose} aria-label="关闭" className="p-1.5 rounded-full hover:bg-white/15 transition-colors">
          <X size={22} />
        </button>
      </div>

      {/* 左切换 */}
      {hasPrev && (
        <button
          onClick={(e) => { e.stopPropagation(); setIndex((i) => (i - 1 + images.length) % images.length); }}
          aria-label="上一张"
          className="absolute left-3 z-10 p-2 rounded-full bg-white/10 hover:bg-white/25 text-white transition-colors"
        >
          <ChevronLeft size={28} />
        </button>
      )}

      {/* 大图 */}
      <img
        src={current.url ?? undefined}
        alt={current.label ?? `图片 ${index + 1}`}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[88vh] max-w-[92vw] object-contain rounded-lg shadow-2xl select-none"
      />

      {/* 右切换 */}
      {hasNext && (
        <button
          onClick={(e) => { e.stopPropagation(); setIndex((i) => (i + 1) % images.length); }}
          aria-label="下一张"
          className="absolute right-3 z-10 p-2 rounded-full bg-white/10 hover:bg-white/25 text-white transition-colors"
        >
          <ChevronRight size={28} />
        </button>
      )}

      {/* 底部指示点(≥2 张时) */}
      {hasPrev && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
          {images.map((_, i) => (
            <button
              key={i}
              onClick={(e) => { e.stopPropagation(); setIndex(i); }}
              aria-label={`第 ${i + 1} 张`}
              className={`rounded-full transition-all duration-200 ${i === index ? "w-6 h-2 bg-white" : "w-2 h-2 bg-white/40 hover:bg-white/70"}`}
            />
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}

/** Hook:在组件内一次声明,即可在任意 <img> 上触发预览 */
export function useImagePreview() {
  const [state, setState] = useState<{ images: PreviewItem[]; index: number } | null>(null);

  const open = useCallback((images: PreviewItem[], index: number) => {
    setState({ images, index });
  }, []);

  const close = useCallback(() => setState(null), []);

  // 把有效 url 的图过滤出来(避免点开空白 / 失败图)
  const openFromMixed = useCallback((images: PreviewItem[], index: number) => {
    const valid = images.filter((im) => im.url);
    if (!valid.length) return;
    const target = images[index];
    const validIndex = target?.url ? valid.indexOf(target) : 0;
    setState({ images: valid, index: validIndex < 0 ? 0 : validIndex });
  }, []);

  const modal = (
    <ImagePreviewModal
      images={state?.images ?? []}
      initialIndex={state?.index ?? 0}
      open={!!state}
      onClose={close}
    />
  );

  return { open, openFromMixed, close, modal };
}

export default ImagePreviewModal;

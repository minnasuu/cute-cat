// @ts-nocheck
/**
 * image-card —— 设计图稿渲染原语(从 Composer 抽出,供设计简报/生成流程双栏复用)。
 *
 * 支持两种修图模式:
 *   - 直接替换: onRegenerate(instruction) 无回调 → 父组件直接替换
 *   - 预览确认: onRegenerate(instruction, onResult) → 返回预览 URL,用户确认后再替换
 *
 * confirmed=true 时隐藏所有修改 UI(步骤已确认,不可再改)。
 */
import { useEffect, useState } from "react";

/** 格式化耗时为可读字符串 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  return `${m}m${rem}s`;
}

export interface GeneratedImage {
  slot: string;
  label: string;
  url?: string;
  /** AI 生成时的原图,下载时优先取此 URL(压缩图仍用 url 展示) */
  originalUrl?: string | null;
  prompt?: string;
  error?: string;
}

/** 单张设计图稿卡片:大图 + 标签 + 修改/重生成(可选预览确认) */
export function ImageCell({
  image,
  onRegenerate,
  confirmed = false,
  onConfirmReplace,
}: {
  image: GeneratedImage;
  /** 修图:无回调=直接替换,有回调=预览模式(返回新图 URL 待用户确认) */
  onRegenerate: (instruction: string, onResult?: (url: string) => void) => void;
  /** 步骤已确认 → 隐藏修改 UI */
  confirmed?: boolean;
  /** 预览模式下用户确认替换(父组件执行实际替换) */
  onConfirmReplace?: (slot: string, url: string) => void;
}) {
  const [inst, setInst] = useState("");
  const [open, setOpen] = useState(false);
  /** 预览 URL(修图返回的新图,待用户确认) */
  const [preview, setPreview] = useState<string | null>(null);

  /** 重置所有编辑状态 */
  const reset = () => {
    setInst("");
    setOpen(false);
    setPreview(null);
  };

  /** 提交修改指令 → 进入预览模式 */
  const handleGenerate = () => {
    if (!inst.trim()) return;
    onRegenerate(inst, (url) => setPreview(url));
    setInst("");
    setOpen(false);
  };

  /** 确认替换:把预览 URL 写入父组件 */
  const handleConfirm = () => {
    if (preview && onConfirmReplace) {
      onConfirmReplace(image.slot, preview);
    }
    reset();
  };

  /** 取消预览 */
  const handleCancel = () => {
    reset();
  };

  // 步骤已确认 → 纯展示,无任何修改入口
  if (confirmed) {
    return (
      <div className="rounded-xl border border-gray-200 overflow-hidden bg-gray-50">
        <div className="bg-gray-100 overflow-hidden">
          {image.url ? (
            <img src={image.url} alt={image.label} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">{image.error || "生成失败"}</div>
          )}
        </div>
        <div className="p-2">
          <div className="text-[11px] text-gray-600 font-medium">{image.label}</div>
        </div>
      </div>
    );
  }

  const displayUrl = preview || image.url;

  return (
    <div className={`rounded-xl border overflow-hidden bg-gray-50 ${preview ? "border-amber-300" : "border-gray-200"}`}>
      <div className="bg-gray-100 overflow-hidden relative">
        {displayUrl ? (
          <img src={displayUrl} alt={image.label} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">{image.error || "生成失败"}</div>
        )}
        {preview && (
          <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-amber-500 text-white text-[9px] font-medium">预览</div>
        )}
      </div>
      <div className="p-2">
        <div className="text-[11px] text-gray-600 font-medium mb-1">{image.label}</div>
        {!open ? (
          <div className="flex gap-1.5">
            <button onClick={() => setOpen(true)} className="text-[10px] text-primary-600 hover:underline">修改</button>
            {preview && (
              <>
                <button onClick={handleConfirm} className="text-[10px] text-emerald-600 hover:underline font-medium">✓ 替换</button>
                <button onClick={handleCancel} className="text-[10px] text-gray-500 hover:underline">✗ 取消</button>
              </>
            )}
          </div>
        ) : (
          <div className="flex gap-1">
            <input value={inst} onChange={(e) => setInst(e.target.value)} placeholder="修改意见…"
              className="flex-1 text-[11px] border border-gray-200 rounded px-1.5 py-1 focus:outline-none focus:border-primary-500" />
            <button onClick={handleGenerate}
              className="text-[10px] bg-primary-500 text-white px-2 rounded hover:bg-primary-600">生成</button>
            <button onClick={() => { setInst(""); setOpen(false); }}
              className="text-[10px] text-gray-500 px-1 rounded hover:bg-gray-100">取消</button>
          </div>
        )}
      </div>
    </div>
  );
}

/** 实时计时器(请求进行中显示) */
export function LiveElapsed({ startedAt, setTick }: { startedAt: number; setTick: React.Dispatch<React.SetStateAction<number>> }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = globalThis.setInterval(() => {
      setNow(Date.now());
      setTick((t) => t + 1);
    }, 500);
    return () => globalThis.clearInterval(id);
  }, [setTick]);
  const elapsed = now - startedAt;
  return <div className="text-gray-500 max-w-[80%] inline-block whitespace-nowrap">请求中…{formatDuration(elapsed)}</div>;
}

/** 只读字段展示(方案详情等) */
export function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-gray-500">{label}</div>
      <div className="text-[12.5px] text-gray-700 whitespace-pre-wrap">{value}</div>
    </div>
  );
}

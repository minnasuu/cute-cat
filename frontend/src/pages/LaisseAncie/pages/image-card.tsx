// @ts-nocheck
/**
 * image-card —— 设计图稿渲染原语(从 Composer 抽出,供设计简报/生成流程双栏复用)。
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

/** 单张设计图稿卡片:大图 + 标签 + 修改/重生成 */
export function ImageCard({ image, onRegenerate }: { image: GeneratedImage; onRegenerate: (inst: string) => void }) {
  const [inst, setInst] = useState("");
  const [open, setOpen] = useState(false);
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
        <div className="text-[11px] text-gray-600 font-medium mb-1">{image.label}</div>
        {!open ? (
          <button onClick={() => setOpen(true)} className="text-[10px] text-primary-600 hover:underline">修改</button>
        ) : (
          <div className="flex gap-1">
            <input value={inst} onChange={(e) => setInst(e.target.value)} placeholder="修改意见…"
              className="flex-1 text-[11px] border border-gray-200 rounded px-1.5 py-1 focus:outline-none focus:border-primary-500" />
            <button onClick={() => { onRegenerate(inst); setInst(""); setOpen(false); }}
              className="text-[10px] bg-primary-500 text-white px-2 rounded hover:bg-primary-500">生成</button>
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

/**
 * 从前端图片提取主色（纯 JS + canvas，无第三方依赖）。
 * 流程：缩放到小图 → 丢弃透明/近白/近黑背景 → RGB 量化直方图取众数。
 */

const DEFAULT_MAX_SIZE = 64;
/** 每通道量化位数；5 → 32 级，兼顾速度与色卡精度 */
const BUCKET_BITS = 5;
const BUCKET_SHIFT = 8 - BUCKET_BITS;

export type ExtractColorOptions = {
  /** 最长边像素，默认 64 */
  maxSize?: number;
  /** 忽略近白背景，默认 true（面料常拍在白底上） */
  ignoreNearWhite?: boolean;
  /** 忽略近黑噪点，默认 true */
  ignoreNearBlack?: boolean;
};

/** 从 File / Blob / dataURL / 同源图片 URL 提取主色，返回 `#rrggbb` */
export async function extractDominantHex(
  source: File | Blob | string,
  opts: ExtractColorOptions = {},
): Promise<string> {
  const img = await loadImage(source);
  const { data, width, height } = rasterize(img, opts.maxSize ?? DEFAULT_MAX_SIZE);
  return dominantFromPixels(data, width * height, opts);
}

function loadImage(source: File | Blob | string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    let objectUrl: string | null = null;

    const cleanup = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };

    img.onload = () => {
      cleanup();
      resolve(img);
    };
    img.onerror = () => {
      cleanup();
      reject(new Error("无法加载图片以提取颜色"));
    };

    if (typeof source === "string") {
      // 跨域 URL 需 CORS；失败时调用方可自行兜底
      if (/^https?:\/\//i.test(source) && !source.startsWith(window.location.origin)) {
        img.crossOrigin = "anonymous";
      }
      img.src = source;
      return;
    }

    objectUrl = URL.createObjectURL(source);
    img.src = objectUrl;
  });
}

function rasterize(
  img: HTMLImageElement,
  maxSize: number,
): { data: Uint8ClampedArray; width: number; height: number } {
  const nw = img.naturalWidth || img.width;
  const nh = img.naturalHeight || img.height;
  if (!nw || !nh) throw new Error("图片尺寸无效");

  const scale = Math.min(1, maxSize / Math.max(nw, nh));
  const w = Math.max(1, Math.round(nw * scale));
  const h = Math.max(1, Math.round(nh * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 不可用");
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  return { data, width: w, height: h };
}

function dominantFromPixels(
  data: Uint8ClampedArray,
  pixelCount: number,
  opts: ExtractColorOptions,
): string {
  const ignoreWhite = opts.ignoreNearWhite !== false;
  const ignoreBlack = opts.ignoreNearBlack !== false;
  const buckets = new Map<number, { count: number; r: number; g: number; b: number }>();

  for (let i = 0; i < pixelCount; i++) {
    const o = i * 4;
    const a = data[o + 3];
    if (a < 128) continue;

    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];

    // 亮度粗判（0–255）
    const lum = (r * 299 + g * 587 + b * 114) / 1000;
    if (ignoreWhite && lum > 245) continue;
    if (ignoreBlack && lum < 12) continue;

    const key =
      ((r >> BUCKET_SHIFT) << (BUCKET_BITS * 2)) |
      ((g >> BUCKET_SHIFT) << BUCKET_BITS) |
      (b >> BUCKET_SHIFT);

    const cur = buckets.get(key);
    if (cur) {
      cur.count += 1;
      cur.r += r;
      cur.g += g;
      cur.b += b;
    } else {
      buckets.set(key, { count: 1, r, g, b });
    }
  }

  let best = [...buckets.values()].sort((a, b) => b.count - a.count)[0];

  // 色卡若几乎全白/全黑，回退到全像素众数（不再过滤）
  if (!best) {
    for (let i = 0; i < pixelCount; i++) {
      const o = i * 4;
      if (data[o + 3] < 128) continue;
      const r = data[o];
      const g = data[o + 1];
      const b = data[o + 2];
      const key =
        ((r >> BUCKET_SHIFT) << (BUCKET_BITS * 2)) |
        ((g >> BUCKET_SHIFT) << BUCKET_BITS) |
        (b >> BUCKET_SHIFT);
      const cur = buckets.get(key);
      if (cur) {
        cur.count += 1;
        cur.r += r;
        cur.g += g;
        cur.b += b;
      } else {
        buckets.set(key, { count: 1, r, g, b });
      }
    }
    best = [...buckets.values()].sort((a, b) => b.count - a.count)[0];
  }

  if (!best) return "#cccccc";

  const r = Math.round(best.r / best.count);
  const g = Math.round(best.g / best.count);
  const b = Math.round(best.b / best.count);
  return rgbToHex(r, g, b);
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

// @ts-nocheck
import imageCompression from "browser-image-compression";

export async function compressForUpload(
  file: File,
  opts: { maxWidth?: number; quality?: number; maxSizeMB?: number } = {},
): Promise<File> {
  const out = await imageCompression(file, {
    maxSizeMB: opts.maxSizeMB ?? 0.3,
    maxWidthOrHeight: opts.maxWidth ?? 400,
    useWebWorker: true,
    fileType: "image/jpeg",
    initialQuality: opts.quality ?? 0.7,
  });
  return new File([out], replaceExt(file.name, ".jpg"), { type: "image/jpeg" });
}

function replaceExt(name: string, next: string): string {
  const dot = name.lastIndexOf(".");
  // 空文件名(如剪贴板粘贴的图片 name="")→ 退回为 "inspiration",避免生成 ".jpg" 这种
  // 纯扩展名文件;后端 multer 用 path.extname 取扩展名时会把 ".jpg" 当 dotfile 返回 "",
  // 导致落盘文件没有扩展名、URL 解析失败。
  const stem = dot === -1 ? name : name.slice(0, dot);
  return `${stem || "inspiration"}${next}`;
}

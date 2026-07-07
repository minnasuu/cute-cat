// @ts-nocheck
import imageCompression from "browser-image-compression";

export async function compressForUpload(
  file: File,
  opts: { maxWidth?: number; quality?: number; maxSizeMB?: number } = {},
): Promise<File> {
  const out = await imageCompression(file, {
    maxSizeMB: opts.maxSizeMB ?? 1.5,
    maxWidthOrHeight: opts.maxWidth ?? 1600,
    useWebWorker: true,
    fileType: "image/jpeg",
    initialQuality: opts.quality ?? 0.85,
  });
  return new File([out], replaceExt(file.name, ".jpg"), { type: "image/jpeg" });
}

function replaceExt(name: string, next: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? `${name}${next}` : `${name.slice(0, dot)}${next}`;
}

import { useMemo } from "react";
import { buildReactSandboxSrcDoc } from "./reactSandboxDoc";

export function sandboxUiScriptSrc(): string {
  const base = import.meta.env.BASE_URL || "/";
  const normalized = base.endsWith("/") ? base : `${base}/`;
  return `${normalized}sandbox-ui.iife.js`;
}

/** 仅 iframe；外层 macOS 风格标题栏由 ResultCanvas 统一包裹 */
export default function ReactSandboxPreview({
  code,
  iframeRef,
  onLoad,
}: {
  code: string;
  iframeRef?: React.Ref<HTMLIFrameElement>;
  onLoad?: () => void;
}) {
  const srcDoc = useMemo(
    () => buildReactSandboxSrcDoc(code, sandboxUiScriptSrc()),
    [code],
  );

  return (
    <iframe
      ref={iframeRef}
      srcDoc={srcDoc}
      sandbox="allow-scripts allow-same-origin"
      className="w-full border-0"
      style={{ minHeight: "min(60vh, 520px)", height: "calc(100vh - 109px)" }}
      title="React 沙箱预览"
      onLoad={onLoad}
    />
  );
}

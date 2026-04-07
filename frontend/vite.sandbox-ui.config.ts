import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** 沙箱 IIFE 仅打包 TSX 与 cva/cn；样式由 iframe 内 Tailwind CDN 解析 className */
export default defineConfig({
  publicDir: false,
  plugins: [react()],
  esbuild: {
    jsx: "transform",
    jsxFactory: "React.createElement",
    jsxFragment: "React.Fragment",
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  build: {
    lib: {
      entry: resolve(__dirname, "src/sandbox-ui-entry.tsx"),
      name: "SandboxUIBundle",
      formats: ["iife"],
      fileName: () => "sandbox-ui.iife",
    },
    rollupOptions: {
      external: ["react", "react-dom"],
      output: {
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
        },
        entryFileNames: "sandbox-ui.iife.js",
        extend: true,
      },
    },
    outDir: "public",
    emptyOutDir: false,
    cssCodeSplit: false,
    assetsInlineLimit: 100_000,
  },
});

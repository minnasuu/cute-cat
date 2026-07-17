import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/',
  // 开发/调试期保留 sourcemap,定位「Cannot access before initialization」等运行时错误
  build: {
    sourcemap: true,
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8002',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:8002',
        changeOrigin: true,
      }
    }
  },
  // vite preview 默认不走 server.proxy，不配置则 /uploads 会 404，图片无法显示
  preview: {
    proxy: {
      '/api': {
        target: 'http://localhost:8002',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:8002',
        changeOrigin: true,
      }
    }
  }
})

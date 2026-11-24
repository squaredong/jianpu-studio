import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // 相对路径：打包后以 file:// / 自定义协议加载时资源可以正确定位
  base: './',
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
})

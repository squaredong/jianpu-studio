// 打印入口：桌面端走 Electron 原生打印（可设置打印背景），浏览器端回退到 window.print()

export function printScore() {
  if (typeof window === 'undefined') return
  const api = window.jianpuDesktop
  if (api && typeof api.print === 'function') {
    api.print().catch(() => window.print())
    return
  }
  window.print()
}

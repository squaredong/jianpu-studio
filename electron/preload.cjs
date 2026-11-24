const { contextBridge, ipcRenderer } = require('electron')

// 只暴露最小打印接口，渲染进程仍然无法直接访问 Node
contextBridge.exposeInMainWorld('jianpuDesktop', {
  print: () => ipcRenderer.invoke('score:print'),
})

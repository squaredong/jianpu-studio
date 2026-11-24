const { app, BrowserWindow, shell, protocol, session, dialog, ipcMain } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

const APP_SCHEME = 'jianpu'
const isDev = Boolean(process.env.ELECTRON_START_URL)

// 自定义协议需要提前注册为 standard/secure，否则相对路径与 localStorage 无法正常工作
protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: false,
      allowServiceWorkers: false,
      corsEnabled: true,
    },
  },
])

let mainWindow = null

function distDir() {
  return path.join(__dirname, '..', 'dist')
}

function registerProtocol() {
  protocol.registerFileProtocol(APP_SCHEME, (request, callback) => {
    try {
      const raw = request.url.slice(`${APP_SCHEME}://app/`.length).split('?')[0]
      const relative = decodeURIComponent(raw) || 'index.html'
      const filePath = path.normalize(path.join(distDir(), relative))
      // 防止越权访问打包目录之外的文件
      if (!filePath.startsWith(distDir())) {
        callback({ error: -6 })
        return
      }
      callback({ path: fs.existsSync(filePath) ? filePath : path.join(distDir(), 'index.html') })
    } catch (err) {
      callback({ error: -6 })
    }
  })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 680,
    title: '简谱工坊',
    backgroundColor: '#11131a',
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      spellcheck: false,
      devTools: isDev,
      backgroundThrottling: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  })

  if (isDev) {
    mainWindow.loadURL(process.env.ELECTRON_START_URL)
  } else {
    mainWindow.loadURL(`${APP_SCHEME}://app/index.html`)
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' })
  })

  // 外链交给系统浏览器打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) {
      shell.openExternal(url)
      return { action: 'deny' }
    }
    return { action: 'allow' }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function configureDownloads() {
  session.defaultSession.on('will-download', (event, item) => {
    const filename = item.getSuggestedFilename() || 'download'
    item.setSavePath(path.join(app.getPath('downloads'), filename))
  })
}

// 原生打印：打印背景色，让纸张纹理与减时线正常输出
ipcMain.handle('score:print', async () => {
  if (!mainWindow || mainWindow.isDestroyed()) return { ok: false, reason: 'no-window' }
  mainWindow.webContents.print({
    printBackground: true,
    marginsType: 1,
    pageSize: 'A4',
  })
  return { ok: true }
})

app.whenReady().then(() => {
  if (!isDev) registerProtocol()
  configureDownloads()
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

// 防止证书/网络类阻塞弹窗打断使用
app.on('web-contents-created', (_, contents) => {
  contents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`${APP_SCHEME}://`) && !url.startsWith('devtools://') && !isDev) event.preventDefault()
  })
})

process.on('uncaughtException', (err) => {
  if (!app.isReady()) return
  dialog.showErrorBox('简谱工坊', err && err.message ? err.message : String(err))
})

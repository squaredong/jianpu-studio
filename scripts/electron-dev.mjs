import { spawn } from 'node:child_process'
import { createServer } from 'vite'

const server = await createServer({ server: { port: 5173, strictPort: true } })
await server.listen()

const electronModule = await import('electron')
const electronPath = typeof electronModule.default === 'string' ? electronModule.default : electronModule.default?.path || electronModule.default
const child = spawn(electronPath, ['electron/main.cjs'], {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_START_URL: 'http://127.0.0.1:5173/' },
})

child.on('exit', async (code) => {
  await server.close()
  process.exit(code ?? 0)
})

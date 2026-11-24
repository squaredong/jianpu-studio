import { chromium } from 'playwright-core'
import fs from 'node:fs'

fs.mkdirSync('test/shots', { recursive: true })

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
})
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => errors.push(e.message))

function check(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg)
  console.log('PASS:', msg)
}

await page.goto('http://127.0.0.1:5173/')
await page.evaluate(() => {
  const line1 = ['床', '前', '明', '月', '光', '疑', '是']
  const line2 = ['床前', '明月', '光', '疑', '是', '地上', '霜']
  const score = {
    title: '静夜思',
    key: { tonic: 'C', mode: 'major' },
    timeSignature: [4, 4],
    tempo: 96,
    lyricLines: ['歌词 1', '歌词 2'],
    notes: line1.map((text, i) => ({
      id: `n${i}`,
      degree: i + 1,
      accidental: 0,
      octave: 0,
      duration: 1,
      lyrics: [text, line2[i]],
    })),
  }
  localStorage.setItem('jianpu-studio-score-v1', JSON.stringify(score))
})
await page.reload()
await page.waitForTimeout(500)

// 统计打印调用（含桌面桥接路径）
await page.evaluate(() => {
  window.__printCount = 0
  window.jianpuDesktop = { print: () => { window.__printCount++; return Promise.resolve({ ok: true }) } }
})

check(await page.locator('.note-cell').count() === 7, '加载含歌词的 7 个音符')
check(await page.locator('.lyric-syllable').count() === 14, '谱面显示两行歌词')

// 顶部按钮触发打印（走桌面桥接）
await page.getByRole('button', { name: '打印乐谱' }).first().click()
await page.waitForTimeout(200)
check(await page.evaluate(() => window.__printCount) === 1, '工具栏打印按钮触发打印')

// 快捷键触发打印
await page.keyboard.press('Control+p')
await page.waitForTimeout(200)
check(await page.evaluate(() => window.__printCount) === 2, 'Ctrl+P 快捷键触发打印')

// 侧边栏打印按钮
await page.locator('.sidebar').getByRole('button', { name: '打印乐谱' }).click()
await page.waitForTimeout(200)
check(await page.evaluate(() => window.__printCount) === 3, '侧边栏打印按钮触发打印')

// 打印媒体下：界面元素隐藏，谱面保留
await page.emulateMedia({ media: 'print' })
const styles = await page.evaluate(() => {
  const display = s => {
    const el = document.querySelector(s)
    return el ? getComputedStyle(el).display : 'MISSING'
  }
  return {
    topbar: display('.topbar'),
    sidebar: display('.sidebar'),
    contentBar: display('.content-bar'),
    shortcut: display('.shortcut-strip'),
    lyricEditor: display('.lyric-editor'),
    lyric: display('.lyric-syllable'),
    paper: display('.paper'),
    footer: display('.print-footer'),
    paperBg: getComputedStyle(document.querySelector('.paper')).backgroundColor,
  }
})
check(styles.topbar === 'none', '打印时隐藏顶栏')
check(styles.sidebar === 'none', '打印时隐藏侧边栏')
check(styles.contentBar === 'none', '打印时隐藏操作栏')
check(styles.shortcut === 'none', '打印时隐藏快捷键条')
check(styles.lyricEditor === 'none', '打印时隐藏歌词录入面板')
check(styles.lyric !== 'none', '打印时保留谱面歌词')
check(styles.paper !== 'none', '打印时保留谱面')
check(styles.footer !== 'none', '打印时显示页脚')
check(styles.paperBg === 'rgb(255, 255, 255)', '打印时纸张为白底')

// 输出 PDF 验证实际打印排版
await page.pdf({ path: 'test/shots/print-preview.pdf', format: 'A4', printBackground: true })
console.log('PDF 已生成: test/shots/print-preview.pdf')

check(errors.length === 0, '页面无运行错误: ' + JSON.stringify(errors))

await browser.close()
console.log('\n打印功能测试全部通过')

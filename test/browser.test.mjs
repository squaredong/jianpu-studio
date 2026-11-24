import { chromium } from 'playwright-core'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const fixture = (name) => fileURLToPath(new URL(name, import.meta.url))
const shot = (name) => fileURLToPath(new URL(`shots/${name}`, import.meta.url))
fs.mkdirSync(fixture('shots/'), { recursive: true })

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required'],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`))
page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()} @ ${JSON.stringify(m.location())}`) })
page.on('response', r => { if (r.status() >= 400) console.log('    HTTP', r.status(), r.url()) })

const log = (ok, msg) => console.log(`${ok ? '  ✓' : '  ✗'} ${msg}`)
let failures = 0
function expect(cond, msg) { log(cond, msg); if (!cond) failures++ }

function tab(name) { return page.locator('.tabs button', { hasText: name }) }

await page.goto('http://127.0.0.1:5173/')
await page.evaluate(() => localStorage.clear())
await page.reload()
await page.waitForTimeout(500)

console.log('打谱编辑')
const pad = page.locator('.note-pad button')
for (const i of [0, 2, 4, 0]) { await pad.nth(i).click(); await page.waitForTimeout(40) }
expect(await page.locator('.note-cell').count() === 4, '点击数字键后生成 4 个音符')
await page.locator('.duration-pad button').nth(3).click()
await pad.nth(4).click()
expect(await page.locator('.note-cell').count() === 5, '切换时值后继续输入成功')
const underlines = await page.locator('.note-cell').last().locator('.duration-line').count()
expect(underlines === 1, '八分音符显示一条减时线')
await page.locator('.note-cell').first().click()
expect(await page.locator('.selected-editor').isVisible(), '选中音符后出现编辑面板')
await page.locator('.sel-pad button').nth(5).click()
expect((await page.locator('.note-cell').first().locator('.digit').textContent()) === '5', '编辑面板可修改选中音符音高')

console.log('歌词录入')
await page.getByRole('button', { name: '歌词录入' }).click()
expect(await page.locator('.lyric-editor').isVisible(), '打开谱面下方的歌词录入面板')
const lyricRows = page.locator('.lyric-editor .lyric-row:not(.lyric-header)')
await lyricRows.nth(0).locator('.lyric-input').nth(0).fill('床')
await lyricRows.nth(0).locator('.lyric-input').nth(1).fill('前')
await lyricRows.nth(0).locator('.lyric-input').nth(2).fill('明')
await page.getByRole('button', { name: '＋ 添加歌词行' }).click()
expect(await page.locator('.lyric-editor .lyric-line-label input').count() === 2, '添加第二行歌词成功')
const lyricRows2 = page.locator('.lyric-editor .lyric-row:not(.lyric-header)')
await lyricRows2.nth(1).locator('.lyric-input').nth(0).fill('床前')
await lyricRows2.nth(1).locator('.lyric-input').nth(1).fill('明月')
expect(await page.locator('.note-slot').first().locator('.lyric-syllable').count() === 2, '谱面每个音符显示两行歌词')
expect((await page.locator('.note-slot').first().locator('.lyric-syllable').first().textContent()) === '床', '第一行歌词显示在音符下方')
expect((await page.locator('.note-slot').nth(1).locator('.lyric-syllable').nth(1).textContent()) === '明月', '第二行歌词显示在音符下方')
await page.locator('.note-slot').nth(2).locator('.lyric-syllable').nth(1).click()
expect(
  await lyricRows2.nth(1).locator('.lyric-input').nth(2).evaluate(el => el === document.activeElement),
  '点击谱面歌词定位到对应输入框',
)
await page.locator('.paper-head').click()
await tab('MIDI 转谱').click()
await tab('打谱编辑').click()
expect((await page.locator('.note-slot').first().locator('.lyric-syllable').first().textContent()) === '床', '切换标签后歌词保留')

await page.locator('.side-section').nth(2).locator('.ghost-btn').first().click() // 保存工程
await page.screenshot({ path: shot('01-edit.png'), fullPage: true })

console.log('MIDI 转谱')
await tab('MIDI 转谱').click()
await page.locator('.dropzone input[type=file]').setInputFiles(fixture('fixtures/scale.mid'))
await page.getByRole('button', { name: '导入并转换为简谱' }).click()
await page.waitForTimeout(400)
expect((await page.locator('.toast').textContent() || '').includes('已导入 MIDI'), 'MIDI 导入成功提示')
expect(await page.locator('.note-cell').count() === 6, 'MIDI 转换出 6 个音符')
await page.screenshot({ path: shot('02-midi.png'), fullPage: true })

console.log('五线谱转谱')
await tab('五线谱转谱').click()
await page.locator('.dropzone input[type=file]').setInputFiles(fixture('fixtures/scale.musicxml'))
await page.waitForTimeout(250)
expect(await page.locator('.dropzone').first().evaluate(el => el.classList.contains('filled')), 'MusicXML 文件载入')
await page.getByRole('button', { name: '转换为简谱' }).click()
await page.waitForTimeout(400)
expect((await page.locator('.toast').textContent() || '').includes('已导入五线谱'), '五线谱导入成功提示')
expect(await page.locator('.note-cell').count() === 8, 'MusicXML 转换出 8 个音符')
await page.screenshot({ path: shot('03-staff.png'), fullPage: true })

console.log('五线谱生成 MIDI')
await tab('五线谱转谱').click()
const staffMidiPromise = page.waitForEvent('download', { timeout: 10000 })
await page.getByRole('button', { name: /从这份五线谱生成 MIDI/ }).click()
expect((await staffMidiPromise).suggestedFilename().endsWith('.mid'), 'MusicXML 五线谱可直接生成 MIDI')

console.log('五线谱图片 OCR')
await tab('图片转谱').click()
await page.locator('.dropzone input[type=file]').setInputFiles(fixture('fixtures/staff.png'))
await page.getByRole('button', { name: '识别五线谱图片' }).click()
await page.locator('.overlay-img').waitFor({ timeout: 60000 })
expect(await page.locator('.ocr-notes span').count() === 7, '图片 OCR 识别出 7 个音符')
expect((await page.locator('.stat-row.four .stat b').first().textContent()) === '7', '符头统计正确')
await page.screenshot({ path: shot('05-ocr.png'), fullPage: true })
const ocrMidiPromise = page.waitForEvent('download', { timeout: 10000 })
await page.getByRole('button', { name: '导出 MIDI' }).click()
expect((await ocrMidiPromise).suggestedFilename().endsWith('.mid'), '图片识别结果可导出 MIDI')
await page.getByRole('button', { name: '应用到乐谱' }).click()
await page.waitForTimeout(250)
expect(await page.locator('.note-cell').count() === 7, '图片识别结果可应用到乐谱')

console.log('听歌转谱')
await tab('听歌转谱').click()
await page.locator('.dropzone input[type=file]').setInputFiles(fixture('fixtures/melody.wav'))
await page.getByRole('button', { name: '开始提取主旋律' }).click()
await page.locator('.result-card .stat-row').waitFor({ timeout: 60000 })
const stats = await page.locator('.result-card .stat b').allTextContents()
console.log('    识别统计:', stats.join(' / '))
expect(Number(stats[0]) >= 5, '音频转谱识别出至少 5 个音符')
expect(await page.locator('.pitch-canvas').isVisible(), '音高轨迹图显示')
await page.screenshot({ path: shot('04-audio.png'), fullPage: true })
await page.getByRole('button', { name: '应用到乐谱并继续编辑' }).click()
await page.waitForTimeout(300)
expect(await page.locator('.note-cell').count() > 0, '音频结果可应用到乐谱')

console.log('播放与导出')
await page.locator('.play-btn').click()
await page.waitForTimeout(350)
expect((await page.locator('.play-btn').textContent() || '').includes('停止'), '播放按钮切换为停止状态')
await page.locator('.play-btn').click()
const downloadPromise = page.waitForEvent('download', { timeout: 10000 })
await page.locator('.content-bar').getByRole('button', { name: '导出 MIDI' }).click()
const download = await downloadPromise
expect(download.suggestedFilename().endsWith('.mid'), `MIDI 导出文件名正确: ${download.suggestedFilename()}`)

console.log('页面错误:', errors.length ? errors.join(' | ') : '无')
if (errors.length) failures++
await browser.close()
console.log(failures ? `\n${failures} 项浏览器检查失败` : '\n浏览器检查全部通过')
process.exitCode = failures ? 1 : 0

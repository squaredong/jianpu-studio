import fs from 'node:fs'
import { chromium } from 'playwright-core'
import { fileURLToPath } from 'node:url'

const out = fileURLToPath(new URL('fixtures/staff.png', import.meta.url))
const S = 16
const top = 58
const lines = [0, 1, 2, 3, 4].map(i => top + i * S)
const notes = [
  { step: 0, dur: 1 },
  { step: 2, dur: 1 },
  { step: 4, dur: 1 },
  { step: 5, dur: 1 },
  { step: 4, dur: 1 },
  { step: 2, dur: 1 },
  { step: 0, dur: 1 },
]
const startX = 250
const gapX = 88

const noteSvg = notes.map((n, i) => {
  const x = startX + i * gapX
  const y = lines[4] - n.step * S / 2
  const stemUp = n.step < 4
  const stem = stemUp
    ? `<line x1="${x + 10}" y1="${y}" x2="${x + 10}" y2="${y - 54}" stroke="#111" stroke-width="2"/>`
    : `<line x1="${x - 10}" y1="${y}" x2="${x - 10}" y2="${y + 54}" stroke="#111" stroke-width="2"/>`
  return `<ellipse cx="${x}" cy="${y}" rx="10.5" ry="7" fill="#111" transform="rotate(-18 ${x} ${y})"/>${stem}`
}).join('')

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0;background:#fff}svg{display:block}
</style></head><body><svg xmlns="http://www.w3.org/2000/svg" width="940" height="190" viewBox="0 0 940 190">
<rect width="940" height="190" fill="#fff"/>
${lines.map(y => `<line x1="40" y1="${y}" x2="900" y2="${y}" stroke="#111" stroke-width="1.6"/>`).join('')}
${noteSvg}
</svg></body></html>`

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
})
const page = await browser.newPage({ viewport: { width: 940, height: 190 }, deviceScaleFactor: 2 })
await page.setContent(html)
await page.locator('svg').screenshot({ path: out })

// 第二张：混合时值（四分 / 八分 / 二分 / 全音符）
const varied = [
  { step: 0, type: 'quarter' },
  { step: 2, type: 'eighth' },
  { step: 4, type: 'eighth' },
  { step: 5, type: 'half' },
  { step: 4, type: 'whole' },
  { step: 2, type: 'quarter' },
]
const variedSvg = varied.map((n, i) => {
  const x = startX + i * gapX
  const y = lines[4] - n.step * S / 2
  const hollow = n.type === 'half' || n.type === 'whole'
  const head = `<ellipse cx="${x}" cy="${y}" rx="10.5" ry="7" fill="${hollow ? '#fff' : '#111'}" stroke="#111" stroke-width="2.5" transform="rotate(-18 ${x} ${y})"/>`
  if (n.type === 'whole') return head
  const up = n.step < 4
  let stem = up
    ? `<line x1="${x + 10}" y1="${y}" x2="${x + 10}" y2="${y - 54}" stroke="#111" stroke-width="2"/>`
    : `<line x1="${x - 10}" y1="${y}" x2="${x - 10}" y2="${y + 54}" stroke="#111" stroke-width="2"/>`
  if (n.type === 'eighth') {
    stem += up
      ? `<path d="M ${x + 10} ${y - 54} q 20 8 16 28" fill="none" stroke="#111" stroke-width="4"/>`
      : `<path d="M ${x - 10} ${y + 54} q -20 -8 -16 -28" fill="none" stroke="#111" stroke-width="4"/>`
  }
  return head + stem
}).join('')
const html2 = html.replace(noteSvg, variedSvg)
const out2 = fileURLToPath(new URL('fixtures/staff-varied.png', import.meta.url))
await page.setContent(html2)
await page.locator('svg').screenshot({ path: out2 })
await browser.close()
console.log('staff images ready:', out, out2)

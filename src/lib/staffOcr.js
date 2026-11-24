// 五线谱图片识别（轻量 OMR）：五线检测 -> 音符头定位 -> 音高/时值推断 -> 简谱
// 目标场景：清晰扫描或截图、单行五线谱、无复杂声部与歌词。
import { midiToJianpu } from './musicTheory.js'
import { midiEventsToScore, createDefaultScore, snapDuration } from './score.js'

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B']
const SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
const SHARP_KEYS = { G: 1, D: 2, A: 3, E: 4, B: 5, 'F#': 6, 'C#': 7 }
const FLAT_KEYS = { F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6, Cb: -7 }
const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B']
const FLAT_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F']

function median(values) {
  if (!values.length) return 0
  const s = [...values].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

async function loadImage(file) {
  let bitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    bitmap = await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = URL.createObjectURL(file)
    })
  }
  const width = bitmap.width || bitmap.naturalWidth
  const height = bitmap.height || bitmap.naturalHeight
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(bitmap, 0, 0, width, height)
  if (bitmap.close) bitmap.close()
  return { canvas, ctx, width, height, image: ctx.getImageData(0, 0, width, height) }
}

function toGrayscale(img) {
  const gray = new Uint8Array(img.width * img.height)
  for (let i = 0, p = 0; i < img.data.length; i += 4, p++) {
    gray[p] = Math.round(0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2])
  }
  return gray
}

function otsuThreshold(gray) {
  const hist = new Uint32Array(256)
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++
  const total = gray.length
  let sum = 0
  for (let i = 0; i < 256; i++) sum += i * hist[i]
  let sumB = 0, wB = 0, best = -1, threshold = 160
  for (let i = 0; i < 256; i++) {
    wB += hist[i]
    if (!wB) continue
    const wF = total - wB
    if (!wF) break
    sumB += i * hist[i]
    const mB = sumB / wB
    const mF = (sum - sumB) / wF
    const between = wB * wF * (mB - mF) * (mB - mF)
    if (between > best) { best = between; threshold = i }
  }
  return threshold
}

function detectStaffLines(binary, width, height) {
  const profile = new Float64Array(height)
  for (let y = 0; y < height; y++) {
    let count = 0
    const row = y * width
    for (let x = 0; x < width; x++) count += binary[row + x]
    profile[y] = count
  }
  const minCoverage = width * 0.32
  const peaks = []
  for (let y = 2; y < height - 2; y++) {
    if (profile[y] >= minCoverage && profile[y] >= profile[y - 1] && profile[y] > profile[y + 1]) peaks.push(y)
  }
  const groups = []
  for (const y of peaks) {
    const last = groups[groups.length - 1]
    if (last && y - last.end <= 3) last.end = y
    else groups.push({ start: y, end: y })
  }
  const centers = groups.map(g => {
    let sum = 0, weight = 0
    for (let y = g.start; y <= g.end; y++) { sum += y * profile[y]; weight += profile[y] }
    return weight ? sum / weight : (g.start + g.end) / 2
  })

  const staves = []
  for (let i = 0; i + 4 < centers.length; i++) {
    const five = centers.slice(i, i + 5)
    const diffs = five.slice(1).map((v, k) => v - five[k])
    const spacing = median(diffs)
    if (spacing >= 4 && diffs.every(d => Math.abs(d - spacing) <= Math.max(2.5, spacing * 0.3))) {
      staves.push({ lines: five, spacing })
      i += 4
    }
  }
  if (!staves.length) throw new Error('没有检测到五条谱线，请上传清晰的单行五线谱图片。')
  return staves[0]
}

// 空心符头是一个上下有弧线、左右有边缘的圆环；用它排除符干与装饰性的细线
function hollowShape(binary, width, height, x, y, S) {
  const hw = Math.round(S * 0.72)
  const hh = Math.round(S * 0.5)
  const strong = []
  for (let dy = -hh; dy <= hh; dy++) {
    let count = 0, left = 0, right = 0
    const row = (y + dy) * width
    if (row < 0) continue
    for (let dx = -hw; dx <= hw; dx++) {
      if (binary[row + x + dx]) {
        count++
        if (dx < 0) left++
        else right++
      }
    }
    if (count >= S * 0.5 && left >= S * 0.14 && right >= S * 0.14) strong.push(dy)
  }
  if (strong.length < 2) return null
  const top = strong[0], bottom = strong[strong.length - 1]
  if (bottom - top < S * 0.35) return null
  const centerY = y + Math.round((top + bottom) / 2)
  // 闭合性检查：空心符头是完整圆环，符尾只是开放曲线
  const rx = S * 0.62, ry = S * 0.38
  let hits = 0
  for (let k = 0; k < 12; k++) {
    const angle = k / 12 * Math.PI * 2
    let found = false
    for (let t = -2; t <= 2; t += 2) {
      const px = Math.round(x + Math.cos(angle) * (rx + t))
      const py = Math.round(centerY + Math.sin(angle) * (ry + t))
      if (py >= 0 && py < height && px >= 0 && px < width && binary[py * width + px]) { found = true; break }
    }
    if (found) hits++
  }
  return hits >= 9 ? centerY : null
}

function detectNoteheads(binary, width, height, staff) {
  const { lines, spacing: S } = staff
  const hw = Math.max(4, S * 0.72)
  const hh = Math.max(3, S * 0.46)
  const yMin = Math.max(2, Math.floor(lines[0] - S * 1.1))
  const yMax = Math.min(height - 3, Math.ceil(lines[4] + S * 1.1))
  const xStart = Math.max(2, Math.floor(width * 0.13))
  const dxMax = Math.ceil(hw), dyMax = Math.ceil(hh)
  const candidates = []

  for (let y = yMin; y <= yMax; y++) {
    for (let x = xStart; x < width - 2; x++) {
      let dark = 0, total = 0
      for (let dy = -dyMax; dy <= dyMax; dy++) {
        for (let dx = -dxMax; dx <= dxMax; dx++) {
          if ((dx * dx) / (hw * hw) + (dy * dy) / (hh * hh) > 1) continue
          total++
          if (binary[(y + dy) * width + (x + dx)]) dark++
        }
      }
      const density = dark / total
      if (density >= 0.58) {
        candidates.push({ x, y, density, filled: true, score: density })
      } else if (density >= 0.27 && density < 0.52) {
        let centerDark = 0
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) centerDark += binary[(y + dy) * width + (x + dx)] ? 1 : 0
        }
        if (centerDark <= 3) {
          const centerY = hollowShape(binary, width, height, x, y, S)
          if (centerY != null) candidates.push({ x, y: centerY, density, filled: false, score: density * 0.82 })
        }
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score)
  const kept = []
  for (const c of candidates) {
    // 同一个符头会在上下相邻位置产生次级候选，按横向邻近度统一抑制
    if (kept.some(k => Math.abs(k.x - c.x) < S * 1.25 && Math.abs(k.y - c.y) < S * 1.9)) continue
    kept.push(c)
  }
  kept.sort((a, b) => a.x - b.x)
  return kept
}

function countDark(binary, width, height, x0, x1, y0, y1) {
  let count = 0
  const xa = Math.max(0, Math.floor(x0)), xb = Math.min(width - 1, Math.ceil(x1))
  const ya = Math.max(0, Math.floor(y0)), yb = Math.min(height - 1, Math.ceil(y1))
  for (let y = ya; y <= yb; y++) {
    const row = y * width
    for (let x = xa; x <= xb; x++) count += binary[row + x]
  }
  return count
}

function stemInfo(binary, width, height, note, S) {
  let up = 0, down = 0
  // 符干位置随排版略有差异，沿符头两侧多点取样取最大值
  for (const offset of [0.52, 0.62, 0.72, 0.82]) {
    const right = note.x + S * offset
    const left = note.x - S * offset
    up = Math.max(up, countDark(binary, width, height, right, right + 4, note.y - S * 3.4, note.y - S * 0.5))
    down = Math.max(down, countDark(binary, width, height, left - 4, left, note.y + S * 0.5, note.y + S * 3.4))
  }
  const threshold = S * 1.7
  return { up: up > threshold, down: down > threshold, upCount: up, downCount: down }
}

function hasFlag(binary, width, height, note, S, up) {
  const x0 = note.x + (up ? S * 0.72 + 3 : -S * 2.6)
  const x1 = x0 + S * 1.9
  const y0 = up ? note.y - S * 3.5 : note.y + S * 1.2
  const y1 = up ? note.y - S * 1.2 : note.y + S * 3.5
  const area = Math.max(1, (x1 - x0) * (y1 - y0))
  const density = countDark(binary, width, height, x0, x1, y0, y1) / area
  return density > 0.13
}

function hasBeam(binary, width, height, a, b, S, up) {
  if (!b || b.x - a.x < S * 1.2 || b.x - a.x > S * 14) return false
  const yCenter = a.y + (up ? -S * 3.3 : S * 3.3)
  let best = 0
  for (let dy = -2; dy <= 2; dy++) {
    const y = Math.round(yCenter + dy)
    let dark = 0
    for (let x = Math.round(a.x + S); x <= Math.round(b.x - S); x++) {
      if (binary[y * width + x]) dark++
    }
    best = Math.max(best, dark / Math.max(1, b.x - a.x - 2 * S))
  }
  return best > 0.35
}

function hasDot(binary, width, height, note, S) {
  // 附点是一个紧凑的圆形墨块；谱线虽然也经过该区域，但只有一两像素高
  const cx = Math.round(note.x + S * 1.18)
  const cy = Math.round(note.y)
  const r = Math.max(3, Math.round(S * 0.22))
  let dark = 0, total = 0
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      total++
      const px = cx + dx, py = cy + dy
      if (px >= 0 && px < width && py >= 0 && py < height && binary[py * width + px]) dark++
    }
  }
  if (dark / total < 0.42) return false
  let run = 0, longest = 0
  for (let dy = -r; dy <= r; dy++) {
    const py = cy + dy
    if (py >= 0 && py < height && binary[py * width + cx]) { run++; longest = Math.max(longest, run) } else run = 0
  }
  return longest >= Math.max(3, Math.round(S * 0.22))
}

function keyAlterations(tonic) {
  const fifths = SHARP_KEYS[tonic] ?? FLAT_KEYS[tonic] ?? 0
  const map = {}
  if (fifths > 0) SHARP_ORDER.slice(0, fifths).forEach(l => { map[l] = 1 })
  if (fifths < 0) FLAT_ORDER.slice(0, -fifths).forEach(l => { map[l] = -1 })
  return map
}

function stepToMidi(step, clef, alterations) {
  const startLetter = clef === 'bass' ? 'G' : 'E'
  const startOctave = clef === 'bass' ? 2 : 4
  const index = LETTERS.indexOf(startLetter) + startOctave * 7 + step
  const letter = LETTERS[((index % 7) + 7) % 7]
  const octave = Math.floor(index / 7)
  return {
    letter,
    octave,
    midi: (octave + 1) * 12 + SEMITONES[letter] + (alterations[letter] || 0),
  }
}

function pitchLabel(step, clef, alterations) {
  const p = stepToMidi(step, clef, alterations)
  return `${p.letter}${p.octave}`
}

export const OCR_DEFAULTS = {
  clef: 'treble',
  tonic: 'C',
  mode: 'major',
  timeSignature: [4, 4],
  tempo: 100,
  insertRests: true,
}

export async function recognizeStaffImage(file, settings = {}, onProgress = () => {}) {
  const cfg = { ...OCR_DEFAULTS, ...settings }
  onProgress(8, '正在读取图片…')
  const image = await loadImage(file)
  const { width, height, canvas, ctx } = image
  if (width < 150 || height < 60) throw new Error('图片尺寸太小，请上传更清晰的五线谱图片。')

  onProgress(18, '正在二值化…')
  const gray = toGrayscale(image.image)
  const threshold = otsuThreshold(gray)
  const binary = new Uint8Array(gray.length)
  for (let i = 0; i < gray.length; i++) binary[i] = gray[i] < threshold ? 1 : 0

  onProgress(30, '正在检测五线…')
  const staff = detectStaffLines(binary, width, height)
  const S = staff.spacing
  onProgress(48, '正在定位音符头…')
  const heads = detectNoteheads(binary, width, height, staff)
  if (heads.length < 2) throw new Error('没有识别出音符头，请确认图片中是单行五线谱且谱面清晰。')

  onProgress(65, '正在分析符干与时值…')
  const alterations = keyAlterations(cfg.tonic)
  const notes = heads.map((h, i) => {
    const stem = stemInfo(binary, width, height, h, S)
    const up = stem.up || (!stem.down && h.y > (staff.lines[0] + staff.lines[4]) / 2)
    const flag = hasFlag(binary, width, height, h, S, up)
    const beam = hasBeam(binary, width, height, h, heads[i + 1], S, up)
    const dot = hasDot(binary, width, height, h, S)
    let duration = !stem.up && !stem.down ? (h.filled ? 1 : 4)
      : !h.filled ? 2 : (flag || beam) ? 0.5 : 1
    if (dot) duration *= 1.5
    const step = Math.round((staff.lines[4] - h.y) / (S / 2))
    const pitch = stepToMidi(step, cfg.clef, alterations)
    return { ...h, duration, step, midi: pitch.midi, label: pitchLabel(step, cfg.clef, alterations), stemUp: up }
  })

  // 依据音符跨度估计单位宽度，填补过大的空白为休止符
  const unitCandidates = []
  for (let i = 0; i + 1 < notes.length; i++) {
    const factor = (notes[i].duration + notes[i + 1].duration) / 2
    if (factor > 0) unitCandidates.push((notes[i + 1].x - notes[i].x) / factor)
  }
  const unit = median(unitCandidates) || S * 3
  const events = []
  let beat = 0
  notes.forEach((n, i) => {
    if (cfg.insertRests && i + 1 < notes.length) {
      const expected = (n.duration + notes[i + 1].duration) / 2 * unit
      const extra = (notes[i + 1].x - n.x) - expected
      if (extra > unit * 1.3) {
        const restBeats = Math.min(4, Math.max(0.5, Math.round(extra / unit * 2) / 2))
        events.push({ midi: null, startBeat: beat, durationBeats: restBeats })
        beat += restBeats
      }
    }
    events.push({ midi: n.midi, startBeat: beat, durationBeats: n.duration })
    beat += n.duration
  })

  onProgress(82, '正在生成简谱…')
  const key = { tonic: cfg.tonic, mode: cfg.mode }
  const converted = midiEventsToScore(events, key)
  const score = createDefaultScore()
  score.title = (file.name || '五线谱图片').replace(/\.[^.]+$/, '')
  score.key = key
  score.timeSignature = cfg.timeSignature
  score.tempo = cfg.tempo
  score.notes = converted.notes

  // 标注预览：在原图上框出识别到的音符并写出音名
  ctx.lineWidth = 2
  ctx.strokeStyle = '#22c55e'
  ctx.fillStyle = '#22c55e'
  ctx.font = `bold ${Math.max(11, Math.round(S * 0.9))}px sans-serif`
  notes.forEach(n => {
    ctx.strokeRect(n.x - S * 0.8, n.y - S * 0.6, S * 1.6, S * 1.2)
    ctx.fillText(n.label, n.x - S * 0.5, n.y - S * 1.0)
  })
  ctx.strokeStyle = 'rgba(59,130,246,0.75)'
  ctx.lineWidth = 1
  staff.lines.forEach(y => {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke()
  })

  onProgress(100, '识别完成')
  return {
    score,
    overlay: canvas.toDataURL('image/png'),
    diagnostics: {
      width, height, staffLines: staff.lines.length, spacing: Math.round(S),
      noteheads: heads.length, wholeNotes: notes.filter(n => n.duration >= 4).length,
      halfNotes: notes.filter(n => n.duration === 2).length,
      shortNotes: notes.filter(n => n.duration <= 0.5).length,
      detectedRests: events.filter(e => e.midi === null).length,
      threshold,
    },
    notes: notes.map(n => ({
      x: n.x, y: n.y, midi: n.midi, label: n.label,
      jianpu: midiToJianpu(n.midi, key), duration: snapDuration(n.duration),
    })),
  }
}

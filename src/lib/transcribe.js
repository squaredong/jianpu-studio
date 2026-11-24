// 音频 -> 主旋律 -> 简谱
// 使用 FFT + 谐波积谱估计每帧音高，再做音符切分、节拍量化。
// 适用范围：单声部或旋律明显突出的音频（哼唱、口哨、单件乐器最理想）。

import { midiToJianpu } from './musicTheory.js'
import { midiEventsToScore, snapDuration, createDefaultScore } from './score.js'

const FRAME_SIZE = 4096
const HOP_SIZE = 512

class FFT {
  constructor(n) {
    this.n = n
    this.rev = new Uint32Array(n)
    const bits = Math.round(Math.log2(n))
    for (let i = 0; i < n; i++) {
      let r = 0
      for (let b = 0; b < bits; b++) if (i & (1 << b)) r |= 1 << (bits - 1 - b)
      this.rev[i] = r
    }
    this.cos = new Float64Array(n / 2)
    this.sin = new Float64Array(n / 2)
    for (let i = 0; i < n / 2; i++) {
      this.cos[i] = Math.cos(-2 * Math.PI * i / n)
      this.sin[i] = Math.sin(-2 * Math.PI * i / n)
    }
    this.window = new Float64Array(n)
    for (let i = 0; i < n; i++) this.window[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1))
  }

  forward(re, im) {
    const n = this.n
    for (let i = 0; i < n; i++) {
      const j = this.rev[i]
      if (j > i) {
        let t = re[i]; re[i] = re[j]; re[j] = t
        t = im[i]; im[i] = im[j]; im[j] = t
      }
    }
    for (let size = 2; size <= n; size *= 2) {
      const half = size / 2
      const step = n / size
      for (let i = 0; i < n; i += size) {
        for (let j = 0, k = 0; j < half; j++, k += step) {
          const wr = this.cos[k], wi = this.sin[k]
          const a = i + j, b = a + half
          const tr = re[b] * wr - im[b] * wi
          const ti = re[b] * wi + im[b] * wr
          re[b] = re[a] - tr; im[b] = im[a] - ti
          re[a] += tr; im[a] += ti
        }
      }
    }
  }
}

function median(values) {
  if (!values.length) return 0
  const s = [...values].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function toMono(buffer) {
  const channels = buffer.numberOfChannels
  const length = buffer.length
  const mono = new Float32Array(length)
  for (let c = 0; c < channels; c++) {
    const data = buffer.getChannelData(c)
    for (let i = 0; i < length; i++) mono[i] += data[i] / channels
  }
  return mono
}

function estimateTempo(onsets) {
  if (onsets.length < 3) return null
  const iois = []
  for (let i = 1; i < onsets.length; i++) {
    const d = onsets[i] - onsets[i - 1]
    if (d > 0.14 && d < 2.2) iois.push(d)
  }
  if (iois.length < 2) return null
  let bestBpm = null
  let bestScore = -Infinity
  for (let bpm = 60; bpm <= 200; bpm += 0.5) {
    const beat = 60 / bpm
    let score = 0
    for (const ioi of iois) {
      const ratio = ioi / beat
      const nearest = Math.max(1, Math.round(ratio))
      const err = (ratio - nearest) / nearest
      score += Math.exp(-(err * err) / (2 * 0.11 * 0.11))
    }
    if (score > bestScore) { bestScore = score; bestBpm = bpm }
  }
  return bestBpm
}

export async function transcribeAudio(arrayBuffer, options = {}, onProgress = () => {}) {
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  let buffer
  try {
    buffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0))
  } catch {
    throw new Error('无法解码这个音频文件，请换成 WAV / MP3 / M4A / OGG 格式再试。')
  }
  onProgress(15, '音频解码完成，正在分析频谱…')

  const sampleRate = buffer.sampleRate
  const mono = toMono(buffer)
  const fft = new FFT(FRAME_SIZE)
  const hopSec = HOP_SIZE / sampleRate
  const frameCount = Math.max(1, Math.floor((mono.length - FRAME_SIZE) / HOP_SIZE))
  if (frameCount < 4) throw new Error('音频太短了，至少需要 0.2 秒以上。')

  const minMidi = Math.max(24, Math.round(69 + 12 * Math.log2((options.minFreq || 196) / 440)))
  const maxMidi = Math.min(96, Math.round(69 + 12 * Math.log2((options.maxFreq || 1050) / 440)))
  const binHz = sampleRate / FRAME_SIZE
  const re = new Float64Array(FRAME_SIZE)
  const im = new Float64Array(FRAME_SIZE)
  const spectrum = new Float64Array(FRAME_SIZE / 2 + 1)
  const track = []

  for (let f = 0; f < frameCount; f++) {
    const offset = f * HOP_SIZE
    let energy = 0
    for (let i = 0; i < FRAME_SIZE; i++) {
      const s = mono[offset + i] || 0
      re[i] = s * fft.window[i]
      im[i] = 0
      energy += s * s
    }
    const rms = Math.sqrt(energy / FRAME_SIZE)
    fft.forward(re, im)
    for (let k = 0; k < spectrum.length; k++) spectrum[k] = Math.hypot(re[k], im[k])

    let bestPitch = null
    let bestScore = -Infinity
    for (let m = minMidi; m <= maxMidi; m++) {
      const freq = 440 * Math.pow(2, (m - 69) / 12)
      const bin = Math.round(freq / binHz)
      if (bin < 2 || bin * 5 >= spectrum.length - 1) continue
      // 抛物线插值：用精确频率处的谱峰值，避免 FFT 频点取整造成的半音偏差
      const interp = (hz) => {
        const pos = hz / binHz
        const b = Math.round(pos)
        if (b < 1 || b >= spectrum.length - 1) return 1e-7
        const a = Math.log(spectrum[b - 1] + 1e-7)
        const c = Math.log(spectrum[b] + 1e-7)
        const d = Math.log(spectrum[b + 1] + 1e-7)
        const denom = a - 2 * c + d
        const delta = Math.abs(denom) > 1e-9 ? Math.max(-0.5, Math.min(0.5, 0.5 * (a - d) / denom)) : 0
        return Math.exp(c - 0.25 * (a - d) * delta)
      }
      const weights = [1, 0.68, 0.45, 0.3, 0.2]
      let score = 0
      for (let h = 1; h <= 5; h++) score += weights[h - 1] * Math.log(interp(freq * h))
      if (score > bestScore) { bestScore = score; bestPitch = m }
    }
    track.push({ t: f * hopSec, midi: bestPitch, score: bestScore, rms })

    if (f % 180 === 0) {
      onProgress(15 + Math.round(50 * f / frameCount), '正在提取音高轨迹…')
      await new Promise(resolve => setTimeout(resolve, 0))
    }
  }

  onProgress(67, '正在切分音符…')
  const scores = track.map(x => x.score).filter(Number.isFinite).sort((a, b) => a - b)
  const lowQ = scores[Math.floor(scores.length * 0.25)] ?? 0
  const highQ = scores[Math.floor(scores.length * 0.75)] ?? 1
  const scoreThreshold = lowQ + (highQ - lowQ) * (options.sensitivity ?? 0.42)
  const rmsMax = track.reduce((max, x) => Math.max(max, x.rms), 1e-6)
  const rmsThreshold = rmsMax * 0.035

  // 中值平滑音高，抑制抖动
  const smoothed = track.map((x, i) => {
    const neighbors = []
    for (let j = Math.max(0, i - 2); j <= Math.min(track.length - 1, i + 2); j++) {
      if (track[j].voiced !== false && track[j].score > scoreThreshold) neighbors.push(track[j].midi)
    }
    return { ...x, midi: neighbors.length >= 2 ? Math.round(median(neighbors)) : x.midi }
  })

  smoothed.forEach(x => {
    x.voiced = x.score > scoreThreshold && x.rms > rmsThreshold && x.midi != null
  })

  // 用较宽的中值窗口得到稳定音高，避免逐帧抖动把音符切碎
  const stableTrack = smoothed.map((x, i) => {
    const neighbors = []
    for (let j = Math.max(0, i - 5); j <= Math.min(smoothed.length - 1, i + 5); j++) {
      if (smoothed[j].voiced) neighbors.push(smoothed[j].midi)
    }
    return { ...x, stable: neighbors.length >= 3 ? Math.round(median(neighbors)) : x.midi }
  })

  // 形态学闭运算：填补音符内部零星的低置信度帧
  const closedTrack = stableTrack.map((x, i) => {
    if (x.voiced) return x
    let neighbors = 0
    for (let j = Math.max(0, i - 3); j <= Math.min(stableTrack.length - 1, i + 3); j++) {
      if (stableTrack[j].voiced) neighbors++
    }
    return neighbors >= 3 ? { ...x, voiced: true } : x
  })

  // 合并连续同音高帧为音符
  const groups = []
  let current = null
  for (const x of closedTrack) {
    if (!x.voiced) {
      if (current) groups.push(current)
      current = null
      continue
    }
    const same = current && x.stable === current.pitch
    if (same) {
      current.pitches.push(x.midi)
      current.end = x.t + hopSec
    } else {
      if (current) groups.push(current)
      current = { start: x.t, end: x.t + hopSec, pitch: x.stable, pitches: [x.midi] }
    }
  }
  if (current) groups.push(current)

  const minNoteSec = 0.11
  const meaningful = groups.filter(g => g.end - g.start >= minNoteSec)
  if (!meaningful.length) throw new Error('没有识别出清晰的旋律，请换一段旋律更突出的音频试试。')

  // 合并相邻同音高碎片
  const merged = []
  for (const g of meaningful) {
    const pitch = Math.round(median(g.pitches))
    const last = merged[merged.length - 1]
    if (last && last.pitch === pitch && g.start - last.end < 0.2) {
      last.end = g.end
    } else {
      merged.push({ ...g, pitch })
    }
  }

  onProgress(80, '正在识别节拍并量化…')
  const detectedTempo = estimateTempo(merged.map(g => g.start))
  const tempo = detectedTempo || options.tempo || 120
  const beatSec = 60 / tempo
  const events = []
  let cursor = 0
  const grid = (sec) => Math.max(0, Math.round(sec / beatSec * 4) / 4)
  merged.forEach((g, i) => {
    const start = grid(g.start)
    let end = Math.max(start + 0.25, grid(g.end))
    const nextStart = i + 1 < merged.length ? grid(merged[i + 1].start) : null
    // 识别出的音符尾音常有轻微缺口，若与下一音相差不足半拍则连成一个音
    if (nextStart != null && nextStart >= start && nextStart - end <= 0.75) end = nextStart
    const duration = snapDuration(end - start)
    if (start > cursor + 1e-6) events.push({ midi: null, startBeat: cursor, durationBeats: start - cursor })
    events.push({ midi: g.pitch, startBeat: start, durationBeats: duration })
    cursor = start + duration
  })

  const key = options.key || { tonic: 'C', mode: 'major' }
  const converted = midiEventsToScore(events, key)
  const score = createDefaultScore()
  score.title = options.title || '音频转谱'
  score.key = { ...key }
  score.tempo = Math.round(tempo)
  score.notes = converted.notes
  if (!score.notes.some(n => n.degree !== 0)) throw new Error('识别结果为空，请调整频率范围或灵敏度后重试。')

  onProgress(100, '转换完成')
  await audioCtx.close()

  return {
    score,
    diagnostics: {
      detectedTempo: detectedTempo ? Math.round(detectedTempo) : null,
      usedTempo: Math.round(tempo),
      durationSec: Math.round(buffer.duration * 10) / 10,
      rawGroups: groups.length,
      keptGroups: merged.length,
      voicedRatio: Math.round(smoothed.filter(x => x.voiced).length / smoothed.length * 100),
      sampleRate,
    },
    ...(options.debug ? { debugTrack: closedTrack.map(x => ({ t: +x.t.toFixed(3), midi: x.midi, stable: x.stable, score: +x.score.toFixed(1), rms: +x.rms.toFixed(4), voiced: x.voiced })) } : {}),
    track: merged.map(g => ({
      start: g.start,
      end: g.end,
      midi: Math.round(median(g.pitches)),
      degree: midiToJianpu(Math.round(median(g.pitches)), key),
    })),
  }
}

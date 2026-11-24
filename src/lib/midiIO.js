// MIDI 文件导入 / 导出
import * as midiPkg from '@tonejs/midi'
const Midi = midiPkg.Midi || midiPkg.default?.Midi || midiPkg.default
import { jianpuToMidi, tonicSemitone, NOTE_NAMES, FLAT_NAMES } from './musicTheory.js'
import { midiEventsToScore, createDefaultScore } from './score.js'

function normalizeTonic(key) {
  const name = String(key || '').trim()
  if (NOTE_NAMES.includes(name)) return name
  if (FLAT_NAMES.includes(name)) return NOTE_NAMES[FLAT_NAMES.indexOf(name)]
  return 'C'
}

function detectKey(midi) {
  const sig = midi.header.keySignatures?.[0]
  if (sig?.key) {
    return { tonic: normalizeTonic(sig.key), mode: sig.scale === 'minor' ? 'minor' : 'major', source: '文件调号' }
  }
  // 没有调号信息时，用音高类直方图做简单估计（Krumhansl 轮廓近似）
  const histogram = new Array(12).fill(0)
  const notes = midi.tracks.flatMap(t => t.notes)
  notes.forEach(n => { histogram[((n.midi % 12) + 12) % 12] += 1 })
  const majorProfile = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
  const minorProfile = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]
  let best = { score: -Infinity, tonic: 'C', mode: 'major' }
  for (let pc = 0; pc < 12; pc++) {
    for (const [mode, profile] of [['major', majorProfile], ['minor', minorProfile]]) {
      let score = 0
      for (let i = 0; i < 12; i++) score += histogram[i] * profile[(i - pc + 12) % 12]
      if (score > best.score) best = { score, tonic: NOTE_NAMES[pc], mode }
    }
  }
  return { tonic: best.tonic, mode: best.mode, source: '自动估计' }
}

function detectTempo(midi) {
  const explicit = midi.header.tempos?.[0]?.bpm
  if (explicit && explicit > 20 && explicit < 400) return Math.round(explicit)
  return 120
}

export function parseMidiBuffer(arrayBuffer, fileName = '') {
  const midi = new Midi(arrayBuffer)
  const ppq = midi.header.ppq || 480
  const notes = midi.tracks.flatMap(track => track.notes)
  if (!notes.length) throw new Error('这个 MIDI 文件里没有找到音符。')

  const keyInfo = detectKey(midi)
  const key = { tonic: keyInfo.tonic, mode: keyInfo.mode }
  const events = notes.map(n => ({
    midi: n.midi,
    startBeat: n.ticks / ppq,
    durationBeats: n.durationTicks / ppq,
  }))

  const result = midiEventsToScore(events, key)
  if (!result.notes.length) throw new Error('MIDI 内容无法转换为简谱。')

  const score = createDefaultScore()
  const timeSig = midi.header.timeSignatures?.[0]?.timeSignature
  score.title = (fileName || '').replace(/\.(mid|midi)$/i, '') || midi.header.name || '导入的 MIDI'
  score.key = key
  score.tempo = detectTempo(midi)
  if (Array.isArray(timeSig) && timeSig[0] > 0 && timeSig[1] > 0) score.timeSignature = [timeSig[0], timeSig[1]]
  score.notes = result.notes

  return {
    score,
    info: {
      noteCount: notes.length,
      trackCount: midi.tracks.length,
      skipped: result.skipped,
      keySource: keyInfo.source,
      durationBeats: result.endBeat,
    },
  }
}

export function downloadMidi(score, fileName) {
  const midi = new Midi()
  midi.header.setTempo(score.tempo || 120)
  midi.header.name = score.title || '简谱工坊'
  midi.header.timeSignatures = [{ ticks: 0, timeSignature: score.timeSignature || [4, 4] }]
  midi.header.keySignatures = [{
    ticks: 0,
    key: NOTE_NAMES[tonicSemitone(score.key?.tonic)] || 'C',
    scale: score.key?.mode === 'minor' ? 'minor' : 'major',
  }]

  const track = midi.addTrack()
  track.name = '主旋律'
  let beat = 0
  for (const note of score.notes) {
    const duration = Number(note.duration) || 1
    if (note.degree !== 0) {
      track.addNote({
        midi: jianpuToMidi(note, score.key),
        ticks: Math.round(beat * midi.header.ppq),
        durationTicks: Math.round(duration * midi.header.ppq),
        velocity: 0.8,
      })
    }
    beat += duration
  }

  const bytes = midi.toArray()
  const blob = new Blob([bytes], { type: 'audio/midi' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${(fileName || score.title || 'score').replace(/[\\/:*?"<>|]/g, '_')}.mid`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

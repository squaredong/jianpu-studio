// 音名与音高换算工具：简谱 <-> MIDI <-> 频率

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

export const KEY_OPTIONS = [
  'Cb', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F',
  'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#',
]

export const MAJOR_OFFSETS = [0, 2, 4, 5, 7, 9, 11]
export const MINOR_OFFSETS = [0, 2, 3, 5, 7, 8, 10]

export function tonicSemitone(tonic) {
  const name = String(tonic || 'C').trim()
  const sharpIndex = NOTE_NAMES.indexOf(name)
  if (sharpIndex >= 0) return sharpIndex
  const flatIndex = FLAT_NAMES.indexOf(name)
  if (flatIndex >= 0) return flatIndex
  return 0
}

export function scaleOffsets(mode) {
  return mode === 'minor' ? MINOR_OFFSETS : MAJOR_OFFSETS
}

export function midiToFrequency(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

export function midiToName(midi) {
  const n = Math.round(midi)
  return `${NOTE_NAMES[((n % 12) + 12) % 12]}${Math.floor(n / 12) - 1}`
}

// 将 MIDI 音高映射为简谱：{degree: 1-7, accidental: -1|0|1, octave: 相对八度}
export function midiToJianpu(midi, key) {
  const base = 60 + tonicSemitone(key?.tonic)
  const offsets = scaleOffsets(key?.mode)
  let best = null
  for (let oct = -5; oct <= 5; oct++) {
    for (let d = 0; d < 7; d++) {
      const pitch = base + oct * 12 + offsets[d]
      const diff = midi - pitch
      if (!best || Math.abs(diff) < Math.abs(best.diff)) {
        best = { degree: d + 1, octave: oct, diff }
      }
    }
  }
  return {
    degree: best.degree,
    octave: best.octave,
    accidental: Math.max(-2, Math.min(2, best.diff)),
  }
}

export function jianpuToMidi(note, key) {
  const offsets = scaleOffsets(key?.mode)
  return 60 + tonicSemitone(key?.tonic) + 12 * (note.octave || 0)
    + offsets[(note.degree || 1) - 1] + (note.accidental || 0)
}

// 时值（以四分音符为 1 拍）的显示信息
export function durationInfo(duration) {
  const d = Number(duration) || 1
  if (d < 1) {
    const lines = Math.max(1, Math.min(3, Math.round(-Math.log2(d))))
    const dotted = Math.abs(d / Math.pow(0.5, lines) - 1.5) < 0.01
    return { lines, dashes: 0, dotted, label: lines === 1 ? '八分' : lines === 2 ? '十六分' : '三十二分' }
  }
  const whole = Math.floor(d)
  const dashes = Math.max(0, whole - 1)
  const remainder = d - whole
  const dotted = Math.abs(remainder - 0.5) < 0.01 || Math.abs(d - 1.5) < 0.01
  return {
    lines: 0,
    dashes: dotted && Math.abs(remainder - 0.5) < 0.01 ? dashes : dashes,
    dotted,
    label: d === 4 ? '全音符' : d === 2 ? '二分' : d === 1 ? '四分' : dotted ? '附点' : `${d}拍`,
  }
}

export function keyLabel(key) {
  const tonic = key?.tonic || 'C'
  return key?.mode === 'minor' ? `1=${tonic} · 小调` : `1=${tonic}`
}

// MusicXML fifths -> 大调主音名
export function fifthsToMajorTonic(fifths) {
  const order = ['Cb', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#']
  return order[Math.max(-7, Math.min(7, fifths)) + 7]
}

// 相对小调主音（大调主音下方小三度）
export function relativeMinorTonic(majorTonic) {
  const pc = (tonicSemitone(majorTonic) + 9) % 12
  return NOTE_NAMES[pc]
}

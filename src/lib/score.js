// 乐谱数据模型与常用操作
import { midiToJianpu } from './musicTheory.js'

export const MAX_LYRIC_LINES = 8

let noteSeq = 0
export function newId() {
  noteSeq += 1
  return `n${Date.now().toString(36)}${noteSeq}`
}

export function normalizeLyrics(lyrics, lineCount = 1) {
  const source = Array.isArray(lyrics) ? lyrics : []
  const count = Math.max(0, Math.min(MAX_LYRIC_LINES, Number(lineCount) || 0))
  return Array.from({ length: count }, (_, i) => String(source[i] ?? ''))
}

export function createNote({ degree = 1, accidental = 0, octave = 0, duration = 1, lyrics, id } = {}) {
  const source = Array.isArray(lyrics) ? lyrics : ['']
  const count = Math.max(1, Math.min(MAX_LYRIC_LINES, source.length))
  return { id: id || newId(), degree, accidental, octave, duration, lyrics: normalizeLyrics(source, count) }
}

export function restNote(duration = 1) {
  return createNote({ degree: 0, duration })
}

export function createDefaultScore() {
  return {
    title: '未命名乐谱',
    key: { tonic: 'C', mode: 'major' },
    timeSignature: [4, 4],
    tempo: 120,
    lyricLines: ['歌词 1'],
    notes: [],
  }
}

// 兼容旧工程 / 外部导入：补齐歌词行与音符歌词字段
export function normalizeScore(score) {
  const base = createDefaultScore()
  if (!score || typeof score !== 'object') return base

  const importedLines = Array.isArray(score.lyricLines) ? score.lyricLines : []
  const notes = Array.isArray(score.notes) ? score.notes : []
  const maxFromNotes = notes.reduce((max, n) => Math.max(max, Array.isArray(n?.lyrics) ? n.lyrics.length : 0), 0)
  const lineCount = Math.max(1, Math.min(MAX_LYRIC_LINES, importedLines.length || maxFromNotes || 1))
  const lyricLines = Array.from({ length: lineCount }, (_, i) =>
    String(importedLines[i] ?? `歌词 ${i + 1}`) || `歌词 ${i + 1}`,
  )

  return {
    ...base,
    ...score,
    key: { ...base.key, ...(score.key || {}) },
    timeSignature: Array.isArray(score.timeSignature) && score.timeSignature.length === 2
      ? score.timeSignature
      : base.timeSignature,
    lyricLines,
    notes: notes.map(n => ({
      ...n,
      degree: Number(n?.degree) || 0,
      accidental: Number(n?.accidental) || 0,
      octave: Number(n?.octave) || 0,
      duration: Number(n?.duration) || 1,
      lyrics: normalizeLyrics(n?.lyrics, lineCount),
      id: n?.id || newId(),
    })),
  }
}

export function hasLyrics(score) {
  return (score?.notes || []).some(n => (n?.lyrics || []).some(text => String(text ?? '').trim() !== ''))
}

export function addLyricLine(score) {
  const lines = score?.lyricLines || []
  if (lines.length >= MAX_LYRIC_LINES) return score
  const nextCount = lines.length + 1
  return {
    ...score,
    lyricLines: [...lines, `歌词 ${nextCount}`],
    notes: (score?.notes || []).map(n => ({ ...n, lyrics: normalizeLyrics(n.lyrics, nextCount) })),
  }
}

export function removeLyricLine(score, lineIndex) {
  const lines = score?.lyricLines || []
  if (lines.length <= 1 || lineIndex < 0 || lineIndex >= lines.length) return score
  return {
    ...score,
    lyricLines: lines.filter((_, i) => i !== lineIndex),
    notes: (score?.notes || []).map(n => ({
      ...n,
      lyrics: normalizeLyrics(n.lyrics, lines.length).filter((_, i) => i !== lineIndex),
    })),
  }
}

export function renameLyricLine(score, lineIndex, name) {
  const lines = score?.lyricLines || []
  if (lineIndex < 0 || lineIndex >= lines.length) return score
  return {
    ...score,
    lyricLines: lines.map((line, i) => i === lineIndex ? String(name ?? '') : line),
  }
}

export function setNoteLyric(score, noteIndex, lineIndex, text) {
  const notes = score?.notes || []
  if (noteIndex < 0 || noteIndex >= notes.length) return score
  const lineCount = (score?.lyricLines || []).length
  if (lineIndex < 0 || lineIndex >= lineCount) return score
  const lyrics = normalizeLyrics(notes[noteIndex].lyrics, lineCount)
  lyrics[lineIndex] = String(text ?? '')
  return {
    ...score,
    notes: notes.map((n, i) => i === noteIndex ? { ...n, lyrics } : n),
  }
}

export const DURATION_OPTIONS = [
  { value: 4, label: '全', hint: '4 拍' },
  { value: 2, label: '二分', hint: '2 拍' },
  { value: 1, label: '四分', hint: '1 拍' },
  { value: 0.5, label: '八分', hint: '0.5 拍' },
  { value: 0.25, label: '十六分', hint: '0.25 拍' },
]

export const SNAP_DURATIONS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8]

export function snapDuration(beats) {
  if (!Number.isFinite(beats) || beats <= 0) return 1
  let best = SNAP_DURATIONS[0]
  for (const value of SNAP_DURATIONS) {
    if (Math.abs(value - beats) < Math.abs(best - beats)) best = value
  }
  return best
}

export function beatsPerMeasure(score) {
  const [beats, unit = 4] = score.timeSignature || [4, 4]
  return beats * (4 / unit)
}

// 按拍号切分小节
export function buildMeasures(notes, score) {
  const limit = beatsPerMeasure(score)
  const measures = []
  let current = []
  let filled = 0
  for (const note of notes) {
    const dur = Number(note.duration) || 1
    if (current.length && filled + dur > limit + 1e-6) {
      measures.push(current)
      current = []
      filled = 0
    }
    current.push(note)
    filled += dur
    if (filled >= limit - 1e-6) {
      measures.push(current)
      current = []
      filled = 0
    }
  }
  if (current.length) measures.push(current)
  return measures
}

export function totalBeats(notes) {
  return notes.reduce((sum, n) => sum + (Number(n.duration) || 0), 0)
}

export function noteDurationSeconds(note, tempo) {
  return (Number(note.duration) || 1) * 60 / (Number(tempo) || 120)
}

// 将长休止拆成标准时值序列
function splitRestDurations(beats) {
  const pieces = []
  let left = Math.max(0.25, Math.round(beats / 0.25) * 0.25)
  while (left > 0.001) {
    const piece = left >= 4 ? 4 : left >= 3 ? 3 : left >= 2 ? 2 : left >= 1 ? 1
      : left >= 0.75 ? 0.75 : left >= 0.5 ? 0.5 : 0.25
    pieces.push(piece)
    left = Math.round((left - piece) * 1000) / 1000
  }
  return pieces.length ? pieces : [1]
}

// MIDI 事件 -> 简谱音符序列（导入功能的公共转换）
// events: [{ midi, startBeat, durationBeats }]
export function midiEventsToScore(events, key) {
  const sorted = [...events]
    .filter(e => Number.isFinite(e.midi))
    .sort((a, b) => a.startBeat - b.startBeat)
  const notes = []
  let cursor = 0
  let skipped = 0

  for (const ev of sorted) {
    const start = Math.max(0, Math.round(ev.startBeat / 0.25) * 0.25)
    const duration = snapDuration(ev.durationBeats)
    if (start > cursor + 1e-6) {
      for (const d of splitRestDurations(start - cursor)) notes.push(restNote(d))
      cursor = start
    } else if (start < cursor - 1e-6) {
      skipped += 1 // 和声/重叠音符：简谱为单声部，保留先出现的音
      continue
    }
    notes.push(createNote({ ...midiToJianpu(ev.midi, key), duration, lyrics: ev.lyrics }))
    cursor = start + duration
  }

  return { notes, skipped, endBeat: cursor }
}

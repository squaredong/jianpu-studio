// MusicXML（五线谱）解析 -> 简谱
import { fifthsToMajorTonic, relativeMinorTonic, NOTE_NAMES, FLAT_NAMES } from './musicTheory.js'
import { midiEventsToScore, createDefaultScore } from './score.js'

const STEP_SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
const TYPE_BEATS = {
  '1024th': 0.00390625, '512th': 0.0078125, '256th': 0.015625,
  '128th': 0.03125, '64th': 0.0625, '32nd': 0.125, '16th': 0.25,
  eighth: 0.5, quarter: 1, half: 2, whole: 4, breve: 8, longa: 16,
}

function tagText(el, tag) {
  return el?.getElementsByTagName(tag)?.[0]?.textContent?.trim() ?? null
}

export function listMusicXmlParts(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length) throw new Error('无法解析这个 MusicXML 文件，请确认文件格式。')
  const parts = [...doc.getElementsByTagName('score-part')]
  return parts.map((p, index) => ({
    index,
    id: p.getAttribute('id'),
    name: tagText(p, 'part-name') || `声部 ${index + 1}`,
  }))
}

function parseTonicFromFifths(fifths, mode) {
  const major = fifthsToMajorTonic(fifths)
  if (mode === 'minor') {
    return { tonic: relativeMinorTonic(major), mode, source: 'MusicXML 调号' }
  }
  return { tonic: major, mode: 'major', source: 'MusicXML 调号' }
}

export function parseMusicXml(xmlText, partIndex = 0) {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length) throw new Error('无法解析这个 MusicXML 文件，请确认文件格式。')

  const parts = [...doc.getElementsByTagName('part')]
  if (!parts.length) throw new Error('文件里没有找到五线谱声部。')
  const part = parts[Math.min(Math.max(0, partIndex), parts.length - 1)]
  const partName = listMusicXmlParts(xmlText)[partIndex]?.name || '主旋律'

  let divisions = 1
  let keyInfo = { tonic: 'C', mode: 'major', source: '默认' }
  let timeSignature = [4, 4]
  let tempo = 120
  const events = []
  let cursor = 0
  let rawNoteCount = 0

  for (const measure of [...part.getElementsByTagName('measure')]) {
    for (const child of [...measure.childNodes].filter(n => n.nodeType === 1)) {
      const name = child.tagName.toLowerCase()

      if (name === 'attributes') {
        const div = Number(tagText(child, 'divisions'))
        if (div > 0) divisions = div
        const fifths = Number(tagText(child, 'fifths'))
        if (Number.isFinite(fifths) && tagText(child, 'fifths') !== null) {
          keyInfo = parseTonicFromFifths(fifths, tagText(child, 'mode'))
        }
        const beats = Number(tagText(child, 'beats'))
        const beatType = Number(tagText(child, 'beat-type'))
        if (beats > 0 && beatType > 0) timeSignature = [beats, beatType]
        continue
      }

      if (name === 'sound') {
        const t = Number(child.getAttribute('tempo'))
        if (t > 20 && t < 400) tempo = Math.round(t)
        continue
      }

      if (name === 'direction') {
        const sound = child.getElementsByTagName('sound')[0]
        const t = Number(sound?.getAttribute('tempo'))
        if (t > 20 && t < 400) tempo = Math.round(t)
        continue
      }

      if (name !== 'note') continue
      rawNoteCount += 1

      const isChord = child.getElementsByTagName('chord').length > 0
      const durationTicks = Number(tagText(child, 'duration')) || divisions
      const type = tagText(child, 'type')
      const dotCount = child.getElementsByTagName('dot').length
      const dotFactor = dotCount ? 2 - Math.pow(0.5, dotCount) : 1
      let durationBeats = TYPE_BEATS[type]
        ? TYPE_BEATS[type] * dotFactor
        : durationTicks / divisions

      const pitchEl = child.getElementsByTagName('pitch')[0]
      const isRest = !pitchEl || child.getElementsByTagName('rest').length > 0
      let midi = null
      if (!isRest && pitchEl) {
        const step = tagText(pitchEl, 'step') || 'C'
        const alter = Number(tagText(pitchEl, 'alter') || 0)
        const octave = Number(tagText(pitchEl, 'octave') || 4)
        midi = (octave + 1) * 12 + (STEP_SEMITONES[step] ?? 0) + alter
      }

      if (isChord && events.length) {
        const last = events[events.length - 1]
        if (midi !== null && (last.midi === null || midi > last.midi)) last.midi = midi
        last.durationBeats = Math.max(last.durationBeats, durationBeats)
      } else {
        events.push({ midi, startBeat: cursor, durationBeats })
        cursor += durationBeats
      }
    }
  }

  if (!events.length) throw new Error('这个声部里没有找到可转换的音符。')

  const key = { tonic: keyInfo.tonic, mode: keyInfo.mode }
  const result = midiEventsToScore(events, key)
  const score = createDefaultScore()
  score.title = partName
  score.key = key
  score.timeSignature = timeSignature
  score.tempo = tempo
  score.notes = result.notes

  return {
    score,
    info: {
      partName,
      partCount: parts.length,
      rawNoteCount,
      skipped: result.skipped,
      keySource: keyInfo.source,
      durationBeats: result.endBeat,
    },
  }
}

export function normalizeTonicForExport(tonic) {
  if (NOTE_NAMES.includes(tonic)) return tonic
  if (FLAT_NAMES.includes(tonic)) return NOTE_NAMES[FLAT_NAMES.indexOf(tonic)]
  return 'C'
}

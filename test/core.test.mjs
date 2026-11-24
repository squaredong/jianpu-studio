import assert from 'node:assert/strict'
import { DOMParser } from '@xmldom/xmldom'
import midiPkg from '@tonejs/midi'
const { Midi } = midiPkg

globalThis.DOMParser = DOMParser

const { midiToJianpu, jianpuToMidi, durationInfo } = await import('../src/lib/musicTheory.js')
const {
  midiEventsToScore, createDefaultScore, createNote, buildMeasures,
  normalizeScore, hasLyrics, addLyricLine, removeLyricLine, setNoteLyric,
} = await import('../src/lib/score.js')
const { parseMidiBuffer } = await import('../src/lib/midiIO.js')
const { parseMusicXml, listMusicXmlParts } = await import('../src/lib/musicXml.js')

let passed = 0
function check(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`) }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1 }
}

console.log('音高映射')
check('C 大调 C4 -> 1', () => assert.deepEqual(midiToJianpu(60, { tonic: 'C', mode: 'major' }), { degree: 1, octave: 0, accidental: 0 }))
check('C 大调 D4 -> 2', () => assert.equal(midiToJianpu(62, { tonic: 'C', mode: 'major' }).degree, 2))
check('C 大调 C#4 -> 1#', () => assert.deepEqual(midiToJianpu(61, { tonic: 'C', mode: 'major' }), { degree: 1, octave: 0, accidental: 1 }))
check('C 大调 C3 -> 低音 1', () => assert.equal(midiToJianpu(48, { tonic: 'C', mode: 'major' }).octave, -1))
check('G 大调 G4 -> 1', () => assert.equal(midiToJianpu(67, { tonic: 'G', mode: 'major' }).degree, 1))
check('小调音阶映射', () => assert.equal(midiToJianpu(60, { tonic: 'A', mode: 'minor' }).degree, 3))
check('简谱 -> MIDI 往返一致', () => {
  const j = midiToJianpu(69, { tonic: 'D', mode: 'major' })
  assert.equal(jianpuToMidi(j, { tonic: 'D', mode: 'major' }), 69)
})
check('时值显示信息', () => {
  assert.equal(durationInfo(0.5).lines, 1)
  assert.equal(durationInfo(0.25).lines, 2)
  assert.equal(durationInfo(0.75).dotted, true)
  assert.equal(durationInfo(3).dashes, 2)
})

console.log('乐谱处理')
check('MIDI 事件带休止 gap', () => {
  const r = midiEventsToScore([
    { midi: 60, startBeat: 0, durationBeats: 1 },
    { midi: 64, startBeat: 2, durationBeats: 2 },
  ], { tonic: 'C', mode: 'major' })
  assert.deepEqual(r.notes.map(n => [n.degree, n.duration]), [[1, 1], [0, 1], [3, 2]])
})
check('小节切分', () => {
  const score = { ...createDefaultScore(), timeSignature: [4, 4] }
  const r = midiEventsToScore([
    { midi: 60, startBeat: 0, durationBeats: 1 },
    { midi: 62, startBeat: 1, durationBeats: 1 },
    { midi: 64, startBeat: 2, durationBeats: 1 },
    { midi: 65, startBeat: 3, durationBeats: 1 },
    { midi: 67, startBeat: 4, durationBeats: 2 },
  ], score.key)
  assert.equal(buildMeasures(r.notes, score).length, 2)
})

console.log('歌词录入')
check('新音符默认带一行空歌词', () => {
  assert.deepEqual(createNote().lyrics, [''])
  assert.deepEqual(createNote({ lyrics: ['床', '床前'] }).lyrics, ['床', '床前'])
})
check('设置歌词并按行写入', () => {
  const score = { ...createDefaultScore(), notes: [createNote(), createNote()] }
  const next = setNoteLyric(score, 1, 0, '前')
  assert.equal(next.notes[1].lyrics[0], '前')
  assert.equal(score.notes[1].lyrics[0], '', '原谱不被就地修改')
  assert.equal(hasLyrics(next), true)
})
check('增删歌词行同步所有音符', () => {
  let score = { ...createDefaultScore(), notes: [createNote({ lyrics: ['床'] }), createNote()] }
  score = addLyricLine(score)
  assert.equal(score.lyricLines.length, 2)
  assert.deepEqual(score.notes.map(n => n.lyrics.length), [2, 2])
  score = setNoteLyric(score, 1, 1, '明月')
  score = removeLyricLine(score, 0)
  assert.deepEqual(score.notes.map(n => n.lyrics), [[''], ['明月']])
})
check('旧工程归一化后补齐歌词字段', () => {
  const legacy = {
    title: '旧谱',
    key: { tonic: 'C', mode: 'major' },
    timeSignature: [4, 4],
    notes: [{ id: 'a', degree: 1, duration: 1 }],
  }
  const normalized = normalizeScore(legacy)
  assert.deepEqual(normalized.lyricLines, ['歌词 1'])
  assert.deepEqual(normalized.notes[0].lyrics, [''])
  assert.equal(normalized.notes[0].id, 'a')
})

console.log('MIDI 导入')
check('解析生成的 MIDI', () => {
  const midi = new Midi()
  midi.header.setTempo(100)
  midi.header.keySignatures = [{ ticks: 0, key: 'C', scale: 'major' }]
  midi.header.timeSignatures = [{ ticks: 0, timeSignature: [4, 4] }]
  const track = midi.addTrack()
  ;[60, 64, 67, 72].forEach((m, i) => track.addNote({ midi: m, ticks: i * 480, durationTicks: 480 }))
  const bytes = midi.toArray()
  const result = parseMidiBuffer(bytes.buffer.slice(0), 'demo.mid')
  assert.deepEqual(result.score.notes.map(n => n.degree), [1, 3, 5, 1])
  assert.equal(result.score.tempo, 100)
  assert.equal(result.score.title, 'demo')
  assert.equal(result.info.noteCount, 4)
})

console.log('MusicXML 导入')
const xml = `<?xml version="1.0" encoding="utf-8"?>
<score-partwise version="4.0">
  <work><work-title>测试曲</work-title></work>
  <part-list><score-part id="P1"><part-name>旋律</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>96</per-minute></metronome></direction-type><sound tempo="96"/></direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type><lyric number="1"><syllabic>single</syllabic><text>床</text></lyric><lyric number="2"><syllabic>single</syllabic><text>床前</text></lyric></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type><lyric number="1"><syllabic>single</syllabic><text>前</text></lyric><lyric number="2"><syllabic>single</syllabic><text>明月</text></lyric></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`
check('列出声部', () => assert.equal(listMusicXmlParts(xml)[0].name, '旋律'))
check('解析音符与调号拍号速度', () => {
  const r = parseMusicXml(xml)
  assert.deepEqual(r.score.notes.map(n => n.degree), [1, 3, 5, 1])
  assert.equal(r.score.notes[3].octave, 1)
  assert.equal(r.score.tempo, 96)
  assert.deepEqual(r.score.timeSignature, [4, 4])
})
check('MusicXML 多行歌词导入', () => {
  const r = parseMusicXml(xml)
  assert.equal(r.score.lyricLines.length, 2)
  assert.deepEqual(r.score.notes[0].lyrics.slice(0, 2), ['床', '床前'])
  assert.equal(r.score.notes[1].lyrics[0], '前')
  assert.equal(r.score.notes[1].lyrics[1], '明月')
})
check('G 大调调号识别', () => {
  const gxml = xml.replace('<fifths>0</fifths>', '<fifths>1</fifths>')
  assert.equal(parseMusicXml(gxml).score.key.tonic, 'G')
})

console.log(`\n通过 ${passed} 项检查`)

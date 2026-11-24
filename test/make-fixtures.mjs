import fs from 'node:fs'
import midiPkg from '@tonejs/midi'
const { Midi } = midiPkg

const dir = new URL('./fixtures/', import.meta.url)

// 生成测试 MIDI
const midi = new Midi()
midi.header.setTempo(108)
midi.header.keySignatures = [{ ticks: 0, key: 'C', scale: 'major' }]
midi.header.timeSignatures = [{ ticks: 0, timeSignature: [4, 4] }]
const track = midi.addTrack()
;[60, 64, 67, 72, 67, 64].forEach((m, i) => track.addNote({ midi: m, ticks: i * 480, durationTicks: 480 }))
fs.writeFileSync(new URL('scale.mid', dir), Buffer.from(midi.toArray()))

// 生成测试 MusicXML
const xml = `<?xml version="1.0" encoding="utf-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>测试旋律</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>2</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><type>quarter</type></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><type>eighth</type></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><type>eighth</type></note>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>2</duration><type>quarter</type></note>
    </measure>
    <measure number="2">
      <note><pitch><step>B</step><octave>4</octave></pitch><duration>2</duration><type>quarter</type></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>2</duration><type>quarter</type></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>2</duration><type>quarter</type></note>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`
fs.writeFileSync(new URL('scale.musicxml', dir), xml)

// 生成测试 WAV：单声道正弦旋律，120 BPM，每音一拍
const sampleRate = 44100
const beatSec = 0.5
const notes = [60, 62, 64, 65, 67, 69, 71, 72]
const duration = notes.length * beatSec + 0.3
const total = Math.floor(duration * sampleRate)
const samples = new Int16Array(total)
notes.forEach((m, i) => {
  const freq = 440 * Math.pow(2, (m - 69) / 12)
  const start = Math.floor(i * beatSec * sampleRate)
  const len = Math.floor((beatSec - 0.06) * sampleRate)
  for (let j = 0; j < len && start + j < total; j++) {
    const t = j / sampleRate
    const envelope = Math.min(1, j / (0.02 * sampleRate)) * Math.min(1, (len - j) / (0.06 * sampleRate))
    const value = (Math.sin(2 * Math.PI * freq * t) * 0.72 + Math.sin(4 * Math.PI * freq * t) * 0.22) * envelope * 0.65
    samples[start + j] = Math.round(value * 32767)
  }
})
const header = Buffer.alloc(44)
header.write('RIFF', 0)
header.writeUInt32LE(36 + samples.byteLength, 4)
header.write('WAVE', 8)
header.write('fmt ', 12)
header.writeUInt32LE(16, 16)
header.writeUInt16LE(1, 20)
header.writeUInt16LE(1, 22)
header.writeUInt32LE(sampleRate, 24)
header.writeUInt32LE(sampleRate * 2, 28)
header.writeUInt16LE(2, 32)
header.writeUInt16LE(16, 34)
header.write('data', 36)
header.writeUInt32LE(samples.byteLength, 40)
fs.writeFileSync(new URL('melody.wav', dir), Buffer.concat([header, Buffer.from(samples.buffer)]))

console.log('fixtures ready')

// Web Audio 合成播放：无需外部音色库，离线可用
import { jianpuToMidi, midiToFrequency } from './musicTheory.js'
import { noteDurationSeconds } from './score.js'

class AudioEngine {
  constructor() {
    this.ctx = null
    this.master = null
    this.voices = new Set()
    this.timers = []
    this.playing = false
  }

  ensureContext() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext
      this.ctx = new Ctx()
      this.master = this.ctx.createGain()
      this.master.gain.value = 0.85
      this.master.connect(this.ctx.destination)
    }
    if (this.ctx.state === 'suspended') this.ctx.resume()
    return this.ctx
  }

  scheduleTone(midi, startTime, seconds, velocity = 1) {
    const ctx = this.ensureContext()
    const freq = midiToFrequency(midi)
    const end = startTime + seconds

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, startTime)
    gain.gain.exponentialRampToValueAtTime(0.28 * velocity, startTime + 0.018)
    gain.gain.setValueAtTime(0.22 * velocity, Math.max(startTime + 0.02, end - 0.06))
    gain.gain.exponentialRampToValueAtTime(0.0001, end)
    gain.connect(this.master)

    const osc = ctx.createOscillator()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(freq, startTime)

    const overtone = ctx.createOscillator()
    overtone.type = 'sine'
    overtone.frequency.setValueAtTime(freq * 2, startTime)
    const overtoneGain = ctx.createGain()
    overtoneGain.gain.value = 0.16
    overtone.connect(overtoneGain)
    overtoneGain.connect(gain)

    osc.connect(gain)
    osc.start(startTime)
    overtone.start(startTime)
    osc.stop(end + 0.02)
    overtone.stop(end + 0.02)

    const voice = { osc, overtone, gain }
    this.voices.add(voice)
    osc.onended = () => {
      try { osc.disconnect(); overtone.disconnect(); overtoneGain.disconnect(); gain.disconnect() } catch { /* noop */ }
      this.voices.delete(voice)
    }
  }

  previewNote(note, key, tempo = 120) {
    if (!note || note.degree === 0) return
    const ctx = this.ensureContext()
    const seconds = Math.max(0.18, Math.min(0.8, noteDurationSeconds(note, tempo)))
    this.scheduleTone(jianpuToMidi(note, key), ctx.currentTime + 0.01, seconds)
  }

  play(score, { onNote, onEnd } = {}) {
    this.stop()
    const ctx = this.ensureContext()
    if (!score.notes.length) return
    const startAt = ctx.currentTime + 0.12
    let t = startAt

    score.notes.forEach((note, index) => {
      const seconds = noteDurationSeconds(note, score.tempo)
      if (note.degree !== 0) {
        this.scheduleTone(jianpuToMidi(note, score.key), t, Math.max(0.08, seconds * 0.92))
      }
      const delay = Math.max(0, (t - ctx.currentTime) * 1000)
      this.timers.push(setTimeout(() => onNote?.(index), delay))
      t += seconds
    })

    this.playing = true
    this.timers.push(setTimeout(() => {
      this.playing = false
      onEnd?.()
    }, Math.max(0, (t - ctx.currentTime) * 1000) + 120))
  }

  stop() {
    this.timers.forEach(clearTimeout)
    this.timers = []
    this.playing = false
    for (const voice of this.voices) {
      try { voice.osc.stop(); voice.overtone.stop() } catch { /* already stopped */ }
    }
    this.voices.clear()
  }
}

export const audioEngine = new AudioEngine()

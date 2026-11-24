import React, { useEffect, useRef, useState } from 'react'
import { KEY_OPTIONS } from '../lib/musicTheory'
import { transcribeAudio } from '../lib/transcribe'

const RANGES = [
  { label: '人声 / 通用', minFreq: 196, maxFreq: 1050 },
  { label: '男声 / 低音乐器', minFreq: 130, maxFreq: 520 },
  { label: '女声 / 高音乐器', minFreq: 260, maxFreq: 1500 },
]

function PitchTrack({ track, duration }) {
  const ref = useRef(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !track?.length) return
    const dpr = window.devicePixelRatio || 1
    const w = canvas.clientWidth, h = canvas.clientHeight
    canvas.width = w * dpr
    canvas.height = h * dpr
    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, w, h)

    ctx.strokeStyle = 'rgba(255,255,255,0.08)'
    ctx.lineWidth = 1
    for (let i = 1; i < 4; i++) {
      const y = h * i / 4
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke()
    }

    const min = Math.min(...track.map(n => n.midi)) - 2
    const max = Math.max(...track.map(n => n.midi)) + 2
    const total = Math.max(duration || 1, track[track.length - 1].end)
    const palette = ['#f5b942', '#5ad1c0', '#8ea7ff', '#f58fa8', '#a7d86f', '#e6a0f5', '#f2d06b']
    track.forEach(n => {
      const x = n.start / total * w
      const barW = Math.max(3, (n.end - n.start) / total * w - 2)
      const y = h - ((n.midi - min) / (max - min || 1)) * (h - 12) - 6
      ctx.fillStyle = palette[(n.degree.degree - 1) % palette.length]
      ctx.fillRect(x, y, barW, 6)
    })
  }, [track, duration])

  return <canvas ref={ref} className="pitch-canvas" />
}

export default function AudioPanel({ score, onApply, onStatus }) {
  const [file, setFile] = useState(null)
  const [rangeIdx, setRangeIdx] = useState(0)
  const [sensitivity, setSensitivity] = useState(0.42)
  const [tonic, setTonic] = useState(score.key.tonic)
  const [mode, setMode] = useState(score.key.mode)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [stage, setStage] = useState('')
  const [result, setResult] = useState(null)
  const inputRef = useRef(null)

  async function handleTranscribe() {
    if (!file) { onStatus('error', '请先选择一个音频文件。'); return }
    setBusy(true)
    setResult(null)
    setProgress(0)
    try {
      const buffer = await file.arrayBuffer()
      const res = await transcribeAudio(buffer, {
        minFreq: RANGES[rangeIdx].minFreq,
        maxFreq: RANGES[rangeIdx].maxFreq,
        sensitivity,
        key: { tonic, mode },
        tempo: score.tempo,
        title: file.name.replace(/\.[^.]+$/, ''),
      }, (p, s) => { setProgress(p); setStage(s) })
      setResult(res)
      onStatus('success', `识别完成：${res.score.notes.length} 个音符，${res.diagnostics.usedTempo} BPM`)
    } catch (err) {
      onStatus('error', err.message || '音频转换失败。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panel-grid">
      <div className="panel-card">
        <div className="panel-card-title"><span className="step">1</span> 选择音频</div>
        <div
          className={`dropzone${file ? ' filled' : ''}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) { setFile(f); setResult(null) } }}
        >
          <input
            ref={inputRef}
            type="file"
            accept="audio/*,.wav,.mp3,.m4a,.ogg,.flac"
            hidden
            onChange={e => { const f = e.target.files?.[0]; if (f) { setFile(f); setResult(null) } }}
          />
          <div className="drop-icon">{file ? '♫' : '↥'}</div>
          <div className="drop-main">{file ? file.name : '点击选择，或把音频拖到这里'}</div>
          <div className="drop-sub">{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : 'WAV / MP3 / M4A / OGG / FLAC'}</div>
        </div>

        <div className="field">
          <label>旋律音域</label>
          <select value={rangeIdx} onChange={e => setRangeIdx(Number(e.target.value))}>
            {RANGES.map((r, i) => <option key={r.label} value={i}>{r.label}</option>)}
          </select>
        </div>
        <div className="field-row">
          <div className="field">
            <label>调号</label>
            <select value={tonic} onChange={e => setTonic(e.target.value)}>
              {KEY_OPTIONS.map(k => <option key={k} value={k}>1={k}</option>)}
            </select>
          </div>
          <div className="field">
            <label>调式</label>
            <select value={mode} onChange={e => setMode(e.target.value)}>
              <option value="major">大调</option>
              <option value="minor">小调</option>
            </select>
          </div>
        </div>
        <div className="field">
          <label>识别灵敏度 <span className="field-value">{Math.round(sensitivity * 100)}%</span></label>
          <input type="range" min="0.15" max="0.75" step="0.01" value={sensitivity} onChange={e => setSensitivity(Number(e.target.value))} />
        </div>

        <button className="primary-btn full" disabled={busy || !file} onClick={handleTranscribe}>
          {busy ? '识别中…' : '开始提取主旋律'}
        </button>
        {busy && (
          <div className="progress-block">
            <div className="progress-bar"><div style={{ width: `${progress}%` }} /></div>
            <div className="progress-label">{stage} · {progress}%</div>
          </div>
        )}
        <p className="hint">适合哼唱、口哨、单件乐器或旋律明显突出的歌曲。伴奏很强的成品歌曲建议先用伴奏消除工具处理。</p>
      </div>

      <div className="panel-card result-card">
        <div className="panel-card-title"><span className="step">2</span> 识别结果</div>
        {!result ? (
          <div className="result-empty">
            <div className="empty-icon">◌</div>
            <div>识别结果会显示在这里</div>
            <div className="empty-sub">包含音高轨迹、节拍估计与简谱预览</div>
          </div>
        ) : (
          <>
            <div className="stat-row">
              <div className="stat"><b>{result.score.notes.length}</b><span>音符</span></div>
              <div className="stat"><b>{result.diagnostics.usedTempo}</b><span>BPM{result.diagnostics.detectedTempo ? ' (识别)' : ' (默认)'}</span></div>
              <div className="stat"><b>{result.diagnostics.durationSec}s</b><span>音频时长</span></div>
              <div className="stat"><b>{result.diagnostics.keptGroups}</b><span>旋律片段</span></div>
            </div>
            <div className="track-label">音高轨迹</div>
            <PitchTrack track={result.track} duration={result.diagnostics.durationSec} />
            <div className="result-preview">
              {result.score.notes.slice(0, 48).map(n => n.degree === 0 ? '0' : `${n.degree < 0 ? '' : ''}${n.degree}`).join(' ')}
              {result.score.notes.length > 48 ? ' …' : ''}
            </div>
            <button className="primary-btn full" onClick={() => { onApply(result.score); setResult(null) }}>
              应用到乐谱并继续编辑
            </button>
          </>
        )}
      </div>
    </div>
  )
}

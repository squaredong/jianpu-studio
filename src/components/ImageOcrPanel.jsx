import React, { useRef, useState } from 'react'
import { KEY_OPTIONS } from '../lib/musicTheory'
import { OCR_DEFAULTS, recognizeStaffImage } from '../lib/staffOcr'
import { downloadMidi } from '../lib/midiIO'

export default function ImageOcrPanel({ score, onApply, onStatus }) {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [cfg, setCfg] = useState({ ...OCR_DEFAULTS })
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [stage, setStage] = useState('')
  const [result, setResult] = useState(null)
  const inputRef = useRef(null)

  function pickFile(f) {
    if (!f) return
    setFile(f)
    setResult(null)
    const reader = new FileReader()
    reader.onload = () => setPreview(reader.result)
    reader.readAsDataURL(f)
  }

  function update(key, value) {
    setCfg(v => ({ ...v, [key]: value }))
  }

  async function handleRecognize() {
    if (!file) { onStatus('error', '请先上传一张五线谱图片。'); return }
    setBusy(true)
    setResult(null)
    setProgress(0)
    try {
      const res = await recognizeStaffImage(file, cfg, (p, s) => { setProgress(p); setStage(s) })
      setResult(res)
      onStatus('success', `识别完成：${res.score.notes.length} 个音符，可在预览图中核对`)
    } catch (err) {
      onStatus('error', err.message || '图片识别失败。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panel-grid">
      <div className="panel-card">
        <div className="panel-card-title"><span className="step">1</span> 上传五线谱图片</div>
        <div
          className={`dropzone${file ? ' filled image-drop' : ''}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); pickFile(e.dataTransfer.files?.[0]) }}
        >
          <input ref={inputRef} type="file" accept="image/*" hidden onChange={e => pickFile(e.target.files?.[0])} />
          {preview ? <img src={preview} alt="五线谱预览" className="drop-preview" /> : <><div className="drop-icon">⊞</div><div className="drop-main">点击选择，或把图片拖到这里</div><div className="drop-sub">PNG / JPG / WEBP · 单行五线谱效果最佳</div></>}
        </div>
        {file && <div className="file-caption">{file.name} · {(file.size / 1024).toFixed(0)} KB · <button onClick={() => { setFile(null); setPreview(null); setResult(null) }}>重新选择</button></div>}

        <div className="field-row">
          <div className="field">
            <label>谱号</label>
            <select value={cfg.clef} onChange={e => update('clef', e.target.value)}>
              <option value="treble">高音谱号 𝄞</option>
              <option value="bass">低音谱号 𝄢</option>
            </select>
          </div>
          <div className="field">
            <label>调号</label>
            <select value={cfg.tonic} onChange={e => update('tonic', e.target.value)}>
              {KEY_OPTIONS.map(k => <option key={k} value={k}>1={k}</option>)}
            </select>
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label>拍号</label>
            <select value={cfg.timeSignature.join('/')} onChange={e => update('timeSignature', e.target.value.split('/').map(Number))}>
              {['2/4', '3/4', '4/4', '6/8'].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="field">
            <label>速度</label>
            <input type="number" min="30" max="300" value={cfg.tempo} onChange={e => update('tempo', Math.max(30, Math.min(300, Number(e.target.value) || 100)))} />
          </div>
        </div>
        <label className="checkbox-line">
          <input type="checkbox" checked={cfg.insertRests} onChange={e => update('insertRests', e.target.checked)} />
          根据音符间距自动推断休止符
        </label>

        <button className="primary-btn full" disabled={busy || !file} onClick={handleRecognize}>
          {busy ? '识别中…' : '识别五线谱图片'}
        </button>
        {busy && (
          <div className="progress-block">
            <div className="progress-bar"><div style={{ width: `${progress}%` }} /></div>
            <div className="progress-label">{stage} · {progress}%</div>
          </div>
        )}
        <p className="hint">识别基于谱线/符头的图像分析，适合清晰、无歌词的单行谱。请尽量使用正立、无透视变形的图片；复杂排版、连音线与多声部谱建议改用 MusicXML 导入。</p>
      </div>

      <div className="panel-card">
        <div className="panel-card-title"><span className="step">2</span> 识别结果</div>
        {!result ? (
          <div className="result-empty"><div className="empty-icon">◌</div><div>识别结果会显示在这里</div><div className="empty-sub">包含标注预览图、音符明细与简谱</div></div>
        ) : (
          <>
            <div className="overlay-wrap"><img src={result.overlay} alt="识别标注预览" className="overlay-img" /></div>
            <div className="stat-row four">
              <div className="stat"><b>{result.diagnostics.noteheads}</b><span>符头</span></div>
              <div className="stat"><b>{result.diagnostics.spacing}</b><span>线距 px</span></div>
              <div className="stat"><b>{result.diagnostics.detectedRests}</b><span>休止符</span></div>
              <div className="stat"><b>{result.diagnostics.shortNotes}</b><span>短音符</span></div>
            </div>
            <div className="ocr-notes">
              {result.notes.slice(0, 40).map((n, i) => (
                <span key={i} title={`${n.label} · ${n.duration} 拍`}>{n.jianpu.degree === 0 ? '0' : n.jianpu.degree}<small>{n.duration}</small></span>
              ))}
            </div>
            <div className="action-row" style={{ marginTop: 14 }}>
              <button className="primary-btn" onClick={() => { onApply(result.score); setResult(null) }}>应用到乐谱</button>
              <button className="secondary-btn" onClick={() => { downloadMidi(result.score); onStatus('success', '已从识别的五线谱导出 MIDI。') }}>导出 MIDI</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

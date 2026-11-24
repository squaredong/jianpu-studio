import React, { useRef, useState } from 'react'
import { parseMidiBuffer, downloadMidi } from '../lib/midiIO'
import { keyLabel } from '../lib/musicTheory'
import { totalBeats } from '../lib/score'

export default function MidiPanel({ score, onApply, onStatus }) {
  const [file, setFile] = useState(null)
  const [info, setInfo] = useState(null)
  const inputRef = useRef(null)

  async function handleImport() {
    if (!file) { onStatus('error', '请先选择 MIDI 文件。'); return }
    try {
      const buffer = await file.arrayBuffer()
      const result = parseMidiBuffer(buffer, file.name)
      setInfo({ ...result.info, title: result.score.title })
      onApply(result.score, `已导入 MIDI：${result.score.notes.length} 个音符，${result.info.keySource}`)
    } catch (err) {
      setInfo(null)
      onStatus('error', err.message || 'MIDI 导入失败。')
    }
  }

  return (
    <div className="panel-grid">
      <div className="panel-card">
        <div className="panel-card-title"><span className="step">1</span> 导入 MIDI 文件</div>
        <div
          className={`dropzone${file ? ' filled' : ''}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) { setFile(f); setInfo(null) } }}
        >
          <input ref={inputRef} type="file" accept=".mid,.midi,audio/midi" hidden onChange={e => { const f = e.target.files?.[0]; if (f) { setFile(f); setInfo(null) } }} />
          <div className="drop-icon">{file ? '♬' : '↥'}</div>
          <div className="drop-main">{file ? file.name : '点击选择，或把 MIDI 拖到这里'}</div>
          <div className="drop-sub">{file ? `${(file.size / 1024).toFixed(1)} KB` : '支持 .mid / .midi'}</div>
        </div>
        <button className="primary-btn full" disabled={!file} onClick={handleImport}>导入并转换为简谱</button>
        <p className="hint">导入时会读取文件中的调号、拍号和速度；若文件没有调号，会根据音高分布自动估计。和弦会按单声部主旋律处理（保留先出现 / 较高的音）。</p>

        {info && (
          <div className="info-box">
            <div><span>识别调号</span><b>{info.keySource}</b></div>
            <div><span>原始音符</span><b>{info.noteCount}</b></div>
            <div><span>音轨数</span><b>{info.trackCount}</b></div>
            <div><span>简化重叠音</span><b>{info.skipped}</b></div>
          </div>
        )}
      </div>

      <div className="panel-card">
        <div className="panel-card-title"><span className="step">2</span> 导出当前乐谱</div>
        <div className="export-preview">
          <div className="export-title">{score.title || '未命名乐谱'}</div>
          <div className="export-meta">
            <span>{keyLabel(score.key)}</span>
            <span>{score.timeSignature.join('/')}</span>
            <span>♩ {score.tempo}</span>
            <span>{score.notes.length} 音符</span>
            <span>{totalBeats(score.notes)} 拍</span>
          </div>
        </div>
        <button className="secondary-btn full" onClick={() => { downloadMidi(score); onStatus('success', 'MIDI 文件已导出。') }} disabled={!score.notes.length}>
          导出为 MIDI 文件
        </button>
        <p className="hint">导出的 MIDI 包含调号、拍号、速度及主旋律音轨，可直接导入 MuseScore、FL Studio 等软件继续制作。</p>
      </div>
    </div>
  )
}

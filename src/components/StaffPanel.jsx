import React, { useRef, useState } from 'react'
import { listMusicXmlParts, parseMusicXml } from '../lib/musicXml'
import { keyLabel } from '../lib/musicTheory'
import { downloadMidi } from '../lib/midiIO'

export default function StaffPanel({ score, onApply, onStatus, parsedScore, onParsed }) {
  const [fileName, setFileName] = useState('')
  const [xmlText, setXmlText] = useState('')
  const [parts, setParts] = useState([])
  const [partIndex, setPartIndex] = useState(0)
  const [info, setInfo] = useState(null)
  const inputRef = useRef(null)

  async function loadFile(file) {
    if (!file) return
    try {
      const text = await file.text()
      const found = listMusicXmlParts(text)
      setXmlText(text)
      setFileName(file.name)
      setParts(found)
      setPartIndex(0)
      setInfo(null)
      onParsed(null)
      if (!found.length) onStatus('error', '没有找到五线谱声部。')
    } catch (err) {
      setXmlText('')
      setParts([])
      onStatus('error', err.message || 'MusicXML 读取失败。')
    }
  }

  function handleImport() {
    if (!xmlText) { onStatus('error', '请先选择 MusicXML 文件。'); return }
    try {
      const result = parseMusicXml(xmlText, partIndex)
      onParsed(result.score)
      setInfo({ ...result.info, noteCount: result.score.notes.length, key: keyLabel(result.score.key) })
      onApply(result.score, `已导入五线谱：${result.info.partName}，共 ${result.score.notes.length} 个音符`)
    } catch (err) {
      setInfo(null)
      onParsed(null)
      onStatus('error', err.message || '五线谱转换失败。')
    }
  }

  return (
    <div className="panel-grid">
      <div className="panel-card">
        <div className="panel-card-title"><span className="step">1</span> 选择五线谱文件</div>
        <div
          className={`dropzone${fileName ? ' filled' : ''}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); loadFile(e.dataTransfer.files?.[0]) }}
        >
          <input ref={inputRef} type="file" accept=".xml,.musicxml,text/xml" hidden onChange={e => loadFile(e.target.files?.[0])} />
          <div className="drop-icon">{fileName ? '𝄞' : '↥'}</div>
          <div className="drop-main">{fileName || '点击选择，或把 MusicXML 拖到这里'}</div>
          <div className="drop-sub">{fileName ? `${parts.length} 个声部` : '支持 .musicxml / .xml'}</div>
        </div>

        {parts.length > 0 && (
          <div className="field">
            <label>选择声部（主旋律通常在第一声部）</label>
            <select value={partIndex} onChange={e => { setPartIndex(Number(e.target.value)); setInfo(null); onParsed(null) }}>
              {parts.map(p => <option key={p.index} value={p.index}>{p.name}</option>)}
            </select>
          </div>
        )}

        <button className="primary-btn full" disabled={!xmlText} onClick={handleImport}>转换为简谱</button>
        <p className="hint">在 MuseScore、Finale、Sibelius 中打开五线谱后，选择「文件 → 导出 → MusicXML」即可得到该文件。暂时不支持直接识别五线谱图片。</p>
      </div>

      <div className="panel-card">
        <div className="panel-card-title"><span className="step">2</span> 转换说明</div>
        <div className="how-list">
          <div><b>01</b><span>读取调号 / 拍号</span><p>从 MusicXML 的调号、拍号标记还原首调简谱。</p></div>
          <div><b>02</b><span>音高与八度</span><p>音名 + 升降号 + 八度转换为简谱数字与上下加点。</p></div>
          <div><b>03</b><span>时值与附点</span><p>全 / 二分 / 四分 / 八分等时值及附点按拍数还原。</p></div>
          <div><b>04</b><span>单声部处理</span><p>和弦取最高音，多声部可在左侧切换选择。</p></div>
        </div>

        <div className="export-preview" style={{ marginTop: 18 }}>
          <div className="export-title">{score.title || '未命名乐谱'}</div>
          <div className="export-meta"><span>{keyLabel(score.key)}</span><span>{score.notes.length} 音符</span></div>
        </div>

        {info && (
          <div className="info-box">
            <div><span>声部</span><b>{info.partName}</b></div>
            <div><span>调号</span><b>{info.key}</b></div>
            <div><span>原始音符</span><b>{info.rawNoteCount}</b></div>
            <div><span>简化重叠音</span><b>{info.skipped}</b></div>
          </div>
        )}
        {parsedScore && (
          <div className="action-row" style={{ marginTop: 14 }}>
            <button className="secondary-btn full" onClick={() => { downloadMidi(parsedScore); onStatus('success', '已从五线谱导出 MIDI 文件。') }}>
              ♪ 从这份五线谱生成 MIDI
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

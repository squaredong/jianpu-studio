import React, { useCallback, useEffect, useRef, useState } from 'react'
import ScoreView from './components/ScoreView'
import AudioPanel from './components/AudioPanel'
import MidiPanel from './components/MidiPanel'
import StaffPanel from './components/StaffPanel'
import ImageOcrPanel from './components/ImageOcrPanel'
import LyricEditor from './components/LyricEditor'
import { audioEngine } from './lib/audioEngine'
import { KEY_OPTIONS, keyLabel } from './lib/musicTheory'
import {
  createDefaultScore, createNote, DURATION_OPTIONS, restNote,
  totalBeats, buildMeasures, normalizeScore, hasLyrics,
  addLyricLine, removeLyricLine, renameLyricLine, setNoteLyric,
} from './lib/score'
import { downloadMidi } from './lib/midiIO'
import { printScore } from './lib/printScore'

const STORAGE_KEY = 'jianpu-studio-score-v1'

const TABS = [
  { id: 'edit', name: '打谱编辑', icon: '♩' },
  { id: 'audio', name: '听歌转谱', icon: '◉' },
  { id: 'midi', name: 'MIDI 转谱', icon: '⇄' },
  { id: 'staff', name: '五线谱转谱', icon: '𝄞' },
  { id: 'ocr', name: '图片转谱', icon: '⊞' },
]

function loadStoredScore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return createDefaultScore()
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed.notes) && parsed.key && parsed.timeSignature) {
      return normalizeScore(parsed)
    }
  } catch { /* ignore */ }
  return createDefaultScore()
}

export default function App() {
  const [score, setScore] = useState(loadStoredScore)
  const [selectedIndex, setSelectedIndex] = useState(null)
  const [showLyrics, setShowLyrics] = useState(() => hasLyrics(loadStoredScore()))
  const [lyricFocus, setLyricFocus] = useState(null)
  const [input, setInput] = useState({ duration: 1, accidental: 0, octave: 0, isRest: false })
  const [activeTab, setActiveTab] = useState('edit')
  const [playingIndex, setPlayingIndex] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [status, setStatus] = useState(null)
  const [showHelp, setShowHelp] = useState(false)
  const [staffParsed, setStaffParsed] = useState(null)
  const history = useRef([])
  const fileInputRef = useRef(null)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(score))
  }, [score])

  const notify = useCallback((type, text) => setStatus({ type, text }), [])

  const mutate = useCallback(fn => {
    setScore(prev => {
      history.current.push(prev)
      if (history.current.length > 40) history.current.shift()
      return fn(prev)
    })
  }, [])

  const stopPlayback = useCallback(() => {
    audioEngine.stop()
    setIsPlaying(false)
    setPlayingIndex(null)
  }, [])

  const play = useCallback(() => {
    if (!score.notes.length) { notify('error', '乐谱是空的，先输入一些音符吧。'); return }
    if (isPlaying) { stopPlayback(); return }
    setIsPlaying(true)
    audioEngine.play(score, {
      onNote: index => setPlayingIndex(index),
      onEnd: () => { setIsPlaying(false); setPlayingIndex(null) },
    })
  }, [score, isPlaying, stopPlayback, notify])

  useEffect(() => () => audioEngine.stop(), [])

  function pushNote(degree) {
    const note = createNote({
      degree: input.isRest || degree === 0 ? 0 : degree,
      accidental: input.isRest || degree === 0 ? 0 : input.accidental,
      octave: input.isRest || degree === 0 ? 0 : input.octave,
      duration: input.duration,
    })
    mutate(prev => ({ ...prev, notes: [...prev.notes, note] }))
    setSelectedIndex(score.notes.length)
    if (note.degree !== 0) audioEngine.previewNote(note, score.key, score.tempo)
  }

  function deleteNote(index) {
    if (index == null || !score.notes[index]) return
    mutate(prev => ({ ...prev, notes: prev.notes.filter((_, i) => i !== index) }))
    setSelectedIndex(null)
  }

  function updateSelected(changes) {
    if (selectedIndex == null) return
    mutate(prev => ({
      ...prev,
      notes: prev.notes.map((n, i) => i === selectedIndex ? { ...n, ...changes } : n),
    }))
  }

  // 歌词逐字输入不进入撤销栈，避免每次按键都产生一条历史
  function setLyric(noteIndex, lineIndex, text) {
    setScore(prev => setNoteLyric(prev, noteIndex, lineIndex, text))
  }

  function focusLyric(noteIndex, lineIndex) {
    setActiveTab('edit')
    setSelectedIndex(noteIndex)
    setShowLyrics(true)
    setLyricFocus({ noteIndex, lineIndex, at: Date.now() })
    const note = score.notes[noteIndex]
    if (note?.degree) audioEngine.previewNote(note, score.key, score.tempo)
  }

  function undo() {
    const prev = history.current.pop()
    if (!prev) { notify('info', '没有更多可撤销的操作。'); return }
    setScore(prev)
    setSelectedIndex(null)
  }

  function clearAll() {
    if (!score.notes.length) return
    if (!window.confirm('确定清空整份乐谱吗？此操作可以用撤销恢复。')) return
    mutate(prev => ({ ...prev, notes: [] }))
    setSelectedIndex(null)
  }

  function printCurrentScore() {
    if (!score.notes.length) { notify('error', '乐谱是空的，先输入一些音符再打印。'); return }
    stopPlayback()
    setSelectedIndex(null)
    // 打印前切到编辑页，保证简谱纸张在 DOM 中
    if (activeTab !== 'edit') setActiveTab('edit')
    // 等 React 完成重绘再调起打印对话框
    setTimeout(printScore, 60)
  }

  function applyScore(newScore, message) {
    const next = normalizeScore(newScore)
    stopPlayback()
    mutate(() => next)
    setSelectedIndex(null)
    setShowLyrics(hasLyrics(next))
    setLyricFocus(null)
    setActiveTab('edit')
    notify('success', message)
  }

  function exportProject() {
    const blob = new Blob([JSON.stringify(score, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(score.title || 'score').replace(/[\\/:*?"<>|]/g, '_')}.jianpu.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  function importProject(file) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result)
        if (!Array.isArray(data.notes) || !data.key) throw new Error()
        applyScore({ ...createDefaultScore(), ...data }, `已打开工程：${data.title || file.name}`)
      } catch {
        notify('error', '无法识别这个工程文件。')
      }
    }
    reader.readAsText(file)
  }

  useEffect(() => {
    function onKeyDown(e) {
      if (showHelp) { if (e.key === 'Escape') setShowHelp(false); return }
      const tag = e.target?.tagName?.toLowerCase()
      if (['input', 'select', 'textarea'].includes(tag)) return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') { e.preventDefault(); printCurrentScore(); return }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return }
      if (activeTab !== 'edit') return

      if (e.code === 'Space') { e.preventDefault(); play(); return }
      if (e.key >= '1' && e.key <= '7') { pushNote(Number(e.key)); return }
      if (e.key === '0') { pushNote(0); return }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault()
        deleteNote(selectedIndex != null ? selectedIndex : score.notes.length - 1)
        return
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setSelectedIndex(i => i == null ? score.notes.length - 1 : Math.max(0, i - 1))
        return
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        setSelectedIndex(i => i == null ? 0 : Math.min(score.notes.length - 1, i + 1))
        return
      }
      if (e.key === 'ArrowUp') { e.preventDefault(); setInput(v => ({ ...v, octave: Math.min(3, v.octave + 1) })); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); setInput(v => ({ ...v, octave: Math.max(-3, v.octave - 1) })); return }
      if (e.key === '#') { setInput(v => ({ ...v, accidental: v.accidental === 1 ? 0 : 1 })); return }
      if (e.key === 'b') { setInput(v => ({ ...v, accidental: v.accidental === -1 ? 0 : -1 })); return }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeTab, input, score, selectedIndex, isPlaying, showHelp, play])

  const measures = buildMeasures(score.notes, score)

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">简</div>
          <div><div className="brand-name">简谱工坊</div><div className="brand-sub">Jianpu Studio</div></div>
        </div>
        <nav className="tabs">
          {TABS.map(tab => (
            <button key={tab.id} className={activeTab === tab.id ? 'active' : ''} onClick={() => setActiveTab(tab.id)}>
              <span className="tab-icon">{tab.icon}</span>{tab.name}
            </button>
          ))}
        </nav>
        <button className="help-btn" onClick={() => setShowHelp(true)}>? 使用帮助</button>
      </header>

      <div className="app-body">
        <aside className="sidebar">
          <section className="side-section">
            <div className="side-title">乐谱设置</div>
            <div className="field">
              <label>标题</label>
              <input value={score.title} onChange={e => mutate(prev => ({ ...prev, title: e.target.value }))} placeholder="乐谱标题" />
            </div>
            <div className="field-row">
              <div className="field">
                <label>调号</label>
                <select value={score.key.tonic} onChange={e => mutate(prev => ({ ...prev, key: { ...prev.key, tonic: e.target.value } }))}>
                  {KEY_OPTIONS.map(k => <option key={k} value={k}>1={k}</option>)}
                </select>
              </div>
              <div className="field">
                <label>调式</label>
                <select value={score.key.mode} onChange={e => mutate(prev => ({ ...prev, key: { ...prev.key, mode: e.target.value } }))}>
                  <option value="major">大调</option>
                  <option value="minor">小调</option>
                </select>
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label>拍号</label>
                <select value={score.timeSignature.join('/')} onChange={e => mutate(prev => ({ ...prev, timeSignature: e.target.value.split('/').map(Number) }))}>
                  {['2/4', '3/4', '4/4', '6/8', '3/8', '9/8'].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="field">
                <label>速度</label>
                <input type="number" min="30" max="300" value={score.tempo} onChange={e => mutate(prev => ({ ...prev, tempo: Math.max(30, Math.min(300, Number(e.target.value) || 120)) }))} />
              </div>
            </div>
          </section>

          {activeTab === 'edit' && (
            <section className="side-section">
              <div className="side-title">音符输入</div>
              <div className="note-pad">
                {[1, 2, 3, 4, 5, 6, 7].map(d => (
                  <button key={d} onClick={() => pushNote(d)}>{d}</button>
                ))}
                <button className="rest-pad" onClick={() => pushNote(0)}>0 <small>休止</small></button>
              </div>
              <div className="input-line">
                <span>升降号</span>
                <div className="seg">
                  {[{ v: -1, l: '♭' }, { v: 0, l: '♮' }, { v: 1, l: '♯' }].map(o => (
                    <button key={o.v} className={input.accidental === o.v ? 'on' : ''} onClick={() => setInput(v => ({ ...v, accidental: o.v }))}>{o.l}</button>
                  ))}
                </div>
              </div>
              <div className="input-line">
                <span>八度</span>
                <div className="seg">
                  <button onClick={() => setInput(v => ({ ...v, octave: Math.max(-3, v.octave - 1) }))}>−</button>
                  <b className="octave-value">{input.octave === 0 ? '中' : input.octave > 0 ? `高${input.octave}` : `低${-input.octave}`}</b>
                  <button onClick={() => setInput(v => ({ ...v, octave: Math.min(3, v.octave + 1) }))}>＋</button>
                </div>
              </div>
              <div className="side-title small">时值</div>
              <div className="duration-pad">
                {DURATION_OPTIONS.map(d => (
                  <button key={d.value} className={input.duration === d.value ? 'on' : ''} onClick={() => setInput(v => ({ ...v, duration: d.value }))} title={d.hint}>
                    <b>{d.label}</b><small>{d.hint}</small>
                  </button>
                ))}
              </div>

              {selectedIndex != null && score.notes[selectedIndex] && (
                <div className="selected-editor">
                  <div className="sel-head">
                    <span>编辑第 {selectedIndex + 1} 个音符</span>
                    <button onClick={() => setSelectedIndex(null)} title="取消选择">×</button>
                  </div>
                  <div className="sel-pad">
                    {[0, 1, 2, 3, 4, 5, 6, 7].map(d => (
                      <button key={d} className={score.notes[selectedIndex].degree === d ? 'on' : ''} onClick={() => updateSelected({ degree: d })}>{d}</button>
                    ))}
                  </div>
                  <div className="input-line">
                    <span>升降号</span>
                    <div className="seg">
                      {[{ v: -1, l: '♭' }, { v: 0, l: '♮' }, { v: 1, l: '♯' }].map(o => (
                        <button key={o.v} className={score.notes[selectedIndex].accidental === o.v ? 'on' : ''} onClick={() => updateSelected({ accidental: o.v })}>{o.l}</button>
                      ))}
                    </div>
                  </div>
                  <div className="input-line">
                    <span>八度</span>
                    <div className="seg">
                      <button onClick={() => updateSelected({ octave: Math.max(-3, score.notes[selectedIndex].octave - 1) })}>−</button>
                      <b className="octave-value">{score.notes[selectedIndex].octave === 0 ? '中' : score.notes[selectedIndex].octave > 0 ? `高${score.notes[selectedIndex].octave}` : `低${-score.notes[selectedIndex].octave}`}</b>
                      <button onClick={() => updateSelected({ octave: Math.min(3, score.notes[selectedIndex].octave + 1) })}>＋</button>
                    </div>
                  </div>
                  <div className="duration-pad small">
                    {DURATION_OPTIONS.map(d => (
                      <button key={d.value} className={score.notes[selectedIndex].duration === d.value ? 'on' : ''} onClick={() => updateSelected({ duration: d.value })} title={d.hint}>
                        <b>{d.label}</b>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          <section className="side-section">
            <div className="side-title">播放与操作</div>
            <div className="action-row">
              <button className={`play-btn${isPlaying ? ' playing' : ''}`} onClick={play} disabled={!score.notes.length}>
                {isPlaying ? '■ 停止' : '▶ 播放'}
              </button>
              <button className="icon-btn" onClick={undo} title="撤销 (Ctrl+Z)">↶</button>
              <button className="icon-btn" onClick={() => deleteNote(selectedIndex != null ? selectedIndex : score.notes.length - 1)} title="删除音符 (Delete)">⌫</button>
            </div>
            <div className="action-row">
              <button className="ghost-btn" onClick={exportProject}>保存工程</button>
              <button className="ghost-btn" onClick={() => fileInputRef.current?.click()}>打开工程</button>
              <input ref={fileInputRef} type="file" accept=".json,application/json" hidden onChange={e => importProject(e.target.files?.[0])} />
            </div>
            <div className="action-row">
              <button className="ghost-btn full" onClick={printCurrentScore} disabled={!score.notes.length} title="打印简谱 (Ctrl+P)">打印乐谱</button>
            </div>
            <button className="ghost-btn full danger" onClick={clearAll} disabled={!score.notes.length}>清空乐谱</button>
          </section>

          <div className="side-summary">
            <div><span>小节</span><b>{measures.length}</b></div>
            <div><span>音符</span><b>{score.notes.filter(n => n.degree !== 0).length}</b></div>
            <div><span>总拍数</span><b>{totalBeats(score.notes)}</b></div>
            <div><span>歌词行</span><b>{score.lyricLines?.length || 0}</b></div>
          </div>
        </aside>

        <main className="content">
          {activeTab === 'edit' && (
            <>
              <div className="content-bar">
                <div>
                  <h1>打谱编辑</h1>
                  <p>{keyLabel(score.key)} · {score.timeSignature.join('/')} 拍 · ♩={score.tempo}</p>
                </div>
                <div className="bar-actions">
                  <button
                    className={`secondary-btn${showLyrics ? ' on' : ''}`}
                    onClick={() => setShowLyrics(v => !v)}
                    title="在音符下方录入多行歌词"
                  >
                    歌词录入
                  </button>
                  <button className="secondary-btn" onClick={() => downloadMidi(score)} disabled={!score.notes.length}>导出 MIDI</button>
                  <button className="secondary-btn" onClick={exportProject}>保存工程</button>
                  <button className="secondary-btn" onClick={printCurrentScore} disabled={!score.notes.length} title="打印简谱 (Ctrl+P)">打印乐谱</button>
                </div>
              </div>
              <ScoreView
                score={score}
                selectedIndex={selectedIndex}
                playingIndex={playingIndex}
                onSelect={(i) => { setSelectedIndex(i); const n = score.notes[i]; if (n?.degree) audioEngine.previewNote(n, score.key, score.tempo) }}
                onLyricClick={focusLyric}
                onClearSelection={() => setSelectedIndex(null)}
              />
              {showLyrics && (
                <LyricEditor
                  score={score}
                  focus={lyricFocus}
                  onSetLyric={setLyric}
                  onAddLine={() => mutate(addLyricLine)}
                  onRemoveLine={index => mutate(prev => removeLyricLine(prev, index))}
                  onRenameLine={(index, name) => setScore(prev => renameLyricLine(prev, index, name))}
                  onClose={() => setShowLyrics(false)}
                />
              )}
              <div className="shortcut-strip">
                <span><kbd>1</kbd>–<kbd>7</kbd> 输入音符</span>
                <span><kbd>0</kbd> 休止符</span>
                <span><kbd>↑</kbd><kbd>↓</kbd> 八度</span>
                <span><kbd>#</kbd>/<kbd>b</kbd> 升降号</span>
                <span><kbd>←</kbd><kbd>→</kbd> 选择</span>
                <span><kbd>Del</kbd> 删除</span>
                <span><kbd>Space</kbd> 播放</span>
              </div>
            </>
          )}
          {activeTab === 'audio' && (
            <>
              <div className="content-bar">
                <div><h1>听歌转谱</h1><p>上传音频，自动提取主旋律并转换为简谱</p></div>
              </div>
              <AudioPanel score={score} onApply={applyScore} onStatus={notify} />
            </>
          )}
          {activeTab === 'midi' && (
            <>
              <div className="content-bar">
                <div><h1>MIDI 转谱</h1><p>导入 MIDI 文件转换为简谱，或把当前乐谱导出为 MIDI</p></div>
              </div>
              <MidiPanel score={score} onApply={applyScore} onStatus={notify} />
            </>
          )}
          {activeTab === 'staff' && (
            <>
              <div className="content-bar">
                <div><h1>五线谱转谱</h1><p>导入 MusicXML 五线谱，转换为简谱或直接生成 MIDI</p></div>
              </div>
              <StaffPanel score={score} onApply={applyScore} onStatus={notify} parsedScore={staffParsed} onParsed={setStaffParsed} />
            </>
          )}
          {activeTab === 'ocr' && (
            <>
              <div className="content-bar">
                <div><h1>五线谱图片转谱</h1><p>上传五线谱图片，自动识别音符并转换为简谱 / MIDI</p></div>
              </div>
              <ImageOcrPanel score={score} onApply={applyScore} onStatus={notify} />
            </>
          )}
        </main>
      </div>

      {status && (
        <div className={`toast ${status.type}`}>
          <span>{status.type === 'error' ? '!' : status.type === 'success' ? '✓' : 'i'}</span>
          <p>{status.text}</p>
          <button onClick={() => setStatus(null)}>×</button>
        </div>
      )}

      {showHelp && (
        <div className="modal-backdrop" onClick={() => setShowHelp(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head"><h2>使用帮助</h2><button onClick={() => setShowHelp(false)}>×</button></div>
            <div className="modal-body">
              <div className="help-block"><h3>四种功能</h3>
                <p><b>打谱编辑</b>：用数字 1–7 输入音符，0 为休止符；可设置升降号、八度、时值。点击谱面音符会试听并在左侧出现「编辑选中音符」面板，可直接修改该音符；点击谱面空白处取消选择。</p>
                <p><b>歌词录入</b>：点击工具栏「歌词录入」打开谱面下方的歌词表；可为每个音符填写多行歌词，点击音符下方的歌词可直接定位到对应输入框。用 <kbd>-</kbd> 表示拖音，留空表示该音符不唱。</p>
                <p><b>听歌转谱</b>：上传音频后提取主旋律。对哼唱、口哨、单件乐器或旋律突出的音频效果最好；伴奏很强的成品歌曲建议先消除伴奏。</p>
                <p><b>MIDI 转谱</b>：读取 .mid 文件，自动识别调号 / 拍号 / 速度，量化为简谱；也能把当前乐谱导出为 MIDI。</p>
                <p><b>五线谱转谱</b>：在 MuseScore 等软件中导出 MusicXML，再导入本工具，可转换为简谱或直接导出 MIDI。多声部文件可选择主旋律声部。</p>
                <p><b>图片转谱</b>：上传五线谱图片自动识别符头与音高，框选标注方便核对；识别结果可应用到乐谱或导出 MIDI。适合清晰的单行谱。</p>
              </div>
              <div className="help-block"><h3>快捷键</h3>
                <p><kbd>1</kbd>–<kbd>7</kbd> 输入音符 · <kbd>0</kbd> 休止 · <kbd>↑</kbd><kbd>↓</kbd> 八度 · <kbd>#</kbd>/<kbd>b</kbd> 升降 · <kbd>←</kbd><kbd>→</kbd> 选择音符 · <kbd>Del</kbd> 删除 · <kbd>Space</kbd> 播放 · <kbd>Ctrl+Z</kbd> 撤销 · <kbd>Ctrl+P</kbd> 打印</p>
              </div>
              <div className="help-block"><h3>打印乐谱</h3>
                <p>点击「打印乐谱」或按 <kbd>Ctrl+P</kbd>，会输出排版干净的 A4 简谱：自动隐藏所有编辑控件，只保留标题、调号、拍号、速度、音符和已录入的歌词。在打印对话框里也可以选择「另存为 PDF」。若在其它标签页使用，会自动切回打谱页再打印。</p>
              </div>
              <div className="help-block"><h3>简谱记法</h3>
                <p>音符上方圆点表示高八度，下方圆点表示低八度；数字下方横线表示八分 / 十六分音符；数字后短横线表示延长时值，圆点表示附点。</p>
              </div>
              <div className="help-note">乐谱会自动保存在浏览器本地，刷新页面不会丢失。导出的 MIDI 与工程文件可跨设备使用。</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

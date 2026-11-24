import React, { useEffect, useRef } from 'react'
import { MAX_LYRIC_LINES } from '../lib/score'

function noteLabel(note, index) {
  if (note.degree === 0) return '0'
  const accidental = note.accidental > 0 ? '♯' : note.accidental < 0 ? '♭' : ''
  const octave = note.octave > 0 ? `高${note.octave}` : note.octave < 0 ? `低${-note.octave}` : ''
  return `${accidental}${note.degree}${octave ? ` ${octave}` : ''}`
}

export default function LyricEditor({
  score,
  focus,
  onSetLyric,
  onAddLine,
  onRemoveLine,
  onRenameLine,
  onClose,
}) {
  const inputRefs = useRef({})
  const lines = score.lyricLines || []
  const notes = score.notes || []

  useEffect(() => {
    if (!focus) return
    const key = `${focus.noteIndex}:${focus.lineIndex}`
    const el = inputRefs.current[key]
    if (!el) return
    el.focus()
    el.select()
    el.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [focus, lines.length, notes.length])

  return (
    <section className="lyric-editor">
      <div className="lyric-editor-head">
        <div>
          <h2>歌词录入</h2>
          <p>每行歌词与上方音符一一对应；点击谱面音符下方的歌词可直接定位到输入框。用 <code>-</code> 表示拖音，留空表示该音符不唱。</p>
        </div>
        <div className="lyric-editor-actions">
          <button className="secondary-btn" onClick={onAddLine} disabled={lines.length >= MAX_LYRIC_LINES}>
            ＋ 添加歌词行
          </button>
          <button className="icon-btn" onClick={onClose} title="收起歌词录入">×</button>
        </div>
      </div>

      {!notes.length ? (
        <div className="lyric-empty">先输入一些音符，就可以在这里为旋律填写歌词。</div>
      ) : (
        <div className="lyric-table-wrap">
          <div className="lyric-table" style={{ '--lyric-cols': notes.length }}>
            <div className="lyric-row lyric-header">
              <div className="lyric-line-label">音符</div>
              {notes.map((note, i) => (
                <div className="lyric-note-head" key={note.id || i} title={`第 ${i + 1} 个音符 · ${note.duration} 拍`}>
                  <span>{noteLabel(note, i)}</span>
                  <small>{i + 1}</small>
                </div>
              ))}
            </div>

            {lines.map((line, lineIndex) => (
              <div className="lyric-row" key={lineIndex}>
                <div className="lyric-line-label">
                  <input
                    aria-label={`第 ${lineIndex + 1} 行歌词名称`}
                    value={line}
                    onChange={e => onRenameLine(lineIndex, e.target.value)}
                  />
                  {lines.length > 1 && (
                    <button
                      className="lyric-line-remove"
                      onClick={() => onRemoveLine(lineIndex)}
                      title={`删除${line || `第 ${lineIndex + 1} 行`}`}
                    >
                      −
                    </button>
                  )}
                </div>
                {notes.map((note, noteIndex) => {
                  const key = `${noteIndex}:${lineIndex}`
                  return (
                    <input
                      key={note.id || noteIndex}
                      ref={el => {
                        if (el) inputRefs.current[key] = el
                        else delete inputRefs.current[key]
                      }}
                      className="lyric-input"
                      aria-label={`${line || `第 ${lineIndex + 1} 行`} · 第 ${noteIndex + 1} 个音符`}
                      value={note.lyrics?.[lineIndex] || ''}
                      placeholder="·"
                      onChange={e => onSetLyric(noteIndex, lineIndex, e.target.value)}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="lyric-footnote">最多 {MAX_LYRIC_LINES} 行歌词。工程保存、MIDI 导出与打印都会保留已录入的歌词。</div>
    </section>
  )
}

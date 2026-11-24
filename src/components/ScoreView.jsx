import React from 'react'
import { buildMeasures } from '../lib/score'
import { durationInfo, keyLabel } from '../lib/musicTheory'

function Dots({ count, className }) {
  if (!count) return null
  const n = Math.min(2, Math.abs(count))
  return (
    <div className={`octave-dots ${className}`}>
      {Array.from({ length: n }, (_, i) => <span key={i} className="octave-dot" />)}
    </div>
  )
}

function NoteCell({ note, index, selected, playing, onSelect }) {
  const info = durationInfo(note.duration)
  const isRest = note.degree === 0
  const accidentalSymbol = note.accidental > 0 ? '♯' : note.accidental < 0 ? '♭' : ''
  const dashText = info.dashes ? ' −'.repeat(info.dashes) : ''
  const width = 46 + info.dashes * 17

  return (
    <button
      type="button"
      className={`note-cell${selected ? ' selected' : ''}${playing ? ' playing' : ''}${isRest ? ' rest' : ''}`}
      style={{ minWidth: width }}
      onClick={(e) => { e.stopPropagation(); onSelect(index) }}
      title={`${isRest ? '休止符' : `${note.degree}${accidentalSymbol}`} · ${note.duration} 拍`}
    >
      <Dots count={note.octave > 0 ? note.octave : 0} className="above" />
      <div className="note-core">
        {accidentalSymbol && <span className="accidental">{accidentalSymbol}</span>}
        <span className="digit">{isRest ? '0' : note.degree}</span>
        {info.dotted && <span className="duration-dot">·</span>}
        {dashText && <span className="dashes">{dashText}</span>}
      </div>
      <Dots count={note.octave < 0 ? note.octave : 0} className="below" />
      <div className="duration-lines">
        {Array.from({ length: info.lines }, (_, i) => <span key={i} className="duration-line" />)}
      </div>
    </button>
  )
}

export default function ScoreView({ score, selectedIndex, playingIndex, onSelect, onClearSelection }) {
  const measures = buildMeasures(score.notes, score)

  return (
    <div className="paper-wrap" onClick={onClearSelection}>
      <div className="paper">
        <div className="paper-head">
          <div className="paper-title">{score.title || '未命名乐谱'}</div>
          <div className="paper-meta">
            <span>{keyLabel(score.key)}</span>
            <span>{score.timeSignature[0]}/{score.timeSignature[1]}</span>
            <span>♩ = {score.tempo}</span>
          </div>
        </div>

        {score.notes.length === 0 ? (
          <div className="paper-empty">
            <div className="empty-icon">♪</div>
            <div>点击上方数字 1–7 开始打谱</div>
            <div className="empty-sub">也可以从「听歌转谱 / MIDI 转谱 / 五线谱转谱」导入后编辑</div>
          </div>
        ) : (
          <div className="measures">
            {measures.map((measure, mi) => (
              <div className="measure" key={mi}>
                <span className="measure-no">{mi + 1}</span>
                <div className="measure-notes">
                  {measure.map(note => (
                    <NoteCell
                      key={note.id}
                      note={note}
                      index={score.notes.findIndex(n => n.id === note.id)}
                      selected={selectedIndex != null && score.notes[selectedIndex]?.id === note.id}
                      playing={playingIndex != null && score.notes[playingIndex]?.id === note.id}
                      onSelect={onSelect}
                    />
                  ))}
                </div>
                <span className={`barline${mi === measures.length - 1 ? ' final' : ''}`} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

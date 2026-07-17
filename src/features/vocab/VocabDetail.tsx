import { posLabel } from '../../shared/posLabels.ts'
import type { VocabEntry } from '../../shared/contentTypes.ts'

interface VocabDetailProps {
  entry: VocabEntry
  added: boolean
  onAdd: () => void
  onBack: () => void
}

export function VocabDetail({ entry, added, onAdd, onBack }: VocabDetailProps) {
  return (
    <div className="vocab-detail">
      <button type="button" className="vocab-detail-back" onClick={onBack}>
        ← 返回列表
      </button>

      <h2 className="vocab-detail-kanji">{entry.kanji}</h2>
      <p className="vocab-detail-kana">{entry.kana}</p>
      {entry.usageNote && <p className="vocab-detail-usage-note">{entry.usageNote}</p>}

      {entry.partOfSpeech.length > 0 && (
        <div className="vocab-detail-pos">
          {entry.partOfSpeech.map((p) => (
            <span key={p} className="pos-chip">
              {posLabel(p)}
            </span>
          ))}
        </div>
      )}

      <p className="vocab-detail-meaning">{entry.meaningZh ?? entry.meaningEn.join('；')}</p>
      {entry.meaningZh && <p className="vocab-detail-meaning-en">{entry.meaningEn.join('; ')}</p>}

      <button type="button" className="vocab-add-button" onClick={onAdd} disabled={added}>
        {added ? '已加入複習' : '加入複習'}
      </button>

      {entry.sentences.length > 0 && (
        <div className="vocab-detail-sentences">
          <h3>例句</h3>
          <ul>
            {entry.sentences.map((s) => (
              <li key={s.jp}>
                <span className="sentence-difficulty">{s.difficulty >= 6 ? 'N1+' : `L${s.difficulty}`}</span>
                <p className="jp">{s.jp}</p>
                <p className="en">{s.en}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

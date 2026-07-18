import { useMemo } from 'react'
import type { GrammarEntry, JlptLevel } from '../../shared/contentTypes.ts'
import type { ItemStatus } from '../../db/cards.ts'
import { JapaneseSentence } from '../../shared/JapaneseSentence.tsx'
import { sortSentencesByCurrentLevel } from './sortSentences.ts'

interface GrammarDetailProps {
  entry: GrammarEntry
  status: ItemStatus | 'none'
  currentLevel: JlptLevel
  showFurigana: boolean
  onAdd: () => void
  onToggleSuspend: () => void
  onBack: () => void
}

export function GrammarDetail({
  entry,
  status,
  currentLevel,
  showFurigana,
  onAdd,
  onToggleSuspend,
  onBack,
}: GrammarDetailProps) {
  const addLabel = status === 'none' ? '加入複習' : status === 'suspended' ? '已熟悉' : '已加入複習'
  const sortedSentences = useMemo(
    () => sortSentencesByCurrentLevel(entry.sentences, currentLevel),
    [entry.sentences, currentLevel],
  )

  return (
    <div className="vocab-detail">
      <button type="button" className="vocab-detail-back" onClick={onBack}>
        ← 返回列表
      </button>

      <h2 className="grammar-detail-title">{entry.title}</h2>
      <p className="grammar-detail-formation">{entry.formation}</p>

      <p className="vocab-detail-meaning">{entry.zhShort ?? entry.shortExplanation}</p>
      <p className="grammar-detail-long-explanation">{entry.zhLong ?? entry.longExplanation}</p>

      <button type="button" className="vocab-add-button" onClick={onAdd} disabled={status !== 'none'}>
        {addLabel}
      </button>

      {status !== 'none' && (
        <button type="button" className="vocab-suspend-toggle" onClick={onToggleSuspend}>
          {status === 'suspended' ? '恢復複習' : '標記已熟悉'}
        </button>
      )}

      {sortedSentences.length > 0 && (
        <div className="vocab-detail-sentences">
          <h3>例句</h3>
          <ul>
            {sortedSentences.map((s) => (
              <li key={s.jp}>
                <span className="sentence-difficulty">{s.difficulty >= 6 ? 'N1+' : `L${s.difficulty}`}</span>
                <JapaneseSentence jpSegments={s.jpSegments} showFurigana={showFurigana} className="jp" />
                <p className="en">{s.en}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

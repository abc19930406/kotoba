import type { VocabEntry } from '../../shared/contentTypes.ts'
import type { ItemStatus } from '../../db/cards.ts'

interface VocabListProps {
  entries: VocabEntry[]
  statuses: Map<string, ItemStatus>
  showLevel?: boolean
  onSelect: (entry: VocabEntry) => void
}

export function VocabList({ entries, statuses, showLevel = false, onSelect }: VocabListProps) {
  if (entries.length === 0) {
    return <p className="vocab-empty">沒有符合條件的單字。</p>
  }

  return (
    <ul className="vocab-list">
      {entries.map((entry) => {
        const status = statuses.get(entry.id)
        return (
          <li key={`${entry.level}-${entry.id}`}>
            <button type="button" className="vocab-list-item" onClick={() => onSelect(entry)}>
              {showLevel && <span className="vocab-list-level">{entry.level}</span>}
              <span className="vocab-list-kanji">{entry.kanji}</span>
              <span className="vocab-list-kana">{entry.kana}</span>
              <span className="vocab-list-meaning">{entry.meaningZh ?? entry.meaningEn.join('；')}</span>
              {status === 'suspended' && <span className="vocab-list-suspended">已熟悉</span>}
              {(status === 'queued' || status === 'active') && <span className="vocab-list-added">已加入</span>}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

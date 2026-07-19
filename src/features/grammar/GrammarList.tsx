import type { GrammarEntry } from '../../shared/contentTypes.ts'
import type { ItemStatus } from '../../db/cards.ts'

interface GrammarListProps {
  entries: GrammarEntry[]
  statuses: Map<string, ItemStatus>
  showLevel?: boolean
  onSelect: (entry: GrammarEntry) => void
}

export function GrammarList({ entries, statuses, showLevel = false, onSelect }: GrammarListProps) {
  if (entries.length === 0) {
    return <p className="vocab-empty">沒有文法點。</p>
  }

  return (
    <ul className="vocab-list">
      {entries.map((entry) => {
        const status = statuses.get(entry.id)
        return (
          <li key={entry.id}>
            <button type="button" className="vocab-list-item" onClick={() => onSelect(entry)}>
              {showLevel && <span className="vocab-list-level">{entry.level}</span>}
              <span className="grammar-list-title">{entry.title}</span>
              <span className="vocab-list-meaning">{entry.zhShort ?? entry.shortExplanation}</span>
              {status === 'suspended' && <span className="vocab-list-suspended">已熟悉</span>}
              {(status === 'queued' || status === 'active') && <span className="vocab-list-added">已加入</span>}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

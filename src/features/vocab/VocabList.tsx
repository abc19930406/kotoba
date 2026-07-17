import type { VocabEntry } from '../../shared/contentTypes.ts'

interface VocabListProps {
  entries: VocabEntry[]
  addedIds: Set<string>
  onSelect: (entry: VocabEntry) => void
}

export function VocabList({ entries, addedIds, onSelect }: VocabListProps) {
  if (entries.length === 0) {
    return <p className="vocab-empty">沒有符合條件的單字。</p>
  }

  return (
    <ul className="vocab-list">
      {entries.map((entry) => (
        <li key={entry.id}>
          <button type="button" className="vocab-list-item" onClick={() => onSelect(entry)}>
            <span className="vocab-list-kanji">{entry.kanji}</span>
            <span className="vocab-list-kana">{entry.kana}</span>
            <span className="vocab-list-meaning">{entry.meaningZh ?? entry.meaningEn.join('；')}</span>
            {addedIds.has(entry.id) && <span className="vocab-list-added">已加入</span>}
          </button>
        </li>
      ))}
    </ul>
  )
}

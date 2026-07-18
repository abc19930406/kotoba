import { useEffect, useState } from 'react'
import { listSuspendedCards, resumeCard } from '../../db/cards.ts'
import type { CardRecord } from '../../db/schema.ts'
import { findVocabEntry, findGrammarEntry } from '../../shared/contentLoader.ts'

interface SuspendedListPageProps {
  onBack: () => void
}

interface SuspendedRow {
  card: CardRecord
  label: string
  sublabel: string
}

async function loadLabel(card: CardRecord): Promise<{ label: string; sublabel: string }> {
  if (card.itemType === 'vocab') {
    const entry = await findVocabEntry(card.level, card.itemId)
    return entry ? { label: entry.kanji, sublabel: entry.kana } : { label: card.itemId, sublabel: '' }
  }
  const entry = await findGrammarEntry(card.level, card.itemId)
  return entry ? { label: entry.title, sublabel: entry.formation } : { label: card.itemId, sublabel: '' }
}

export function SuspendedListPage({ onBack }: SuspendedListPageProps) {
  const [rows, setRows] = useState<SuspendedRow[] | null>(null)

  async function refresh() {
    const cards = await listSuspendedCards()
    const withLabels = await Promise.all(
      cards.map(async (card) => ({ card, ...(await loadLabel(card)) })),
    )
    setRows(withLabels)
  }

  useEffect(() => {
    refresh()
  }, [])

  async function handleResume(card: CardRecord) {
    await resumeCard(card.itemType, card.itemId)
    await refresh()
  }

  return (
    <div className="vocab-browse-page">
      <div className="vocab-browse-header">
        <button type="button" className="vocab-browse-back" onClick={onBack}>
          ← 首頁
        </button>
        <h1>已熟悉清單</h1>
      </div>

      {rows === null && <p className="vocab-status">載入中…</p>}
      {rows !== null && rows.length === 0 && <p className="vocab-empty">目前沒有已標記熟悉的項目。</p>}
      {rows !== null && rows.length > 0 && (
        <ul className="suspended-list">
          {rows.map(({ card, label, sublabel }) => (
            <li key={`${card.itemType}-${card.itemId}`} className="suspended-list-item">
              <div className="suspended-list-text">
                <span className="suspended-list-label">{label}</span>
                {sublabel && <span className="suspended-list-sublabel">{sublabel}</span>}
              </div>
              <button type="button" onClick={() => handleResume(card)}>
                恢復複習
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

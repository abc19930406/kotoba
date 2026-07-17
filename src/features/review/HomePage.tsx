import { useEffect, useState } from 'react'
import { countDueCards, getDailyNewCardLimit, setDailyNewCardLimit, DEFAULT_DAILY_NEW_CARD_LIMIT } from '../../db/cards.ts'
import { getRemainingNewCardSlots, getNewCardCandidates } from './queue.ts'

interface HomePageProps {
  onStartReview: () => void
  onBrowseVocab: () => void
}

export function HomePage({ onStartReview, onBrowseVocab }: HomePageProps) {
  const [dueCount, setDueCount] = useState<number | null>(null)
  const [newCount, setNewCount] = useState<number | null>(null)
  const [dailyLimit, setDailyLimitState] = useState(DEFAULT_DAILY_NEW_CARD_LIMIT)

  async function refresh() {
    const limit = await getDailyNewCardLimit()
    setDailyLimitState(limit)
    const [due, remainingSlots] = await Promise.all([countDueCards(), getRemainingNewCardSlots()])
    setDueCount(due)
    const candidates = await getNewCardCandidates(remainingSlots)
    setNewCount(candidates.length)
  }

  useEffect(() => {
    refresh()
  }, [])

  async function handleLimitChange(value: number) {
    if (!Number.isFinite(value) || value < 0) return
    await setDailyNewCardLimit(value)
    await refresh()
  }

  const loaded = dueCount !== null && newCount !== null
  const hasWork = loaded && (dueCount > 0 || newCount > 0)

  return (
    <main className="home-page">
      <h1>kotoba</h1>
      <div className="home-stats">
        <div className="stat">
          <span className="stat-value">{dueCount ?? '…'}</span>
          <span className="stat-label">今日到期</span>
        </div>
        <div className="stat">
          <span className="stat-value">{newCount ?? '…'}</span>
          <span className="stat-label">新卡</span>
        </div>
      </div>
      <button type="button" className="start-review" onClick={onStartReview} disabled={!hasWork}>
        {hasWork ? '開始複習' : '今天沒有待複習卡片'}
      </button>
      <button type="button" className="browse-vocab" onClick={onBrowseVocab}>
        瀏覽單字
      </button>
      <label className="daily-limit-setting">
        每日新卡上限：
        <input
          type="number"
          min={0}
          value={dailyLimit}
          onChange={(e) => handleLimitChange(e.target.valueAsNumber)}
        />
      </label>
    </main>
  )
}

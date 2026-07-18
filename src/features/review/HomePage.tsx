import { useEffect, useState } from 'react'
import { getDailyNewCardLimit, setDailyNewCardLimit, DEFAULT_DAILY_NEW_CARD_LIMIT } from '../../db/cards.ts'
import { getHomeReviewStats, type HomeReviewStats } from './queue.ts'

interface HomePageProps {
  onStartReview: () => void
  onBrowseVocab: () => void
  onOpenSuspended: () => void
}

export function HomePage({ onStartReview, onBrowseVocab, onOpenSuspended }: HomePageProps) {
  const [stats, setStats] = useState<HomeReviewStats | null>(null)
  const [dailyLimit, setDailyLimitState] = useState(DEFAULT_DAILY_NEW_CARD_LIMIT)

  async function refresh() {
    const [limit, homeStats] = await Promise.all([getDailyNewCardLimit(), getHomeReviewStats()])
    setDailyLimitState(limit)
    setStats(homeStats)
  }

  useEffect(() => {
    refresh()
  }, [])

  async function handleLimitChange(value: number) {
    if (!Number.isFinite(value) || value < 0) return
    await setDailyNewCardLimit(value)
    await refresh()
  }

  const loaded = stats !== null
  const hasWork = loaded && (stats.dueCount > 0 || stats.newCount > 0)

  return (
    <main className="home-page">
      <h1>kotoba</h1>
      <div className="home-stats">
        <div className="stat">
          <span className="stat-value">{stats?.dueCount ?? '…'}</span>
          <span className="stat-label">今日到期</span>
        </div>
        <div className="stat">
          <span className="stat-value">{stats?.newCount ?? '…'}</span>
          <span className="stat-label">新卡</span>
        </div>
      </div>
      {loaded && stats.queuedCount > 0 && (
        <p className="queued-status">
          已排隊 {stats.queuedCount} 張
          {stats.budgetExhausted && '（今日新卡額度已用完，明天繼續）'}
        </p>
      )}
      <button type="button" className="start-review" onClick={onStartReview} disabled={!hasWork}>
        {hasWork ? '開始複習' : '今天沒有待複習卡片'}
      </button>
      <button type="button" className="browse-vocab" onClick={onBrowseVocab}>
        瀏覽單字
      </button>
      <label className={loaded && stats.budgetExhausted ? 'daily-limit-setting emphasized' : 'daily-limit-setting'}>
        每日新卡上限：
        <input
          type="number"
          min={0}
          value={dailyLimit}
          onChange={(e) => handleLimitChange(e.target.valueAsNumber)}
        />
      </label>
      {loaded && stats.suspendedCount > 0 && (
        <button type="button" className="suspended-list-link" onClick={onOpenSuspended}>
          已熟悉清單（{stats.suspendedCount}）
        </button>
      )}
    </main>
  )
}

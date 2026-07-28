import { useEffect, useState } from 'react'
import { loadContentIndex } from '../../shared/contentLoader.ts'
import { LEVEL_ORDER, type JlptLevel } from '../../shared/contentTypes.ts'
import {
  getDailyReviewCounts,
  getLevelProgress,
  getStreakDays,
  type DailyReviewCount,
  type LevelProgress,
} from '../../db/stats.ts'
import { DailyReviewChart } from './DailyReviewChart.tsx'
import { LevelProgressList } from './LevelProgressList.tsx'
import { BackupSection } from './BackupSection.tsx'

interface StatsPageProps {
  onBack: () => void
}

const DAILY_CHART_DAYS = 30

function toTotalsByLevel(entries: { level: JlptLevel; count: number }[]): Record<JlptLevel, number> {
  const totals = Object.fromEntries(LEVEL_ORDER.map((level) => [level, 0])) as Record<JlptLevel, number>
  for (const entry of entries) totals[entry.level] = entry.count
  return totals
}

export function StatsPage({ onBack }: StatsPageProps) {
  const [daily, setDaily] = useState<DailyReviewCount[] | null>(null)
  const [vocabProgress, setVocabProgress] = useState<LevelProgress[] | null>(null)
  const [grammarProgress, setGrammarProgress] = useState<LevelProgress[] | null>(null)
  const [streak, setStreak] = useState<number | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const index = await loadContentIndex()
        const [dailyCounts, vocabP, grammarP, streakDays] = await Promise.all([
          getDailyReviewCounts(DAILY_CHART_DAYS),
          getLevelProgress('vocab', toTotalsByLevel(index.vocab)),
          getLevelProgress('grammar', toTotalsByLevel(index.grammar)),
          getStreakDays(),
        ])
        setDaily(dailyCounts)
        setVocabProgress(vocabP)
        setGrammarProgress(grammarP)
        setStreak(streakDays)
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : String(err))
      }
    }
    load()
  }, [])

  const notReady = daily === null || vocabProgress === null || grammarProgress === null || streak === null

  return (
    <div className="stats-page vocab-browse-page">
      <div className="vocab-browse-header">
        <button type="button" className="vocab-browse-back" onClick={onBack}>
          ← 首頁
        </button>
        <h1>統計</h1>
      </div>

      {loadError && (
        <p className="vocab-error-inline">載入統計資料失敗：{loadError}</p>
      )}

      {!loadError && notReady && <p className="vocab-status">載入中…</p>}

      {daily !== null && vocabProgress !== null && grammarProgress !== null && streak !== null && (
        <>
          <section className="stats-section streak-section">
            <span className="stat-value">{streak}</span>
            <span className="stat-label">連續學習天數</span>
          </section>

          <section className="stats-section">
            <h2>近 30 天複習量</h2>
            <DailyReviewChart data={daily} />
          </section>

          <section className="stats-section">
            <h2>等級進度</h2>
            <LevelProgressList title="單字" progress={vocabProgress} />
            <LevelProgressList title="文法" progress={grammarProgress} />
          </section>
        </>
      )}

      <BackupSection />
    </div>
  )
}

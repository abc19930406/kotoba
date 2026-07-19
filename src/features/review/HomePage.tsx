import { useEffect, useState } from 'react'
import {
  getDailyNewCardLimit,
  setDailyNewCardLimit,
  DEFAULT_DAILY_NEW_CARD_LIMIT,
  getCurrentLevel,
  setCurrentLevel,
  DEFAULT_CURRENT_LEVEL,
  getShowFurigana,
  setShowFurigana,
  DEFAULT_SHOW_FURIGANA,
  getSpeechRate,
  setSpeechRate,
  DEFAULT_SPEECH_RATE,
} from '../../db/cards.ts'
import { LEVEL_ORDER, type JlptLevel } from '../../shared/contentTypes.ts'
import type { ThemePreference } from '../../shared/theme.ts'
import { useSpeechAvailable, setSpeechRatePreset, type SpeechRatePreset } from '../../shared/speech.ts'
import { getHomeReviewStats, type HomeReviewStats } from './queue.ts'

interface HomePageProps {
  onStartReview: () => void
  onBrowseVocab: () => void
  onBrowseGrammar: () => void
  onOpenSuspended: () => void
  onOpenAbout: () => void
  onOpenStats: () => void
  theme: ThemePreference
  onThemeChange: (theme: ThemePreference) => void
}

export function HomePage({
  onStartReview,
  onBrowseVocab,
  onBrowseGrammar,
  onOpenSuspended,
  onOpenAbout,
  onOpenStats,
  theme,
  onThemeChange,
}: HomePageProps) {
  const [stats, setStats] = useState<HomeReviewStats | null>(null)
  const [dailyLimit, setDailyLimitState] = useState(DEFAULT_DAILY_NEW_CARD_LIMIT)
  const [currentLevel, setCurrentLevelState] = useState<JlptLevel>(DEFAULT_CURRENT_LEVEL)
  const [showFurigana, setShowFuriganaState] = useState(DEFAULT_SHOW_FURIGANA)
  const [speechRate, setSpeechRateState] = useState<SpeechRatePreset>(DEFAULT_SPEECH_RATE)
  const speechAvailable = useSpeechAvailable()

  async function refresh() {
    const [limit, level, furigana, rate, homeStats] = await Promise.all([
      getDailyNewCardLimit(),
      getCurrentLevel(),
      getShowFurigana(),
      getSpeechRate(),
      getHomeReviewStats(),
    ])
    setDailyLimitState(limit)
    setCurrentLevelState(level)
    setShowFuriganaState(furigana)
    setSpeechRateState(rate)
    setStats(homeStats)
  }

  useEffect(() => {
    refresh()
  }, [])

  // Syncs speech.ts's module-level rate cache whenever the persisted value
  // loads or changes — speak() reads that cache synchronously, so it must
  // already reflect the current setting before any SpeakButton can be tapped.
  useEffect(() => {
    setSpeechRatePreset(speechRate)
  }, [speechRate])

  async function handleLimitChange(value: number) {
    if (!Number.isFinite(value) || value < 0) return
    await setDailyNewCardLimit(value)
    await refresh()
  }

  async function handleCurrentLevelChange(level: JlptLevel) {
    await setCurrentLevel(level)
    await refresh()
  }

  async function handleShowFuriganaChange(value: boolean) {
    await setShowFurigana(value)
    await refresh()
  }

  async function handleSpeechRateChange(rate: SpeechRatePreset) {
    await setSpeechRate(rate)
    setSpeechRateState(rate)
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
      <button type="button" className="browse-vocab" onClick={onBrowseGrammar}>
        瀏覽文法
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
      <label className="current-level-setting">
        目前主要學習等級：
        <select value={currentLevel} onChange={(e) => handleCurrentLevelChange(e.target.value as JlptLevel)}>
          {LEVEL_ORDER.map((level) => (
            <option key={level} value={level}>
              {level}
            </option>
          ))}
        </select>
      </label>
      <label className="show-furigana-setting">
        <input
          type="checkbox"
          checked={showFurigana}
          onChange={(e) => handleShowFuriganaChange(e.target.checked)}
        />
        例句顯示假名注音
      </label>
      <label className="theme-setting">
        外觀：
        <select value={theme} onChange={(e) => onThemeChange(e.target.value as ThemePreference)}>
          <option value="system">跟隨系統</option>
          <option value="light">淺色</option>
          <option value="dark">深色</option>
        </select>
      </label>
      {speechAvailable ? (
        <label className="speech-rate-setting">
          發音語速：
          <select value={speechRate} onChange={(e) => handleSpeechRateChange(e.target.value as SpeechRatePreset)}>
            <option value="slow">慢</option>
            <option value="standard">標準</option>
            <option value="fast">快</option>
          </select>
        </label>
      ) : (
        <p className="speech-unavailable-note">此裝置沒有偵測到可用的日文語音，發音功能已隱藏。</p>
      )}
      {loaded && stats.suspendedCount > 0 && (
        <button type="button" className="suspended-list-link" onClick={onOpenSuspended}>
          已熟悉清單（{stats.suspendedCount}）
        </button>
      )}
      <button type="button" className="suspended-list-link" onClick={onOpenStats}>
        統計
      </button>
      <button type="button" className="suspended-list-link" onClick={onOpenAbout}>
        關於
      </button>
    </main>
  )
}

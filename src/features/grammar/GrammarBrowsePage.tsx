import { useEffect, useState } from 'react'
import { loadGrammarLevel } from '../../shared/contentLoader.ts'
import type { JlptLevel, GrammarEntry } from '../../shared/contentTypes.ts'
import {
  addToReviewQueue,
  getItemStatuses,
  suspendCard,
  resumeCard,
  getCurrentLevel,
  DEFAULT_CURRENT_LEVEL,
  getShowFurigana,
  DEFAULT_SHOW_FURIGANA,
  type ItemStatus,
} from '../../db/cards.ts'
import { LevelTabs } from '../vocab/LevelTabs.tsx'
import { GrammarList } from './GrammarList.tsx'
import { GrammarDetail } from './GrammarDetail.tsx'

interface GrammarBrowsePageProps {
  onBack: () => void
}

export function GrammarBrowsePage({ onBack }: GrammarBrowsePageProps) {
  const [level, setLevel] = useState<JlptLevel>('N5')
  const [entries, setEntries] = useState<GrammarEntry[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [statuses, setStatuses] = useState<Map<string, ItemStatus>>(new Map())
  const [currentLevel, setCurrentLevelState] = useState<JlptLevel>(DEFAULT_CURRENT_LEVEL)
  const [showFurigana, setShowFurigana] = useState(DEFAULT_SHOW_FURIGANA)
  const [selectedEntry, setSelectedEntry] = useState<GrammarEntry | null>(null)

  function loadLevel(lvl: JlptLevel) {
    setEntries(null)
    setLoadError(null)
    loadGrammarLevel(lvl)
      .then(setEntries)
      .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : String(err)))
  }

  useEffect(() => {
    loadLevel(level)
  }, [level])

  async function refreshStatuses() {
    setStatuses(await getItemStatuses('grammar'))
  }

  useEffect(() => {
    refreshStatuses()
    getCurrentLevel().then(setCurrentLevelState)
    getShowFurigana().then(setShowFurigana)
  }, [])

  async function handleAdd(entry: GrammarEntry) {
    await addToReviewQueue('grammar', entry.id, entry.level)
    await refreshStatuses()
  }

  async function handleToggleSuspend(entry: GrammarEntry) {
    const status = statuses.get(entry.id)
    if (status === 'suspended') await resumeCard('grammar', entry.id)
    else if (status === 'active' || status === 'queued') await suspendCard('grammar', entry.id, entry.level)
    await refreshStatuses()
  }

  if (selectedEntry) {
    return (
      <GrammarDetail
        entry={selectedEntry}
        status={statuses.get(selectedEntry.id) ?? 'none'}
        currentLevel={currentLevel}
        showFurigana={showFurigana}
        onAdd={() => handleAdd(selectedEntry)}
        onToggleSuspend={() => handleToggleSuspend(selectedEntry)}
        onBack={() => setSelectedEntry(null)}
      />
    )
  }

  return (
    <div className="vocab-browse-page">
      <div className="vocab-browse-header">
        <button type="button" className="vocab-browse-back" onClick={onBack}>
          ← 首頁
        </button>
        <h1>文法瀏覽</h1>
      </div>

      <LevelTabs current={level} onChange={setLevel} />

      {loadError && (
        <div className="vocab-error">
          <p>
            載入 {level} 文法失敗：{loadError}
          </p>
          <button type="button" onClick={() => loadLevel(level)}>
            重試
          </button>
        </div>
      )}

      {!loadError && entries === null && <p className="vocab-status">載入中…</p>}

      {entries !== null && !loadError && (
        <GrammarList entries={entries} statuses={statuses} onSelect={setSelectedEntry} />
      )}
    </div>
  )
}

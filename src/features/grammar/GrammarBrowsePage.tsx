import { useEffect, useMemo, useRef, useState } from 'react'
import { loadGrammarLevel } from '../../shared/contentLoader.ts'
import { LEVEL_ORDER, type JlptLevel, type GrammarEntry } from '../../shared/contentTypes.ts'
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
import { saveScrollPosition, useScrollRestore } from '../../shared/useScrollRestore.ts'
import { pushLayer, goBack } from '../../shared/backStack.ts'
import { LevelTabs } from '../vocab/LevelTabs.tsx'
import { GrammarList } from './GrammarList.tsx'
import { GrammarDetail } from './GrammarDetail.tsx'
import { filterGrammar } from './filterGrammar.ts'

interface GrammarBrowsePageProps {
  onBack: () => void
}

// Same rationale as VocabBrowsePage's scrollPositions: module-level so it
// survives this component's own mount/unmount within the app session
// without ever being persisted (see "捲動位置保留" spec, step 2d).
const scrollPositions = new Map<string, number>()

export function browseSignature(level: JlptLevel, search: string): string {
  return `${level}::${search}`
}

export function GrammarBrowsePage({ onBack }: GrammarBrowsePageProps) {
  const [level, setLevel] = useState<JlptLevel>('N5')
  const [levelData, setLevelData] = useState<Partial<Record<JlptLevel, GrammarEntry[]>>>({})
  const [levelErrors, setLevelErrors] = useState<Partial<Record<JlptLevel, string>>>({})
  const [search, setSearch] = useState('')
  const [statuses, setStatuses] = useState<Map<string, ItemStatus>>(new Map())
  const [currentLevel, setCurrentLevelState] = useState<JlptLevel>(DEFAULT_CURRENT_LEVEL)
  const [showFurigana, setShowFurigana] = useState(DEFAULT_SHOW_FURIGANA)
  const [selectedEntry, setSelectedEntry] = useState<GrammarEntry | null>(null)

  // Tracks levels whose fetch has been kicked off, so repeated effect firings
  // don't re-trigger it — loadGrammarLevel() itself also caches, this ref just
  // avoids redundant setState calls. Cleared on error so 重試 can retry.
  const loadTriggered = useRef(new Set<JlptLevel>())

  function ensureLevelLoaded(lvl: JlptLevel) {
    if (loadTriggered.current.has(lvl)) return
    loadTriggered.current.add(lvl)
    loadGrammarLevel(lvl)
      .then((data) => setLevelData((prev) => ({ ...prev, [lvl]: data })))
      .catch((err: unknown) => {
        loadTriggered.current.delete(lvl)
        setLevelErrors((prev) => ({ ...prev, [lvl]: err instanceof Error ? err.message : String(err) }))
      })
  }

  function retryLevel(lvl: JlptLevel) {
    setLevelErrors((prev) => {
      const next = { ...prev }
      delete next[lvl]
      return next
    })
    ensureLevelLoaded(lvl)
  }

  const isSearching = search.trim().length > 0

  useEffect(() => {
    ensureLevelLoaded(level)
  }, [level])

  useEffect(() => {
    if (isSearching) {
      LEVEL_ORDER.forEach(ensureLevelLoaded)
    }
  }, [isSearching])

  async function refreshStatuses() {
    setStatuses(await getItemStatuses('grammar'))
  }

  useEffect(() => {
    refreshStatuses()
    getCurrentLevel().then(setCurrentLevelState)
    getShowFurigana().then(setShowFurigana)
  }, [])

  const sourceEntries = useMemo(
    () => (isSearching ? LEVEL_ORDER.flatMap((lvl) => levelData[lvl] ?? []) : (levelData[level] ?? [])),
    [isSearching, levelData, level],
  )
  const filtered = useMemo(() => filterGrammar(sourceEntries, search), [sourceEntries, search])

  const pendingLevels = isSearching ? LEVEL_ORDER.filter((lvl) => !levelData[lvl] && !levelErrors[lvl]) : []
  const erroredLevels = isSearching ? LEVEL_ORDER.filter((lvl) => levelErrors[lvl]) : []

  const currentLevelReady = levelData[level] !== undefined
  const currentLevelError = levelErrors[level]
  const contentReady = isSearching || currentLevelReady

  const signature = browseSignature(level, search)
  useScrollRestore(scrollPositions, signature, contentReady, selectedEntry === null)

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

  function handleSelectEntry(entry: GrammarEntry) {
    saveScrollPosition(scrollPositions, signature)
    pushLayer(() => setSelectedEntry(null))
    setSelectedEntry(entry)
  }

  function handleLevelChange(newLevel: JlptLevel) {
    saveScrollPosition(scrollPositions, signature)
    setLevel(newLevel)
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
        onBack={goBack}
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

      <div className="vocab-browse-sticky-bar">
        <LevelTabs current={level} onChange={handleLevelChange} />
        <div className="vocab-filters">
          <input
            type="search"
            className="vocab-search"
            placeholder="搜尋文法標題／說明"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="搜尋文法"
          />
        </div>
      </div>

      {!isSearching && currentLevelError && (
        <div className="vocab-error">
          <p>
            載入 {level} 文法失敗：{currentLevelError}
          </p>
          <button type="button" onClick={() => retryLevel(level)}>
            重試
          </button>
        </div>
      )}

      {!isSearching && !currentLevelError && !currentLevelReady && <p className="vocab-status">載入中…</p>}

      {(isSearching || (currentLevelReady && !currentLevelError)) && (
        <>
          {isSearching && pendingLevels.length > 0 && (
            <p className="vocab-status">搜尋中…（載入中：{pendingLevels.join('、')}）</p>
          )}
          {isSearching && erroredLevels.length > 0 && (
            <p className="vocab-error-inline">{erroredLevels.map((l) => `${l} 載入失敗`).join('、')}</p>
          )}

          <GrammarList entries={filtered} statuses={statuses} showLevel={isSearching} onSelect={handleSelectEntry} />
        </>
      )}
    </div>
  )
}

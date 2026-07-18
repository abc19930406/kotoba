import { useEffect, useMemo, useRef, useState } from 'react'
import { loadVocabLevel } from '../../shared/contentLoader.ts'
import { LEVEL_ORDER, type JlptLevel, type VocabEntry } from '../../shared/contentTypes.ts'
import {
  addToReviewQueue,
  addManyToReviewQueue,
  getItemStatuses,
  suspendCard,
  resumeCard,
  getShowFurigana,
  DEFAULT_SHOW_FURIGANA,
  type ItemStatus,
} from '../../db/cards.ts'
import { LevelTabs } from './LevelTabs.tsx'
import { VocabFilters } from './VocabFilters.tsx'
import { VocabList } from './VocabList.tsx'
import { VocabDetail } from './VocabDetail.tsx'
import { BatchAddConfirm } from './BatchAddConfirm.tsx'
import { filterVocab, collectPosCodes } from './filterVocab.ts'

interface VocabBrowsePageProps {
  onBack: () => void
}

export function VocabBrowsePage({ onBack }: VocabBrowsePageProps) {
  const [level, setLevel] = useState<JlptLevel>('N5')
  const [levelData, setLevelData] = useState<Partial<Record<JlptLevel, VocabEntry[]>>>({})
  const [levelErrors, setLevelErrors] = useState<Partial<Record<JlptLevel, string>>>({})
  const [search, setSearch] = useState('')
  const [selectedPos, setSelectedPos] = useState<Set<string>>(new Set())
  const [statuses, setStatuses] = useState<Map<string, ItemStatus>>(new Map())
  const [selectedEntry, setSelectedEntry] = useState<VocabEntry | null>(null)
  const [confirmingBatch, setConfirmingBatch] = useState(false)
  const [showFurigana, setShowFurigana] = useState(DEFAULT_SHOW_FURIGANA)

  // Tracks levels whose fetch has been kicked off, so repeated effect firings
  // don't re-trigger it — loadVocabLevel() itself also caches, this ref just
  // avoids redundant setState calls. Cleared on error so 重試 can retry.
  const loadTriggered = useRef(new Set<JlptLevel>())

  function ensureLevelLoaded(lvl: JlptLevel) {
    if (loadTriggered.current.has(lvl)) return
    loadTriggered.current.add(lvl)
    loadVocabLevel(lvl)
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
    setSelectedPos(new Set())
  }, [level])

  useEffect(() => {
    if (isSearching) {
      LEVEL_ORDER.forEach(ensureLevelLoaded)
    }
  }, [isSearching])

  async function refreshStatuses() {
    setStatuses(await getItemStatuses('vocab'))
  }

  useEffect(() => {
    refreshStatuses()
    getShowFurigana().then(setShowFurigana)
  }, [])

  const sourceEntries = useMemo(
    () => (isSearching ? LEVEL_ORDER.flatMap((lvl) => levelData[lvl] ?? []) : (levelData[level] ?? [])),
    [isSearching, levelData, level],
  )
  const posCodes = useMemo(() => collectPosCodes(sourceEntries), [sourceEntries])
  const filtered = useMemo(
    () => filterVocab(sourceEntries, search, selectedPos),
    [sourceEntries, search, selectedPos],
  )

  const pendingLevels = isSearching ? LEVEL_ORDER.filter((lvl) => !levelData[lvl] && !levelErrors[lvl]) : []
  const erroredLevels = isSearching ? LEVEL_ORDER.filter((lvl) => levelErrors[lvl]) : []

  function togglePos(code: string) {
    setSelectedPos((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  async function handleAdd(entry: VocabEntry) {
    await addToReviewQueue('vocab', entry.id, entry.level)
    await refreshStatuses()
  }

  async function handleBatchConfirm() {
    setConfirmingBatch(false)
    await addManyToReviewQueue(filtered.map((e) => ({ itemType: 'vocab' as const, itemId: e.id, level: e.level })))
    await refreshStatuses()
  }

  async function handleToggleSuspend(entry: VocabEntry) {
    const status = statuses.get(entry.id)
    if (status === 'suspended') await resumeCard('vocab', entry.id)
    else if (status === 'active' || status === 'queued') await suspendCard('vocab', entry.id, entry.level)
    await refreshStatuses()
  }

  if (selectedEntry) {
    return (
      <VocabDetail
        entry={selectedEntry}
        status={statuses.get(selectedEntry.id) ?? 'none'}
        showFurigana={showFurigana}
        onAdd={() => handleAdd(selectedEntry)}
        onToggleSuspend={() => handleToggleSuspend(selectedEntry)}
        onBack={() => setSelectedEntry(null)}
      />
    )
  }

  const currentLevelReady = levelData[level] !== undefined
  const currentLevelError = levelErrors[level]

  return (
    <div className="vocab-browse-page">
      <div className="vocab-browse-header">
        <button type="button" className="vocab-browse-back" onClick={onBack}>
          ← 首頁
        </button>
        <h1>單字瀏覽</h1>
      </div>

      <LevelTabs current={level} onChange={setLevel} />

      {!isSearching && currentLevelError && (
        <div className="vocab-error">
          <p>載入 {level} 單字失敗：{currentLevelError}</p>
          <button type="button" onClick={() => retryLevel(level)}>
            重試
          </button>
        </div>
      )}

      {!isSearching && !currentLevelError && !currentLevelReady && <p className="vocab-status">載入中…</p>}

      {(isSearching || (currentLevelReady && !currentLevelError)) && (
        <>
          <VocabFilters
            search={search}
            onSearchChange={setSearch}
            posCodes={posCodes}
            selectedPos={selectedPos}
            onTogglePos={togglePos}
          />

          {isSearching && pendingLevels.length > 0 && (
            <p className="vocab-status">搜尋中…（載入中：{pendingLevels.join('、')}）</p>
          )}
          {isSearching && erroredLevels.length > 0 && (
            <p className="vocab-error-inline">{erroredLevels.map((l) => `${l} 載入失敗`).join('、')}</p>
          )}

          <div className="vocab-batch-add">
            <button type="button" onClick={() => setConfirmingBatch(true)} disabled={filtered.length === 0}>
              批次加入目前 {filtered.length} 筆結果
            </button>
          </div>

          <VocabList entries={filtered} statuses={statuses} showLevel={isSearching} onSelect={setSelectedEntry} />
        </>
      )}

      {confirmingBatch && (
        <BatchAddConfirm
          count={filtered.length}
          onConfirm={handleBatchConfirm}
          onCancel={() => setConfirmingBatch(false)}
        />
      )}
    </div>
  )
}

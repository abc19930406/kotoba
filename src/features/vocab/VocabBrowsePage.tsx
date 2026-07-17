import { useEffect, useMemo, useState } from 'react'
import { loadVocabLevel } from '../../shared/contentLoader.ts'
import type { JlptLevel, VocabEntry } from '../../shared/contentTypes.ts'
import { addToReviewQueue, addManyToReviewQueue, listAddedItemIds } from '../../db/cards.ts'
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
  const [entries, setEntries] = useState<VocabEntry[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedPos, setSelectedPos] = useState<Set<string>>(new Set())
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set())
  const [selectedEntry, setSelectedEntry] = useState<VocabEntry | null>(null)
  const [confirmingBatch, setConfirmingBatch] = useState(false)

  async function refreshAddedIds() {
    setAddedIds(await listAddedItemIds('vocab'))
  }

  useEffect(() => {
    setEntries(null)
    setLoadError(null)
    setSearch('')
    setSelectedPos(new Set())
    loadVocabLevel(level)
      .then(setEntries)
      .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : String(err)))
  }, [level])

  useEffect(() => {
    refreshAddedIds()
  }, [])

  const posCodes = useMemo(() => (entries ? collectPosCodes(entries) : []), [entries])
  const filtered = useMemo(
    () => (entries ? filterVocab(entries, search, selectedPos) : []),
    [entries, search, selectedPos],
  )

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
    await refreshAddedIds()
  }

  async function handleBatchConfirm() {
    setConfirmingBatch(false)
    await addManyToReviewQueue(filtered.map((e) => ({ itemType: 'vocab' as const, itemId: e.id, level: e.level })))
    await refreshAddedIds()
  }

  if (selectedEntry) {
    return (
      <VocabDetail
        entry={selectedEntry}
        added={addedIds.has(selectedEntry.id)}
        onAdd={() => handleAdd(selectedEntry)}
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
        <h1>單字瀏覽</h1>
      </div>

      <LevelTabs current={level} onChange={setLevel} />

      {loadError && (
        <div className="vocab-error">
          <p>載入 {level} 單字失敗：{loadError}</p>
          <button
            type="button"
            onClick={() => {
              setLoadError(null)
              setEntries(null)
              loadVocabLevel(level)
                .then(setEntries)
                .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : String(err)))
            }}
          >
            重試
          </button>
        </div>
      )}

      {!loadError && entries === null && <p className="vocab-status">載入中…</p>}

      {entries !== null && !loadError && (
        <>
          <VocabFilters
            search={search}
            onSearchChange={setSearch}
            posCodes={posCodes}
            selectedPos={selectedPos}
            onTogglePos={togglePos}
          />

          <div className="vocab-batch-add">
            <button type="button" onClick={() => setConfirmingBatch(true)} disabled={filtered.length === 0}>
              批次加入目前 {filtered.length} 筆結果
            </button>
          </div>

          <VocabList entries={filtered} addedIds={addedIds} onSelect={setSelectedEntry} />
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

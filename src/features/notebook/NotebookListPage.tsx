import { useEffect, useState } from 'react'
import { listStandaloneNotes, type StandaloneNoteSummary } from '../../db/standaloneNotes.ts'
import { filterStandaloneNotes } from './filterStandaloneNotes.ts'
import { saveScrollPosition, useScrollRestore } from '../../shared/useScrollRestore.ts'
import { pushLayer, goBack } from '../../shared/backStack.ts'
import { NoteImageThumb } from '../notes/NoteImageThumb.tsx'
import { NotebookEditorPage } from './NotebookEditorPage.tsx'

interface NotebookListPageProps {
  onBack: () => void
}

// Same rationale as VocabBrowsePage's scrollPositions: module-level so it
// survives this component's own mount/unmount within the app session
// without ever being persisted.
const scrollPositions = new Map<string, number>()

export function NotebookListPage({ onBack }: NotebookListPageProps) {
  const [notes, setNotes] = useState<StandaloneNoteSummary[] | null>(null)
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState<number | 'new' | null>(null)

  async function refresh() {
    setNotes(await listStandaloneNotes())
  }

  // Refreshes on mount, and every time we return to the list (back button,
  // system back gesture, or after a save/delete inside the editor) — the
  // editor never navigates on its own, it always goes through onBack/goBack,
  // so this single effect is the one place the list needs to catch up.
  useEffect(() => {
    if (editingId === null) refresh()
  }, [editingId])

  const filtered = notes ? filterStandaloneNotes(notes, search) : []

  useScrollRestore(scrollPositions, search, notes !== null, editingId === null)

  function openEditor(id: number | 'new') {
    saveScrollPosition(scrollPositions, search)
    pushLayer(() => setEditingId(null))
    setEditingId(id)
  }

  if (editingId !== null) {
    return <NotebookEditorPage noteId={editingId === 'new' ? null : editingId} onBack={goBack} />
  }

  return (
    <div className="vocab-browse-page">
      <div className="vocab-browse-header">
        <button type="button" className="vocab-browse-back" onClick={onBack}>
          ← 首頁
        </button>
        <h1>筆記本</h1>
      </div>

      <div className="vocab-browse-sticky-bar">
        <div className="vocab-filters">
          <input
            type="search"
            className="vocab-search"
            placeholder="搜尋標題／內文"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="搜尋筆記"
          />
        </div>
      </div>

      <button type="button" className="note-add-button" onClick={() => openEditor('new')}>
        新增筆記
      </button>

      {notes === null && <p className="vocab-status">載入中…</p>}
      {notes !== null && filtered.length === 0 && <p className="vocab-empty">沒有符合條件的筆記。</p>}
      {notes !== null && filtered.length > 0 && (
        <ul className="notebook-list">
          {filtered.map((note) => (
            <li key={note.id}>
              <button type="button" className="notebook-list-button" onClick={() => openEditor(note.id)}>
                {note.firstImage && <NoteImageThumb blob={note.firstImage.blob} />}
                <div className="notebook-list-text">
                  <span className="notebook-list-title">{note.title}</span>
                  <span className="notebook-list-preview">{note.text}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

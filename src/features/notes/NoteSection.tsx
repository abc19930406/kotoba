import { useEffect, useState, type ChangeEvent } from 'react'
import type { ItemType } from '../../db/schema.ts'
import { getNote, saveNoteText, addNoteImage, removeNoteImage, deleteNote, type NoteWithImages } from '../../db/notes.ts'
import { compressImage } from '../../shared/imageCompression.ts'
import { pushLayer } from '../../shared/backStack.ts'
import { NoteImageThumb } from './NoteImageThumb.tsx'
import { DeleteNoteConfirm } from './DeleteNoteConfirm.tsx'
import { ImageLightbox } from './ImageLightbox.tsx'

const MAX_IMAGES = 4

interface NoteSectionProps {
  itemType: ItemType
  itemId: string
}

export function NoteSection({ itemType, itemId }: NoteSectionProps) {
  const [note, setNote] = useState<NoteWithImages | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draftText, setDraftText] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  async function refresh() {
    const result = await getNote(itemType, itemId)
    setNote(result)
    setLoaded(true)
  }

  useEffect(() => {
    refresh()
  }, [itemType, itemId])

  function startEditing() {
    setDraftText(note?.text ?? '')
    setError(null)
    setEditing(true)
  }

  async function handleSave() {
    await saveNoteText(itemType, itemId, draftText)
    await refresh()
    setEditing(false)
  }

  function handleCancelEdit() {
    setEditing(false)
    setError(null)
  }

  async function handleImageSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if ((note?.images.length ?? 0) >= MAX_IMAGES) {
      setError(`每則筆記最多 ${MAX_IMAGES} 張圖片`)
      return
    }
    const compressed = await compressImage(file)
    const result = await addNoteImage(itemType, itemId, compressed)
    if (!result.ok) {
      setError(`每則筆記最多 ${MAX_IMAGES} 張圖片`)
      return
    }
    setError(null)
    await refresh()
  }

  async function handleRemoveImage(imageId: number | undefined) {
    if (imageId === undefined) return
    await removeNoteImage(imageId)
    await refresh()
  }

  function openDeleteConfirm() {
    pushLayer(() => setConfirmingDelete(false))
    setConfirmingDelete(true)
  }

  function openLightbox(i: number) {
    pushLayer(() => setLightboxIndex(null))
    setLightboxIndex(i)
  }

  async function handleConfirmDelete() {
    await deleteNote(itemType, itemId)
    setConfirmingDelete(false)
    setEditing(false)
    await refresh()
  }

  if (!loaded) return null

  return (
    <div className="note-section">
      <h3>筆記</h3>

      {!editing && !note && (
        <button type="button" className="note-add-button" onClick={startEditing}>
          新增筆記
        </button>
      )}

      {!editing && note && (
        <div className="note-view">
          {note.text && <p className="note-text">{note.text}</p>}
          {note.images.length > 0 && (
            <div className="note-images">
              {note.images.map((img, i) => (
                <NoteImageThumb key={img.id} blob={img.blob} onOpen={() => openLightbox(i)} />
              ))}
            </div>
          )}
          <div className="note-actions">
            <button type="button" onClick={startEditing}>
              編輯筆記
            </button>
            <button type="button" className="note-delete-button" onClick={openDeleteConfirm}>
              刪除筆記
            </button>
          </div>
        </div>
      )}

      {editing && (
        <div className="note-edit">
          <textarea
            className="note-textarea"
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            rows={4}
            placeholder="寫點什麼…"
          />
          {note && note.images.length > 0 && (
            <div className="note-images">
              {note.images.map((img, i) => (
                <NoteImageThumb
                  key={img.id}
                  blob={img.blob}
                  onRemove={() => handleRemoveImage(img.id)}
                  onOpen={() => openLightbox(i)}
                />
              ))}
            </div>
          )}
          {error && <p className="vocab-error-inline">{error}</p>}
          {(note?.images.length ?? 0) < MAX_IMAGES && (
            <label className="note-add-image-button">
              加入圖片
              <input type="file" accept="image/*" onChange={handleImageSelected} />
            </label>
          )}
          <div className="note-edit-actions">
            <button type="button" className="batch-add-cancel" onClick={handleCancelEdit}>
              取消
            </button>
            <button type="button" className="batch-add-confirm" onClick={handleSave}>
              儲存
            </button>
          </div>
          {note && (
            <button type="button" className="note-delete-button" onClick={openDeleteConfirm}>
              刪除整份筆記
            </button>
          )}
        </div>
      )}

      {confirmingDelete && <DeleteNoteConfirm onConfirm={handleConfirmDelete} />}
      {lightboxIndex !== null && note && (
        <ImageLightbox images={note.images.map((img) => img.blob)} initialIndex={lightboxIndex} />
      )}
    </div>
  )
}

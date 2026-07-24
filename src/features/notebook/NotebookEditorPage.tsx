import { useEffect, useState, type ChangeEvent } from 'react'
import {
  getStandaloneNote,
  createStandaloneNote,
  updateStandaloneNote,
  addStandaloneNoteImage,
  removeStandaloneNoteImage,
  deleteStandaloneNote,
  type StandaloneNoteWithImages,
} from '../../db/standaloneNotes.ts'
import { compressImage } from '../../shared/imageCompression.ts'
import { pushLayer } from '../../shared/backStack.ts'
import { NoteImageThumb } from '../notes/NoteImageThumb.tsx'
import { DeleteNoteConfirm } from '../notes/DeleteNoteConfirm.tsx'
import { ImageLightbox } from '../notes/ImageLightbox.tsx'

const MAX_IMAGES = 4

interface NotebookEditorPageProps {
  noteId: number | null
  onBack: () => void
}

export function NotebookEditorPage({ noteId, onBack }: NotebookEditorPageProps) {
  const [note, setNote] = useState<StandaloneNoteWithImages | null>(null)
  const [loaded, setLoaded] = useState(noteId === null)
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [titleError, setTitleError] = useState<string | null>(null)
  const [imageError, setImageError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  useEffect(() => {
    if (noteId === null) return
    getStandaloneNote(noteId).then((result) => {
      if (result) {
        setNote(result)
        setTitle(result.title)
        setText(result.text)
      }
      setLoaded(true)
    })
  }, [noteId])

  async function handleSave() {
    if (title.trim().length === 0) {
      setTitleError('請輸入標題')
      return
    }
    setTitleError(null)
    if (note) {
      await updateStandaloneNote(note.id, title, text)
      setNote({ ...note, title, text })
    } else {
      const id = await createStandaloneNote(title, text)
      setNote(await getStandaloneNote(id))
    }
  }

  async function handleImageSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !note) return
    if (note.images.length >= MAX_IMAGES) {
      setImageError(`每篇筆記最多 ${MAX_IMAGES} 張圖片`)
      return
    }
    const compressed = await compressImage(file)
    const result = await addStandaloneNoteImage(note.id, compressed)
    if (!result.ok) {
      setImageError(`每篇筆記最多 ${MAX_IMAGES} 張圖片`)
      return
    }
    setImageError(null)
    setNote(await getStandaloneNote(note.id))
  }

  async function handleRemoveImage(imageId: number | undefined) {
    if (imageId === undefined || !note) return
    await removeStandaloneNoteImage(imageId)
    setNote(await getStandaloneNote(note.id))
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
    if (!note) return
    await deleteStandaloneNote(note.id)
    setConfirmingDelete(false)
    onBack()
  }

  if (!loaded) return <p className="vocab-status">載入中…</p>

  return (
    <div className="vocab-detail">
      <button type="button" className="vocab-detail-back" onClick={onBack}>
        ← 返回筆記本
      </button>

      <label className="notebook-title-field">
        標題
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="標題" />
      </label>
      {titleError && <p className="vocab-error-inline">{titleError}</p>}

      <textarea
        className="note-textarea"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
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

      {imageError && <p className="vocab-error-inline">{imageError}</p>}

      {note && note.images.length < MAX_IMAGES && (
        <label className="note-add-image-button">
          加入圖片
          <input type="file" accept="image/*" onChange={handleImageSelected} />
        </label>
      )}

      <div className="note-edit-actions">
        <button type="button" className="batch-add-confirm" onClick={handleSave}>
          儲存
        </button>
      </div>

      {note && (
        <button type="button" className="note-delete-button" onClick={openDeleteConfirm}>
          刪除整篇筆記
        </button>
      )}

      {confirmingDelete && note && <DeleteNoteConfirm onConfirm={handleConfirmDelete} summary={note.title} />}
      {lightboxIndex !== null && note && (
        <ImageLightbox images={note.images.map((img) => img.blob)} initialIndex={lightboxIndex} />
      )}
    </div>
  )
}

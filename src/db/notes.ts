import { db, type ItemType, type NoteImageRecord } from './schema.ts'

function noteKeyOf(itemType: ItemType, itemId: string): string {
  return `${itemType}:${itemId}`
}

/** Best-effort request for persistent storage, so the browser is less likely to evict IndexedDB data (which now includes note images) under storage pressure. Never blocks the write it's attached to. */
async function requestPersistentStorage(): Promise<void> {
  if (!navigator.storage?.persist) return
  try {
    const granted = await navigator.storage.persist()
    console.log(`[notes] navigator.storage.persist() -> ${granted}`)
  } catch (err) {
    console.log('[notes] navigator.storage.persist() failed', err)
  }
}

export interface NoteWithImages {
  text: string
  updatedAt: Date
  images: NoteImageRecord[]
}

export async function getNote(itemType: ItemType, itemId: string): Promise<NoteWithImages | null> {
  const note = await db.notes.get([itemType, itemId])
  if (!note) return null
  const images = await db.noteImages.where('noteKey').equals(noteKeyOf(itemType, itemId)).sortBy('sort')
  return { text: note.text, updatedAt: note.updatedAt, images }
}

export async function saveNoteText(itemType: ItemType, itemId: string, text: string): Promise<void> {
  const existing = await db.notes.get([itemType, itemId])
  await db.notes.put({ itemType, itemId, text, updatedAt: new Date() })
  if (!existing) await requestPersistentStorage()
}

const MAX_NOTE_IMAGES = 4

export type AddImageResult = { ok: true } | { ok: false; reason: 'max-reached' }

export async function addNoteImage(itemType: ItemType, itemId: string, blob: Blob): Promise<AddImageResult> {
  const noteKey = noteKeyOf(itemType, itemId)
  const currentCount = await db.noteImages.where('noteKey').equals(noteKey).count()
  if (currentCount >= MAX_NOTE_IMAGES) return { ok: false, reason: 'max-reached' }

  const existingNote = await db.notes.get([itemType, itemId])
  await db.transaction('rw', db.notes, db.noteImages, async () => {
    if (!existingNote) {
      await db.notes.put({ itemType, itemId, text: '', updatedAt: new Date() })
    }
    await db.noteImages.add({ noteKey, blob, sort: currentCount })
  })
  if (!existingNote) await requestPersistentStorage()
  return { ok: true }
}

export async function removeNoteImage(imageId: number): Promise<void> {
  await db.noteImages.delete(imageId)
}

export async function deleteNote(itemType: ItemType, itemId: string): Promise<void> {
  const noteKey = noteKeyOf(itemType, itemId)
  await db.transaction('rw', db.notes, db.noteImages, async () => {
    await db.notes.delete([itemType, itemId])
    const imageIds = await db.noteImages.where('noteKey').equals(noteKey).primaryKeys()
    await db.noteImages.bulkDelete(imageIds)
  })
}

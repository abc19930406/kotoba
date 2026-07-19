import { db, type NoteImageRecord } from './schema.ts'

export const MAX_NOTE_IMAGES = 4

export type AddImageResult = { ok: true } | { ok: false; reason: 'max-reached' }

/** Shared by notes.ts (vocab/grammar item notes, `${itemType}:${itemId}` keys) and standaloneNotes.ts (`standalone:{id}` keys) — the noteImages table itself doesn't care which domain a key belongs to. */
export async function listNoteImages(noteKey: string): Promise<NoteImageRecord[]> {
  return db.noteImages.where('noteKey').equals(noteKey).sortBy('sort')
}

export async function addNoteImageByKey(noteKey: string, blob: Blob): Promise<AddImageResult> {
  const currentCount = await db.noteImages.where('noteKey').equals(noteKey).count()
  if (currentCount >= MAX_NOTE_IMAGES) return { ok: false, reason: 'max-reached' }
  await db.noteImages.add({ noteKey, blob, sort: currentCount })
  return { ok: true }
}

export async function removeNoteImage(imageId: number): Promise<void> {
  await db.noteImages.delete(imageId)
}

export async function deleteNoteImagesByKey(noteKey: string): Promise<void> {
  const ids = await db.noteImages.where('noteKey').equals(noteKey).primaryKeys()
  await db.noteImages.bulkDelete(ids)
}

/** Best-effort request for persistent storage, so the browser is less likely to evict IndexedDB data (which includes note images) under storage pressure. Never blocks the write it's attached to. */
export async function requestPersistentStorage(): Promise<void> {
  if (!navigator.storage?.persist) return
  try {
    const granted = await navigator.storage.persist()
    console.log(`[notes] navigator.storage.persist() -> ${granted}`)
  } catch (err) {
    console.log('[notes] navigator.storage.persist() failed', err)
  }
}

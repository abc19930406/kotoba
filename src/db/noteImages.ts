import { db, type NoteImageRecord } from './schema.ts'
import { scheduleSyncPush } from '../shared/syncEngine.ts'
import { enqueueSync } from './syncQueue.ts'

export const MAX_NOTE_IMAGES = 4

export type AddImageResult = { ok: true } | { ok: false; reason: 'max-reached' }

/** Shared by notes.ts (vocab/grammar item notes, `${itemType}:${itemId}` keys) and standaloneNotes.ts (`standalone:{id}` keys) — the noteImages table itself doesn't care which domain a key belongs to. */
export async function listNoteImages(noteKey: string): Promise<NoteImageRecord[]> {
  return db.noteImages.where('noteKey').equals(noteKey).sortBy('sort')
}

/** Both notes.ts and standaloneNotes.ts funnel image creation through here, so the remoteId (Phase C4a Storage path key) and the upload trigger only need to live in one place. */
export async function addNoteImageByKey(noteKey: string, blob: Blob): Promise<AddImageResult> {
  const currentCount = await db.noteImages.where('noteKey').equals(noteKey).count()
  if (currentCount >= MAX_NOTE_IMAGES) return { ok: false, reason: 'max-reached' }
  await db.noteImages.add({ noteKey, blob, sort: currentCount, remoteId: crypto.randomUUID() })
  scheduleSyncPush()
  return { ok: true }
}

/**
 * Deletes one image locally and — only if it had ever been uploaded (has a
 * `storagePath`) — queues its cloud tombstone + Storage cleanup (Phase C6).
 * An image that was never uploaded has nothing on the cloud for any other
 * device to know about, so there's nothing to tombstone: deleting it
 * produces no sync entry at all, matching this phase's "an unsynced delete
 * never creates an invalid tombstone" rule.
 */
export async function removeNoteImage(imageId: number): Promise<void> {
  const image = await db.noteImages.get(imageId)
  await db.noteImages.delete(imageId)
  if (!image || image.storagePath === undefined) return
  await enqueueSync('noteImages', image.remoteId, 'delete', {
    deletedAt: new Date().toISOString(),
    storagePath: image.storagePath,
  })
}

/**
 * Called both when a user deletes a whole note (notes.ts/standaloneNotes.ts)
 * and when pull cascades a delete from a note-level tombstone
 * (src/db/syncPull.ts) — every image goes through removeNoteImage() so both
 * callers get the exact same Storage cleanup / cloud tombstone behavior,
 * not a parallel bulk-delete path that would only clean up locally.
 */
export async function deleteNoteImagesByKey(noteKey: string): Promise<void> {
  const images = await db.noteImages.where('noteKey').equals(noteKey).toArray()
  for (const image of images) {
    await removeNoteImage(image.id!)
  }
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

import { db, DB_SCHEMA_VERSION, type NoteImageRecord } from './schema.ts'
import type { BackupData } from './backupSchema.ts'

const BASE64_CHUNK_SIZE = 0x8000 // 32k — safely under any engine's spread-argument limit

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + BASE64_CHUNK_SIZE))
  }
  return btoa(binary)
}

export function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mimeType })
}

/** Full snapshot of all seven tables, for the 資料備份 export/import feature. */
export async function exportBackup(): Promise<BackupData> {
  const [cards, reviewLogs, queuedItems, settings, notes, noteImages, standaloneNotes] = await Promise.all([
    db.cards.toArray(),
    db.reviewLogs.toArray(),
    db.queuedItems.toArray(),
    db.settings.toArray(),
    db.notes.toArray(),
    db.noteImages.toArray(),
    db.standaloneNotes.toArray(),
  ])
  const encodedImages = await Promise.all(
    noteImages.map(async (img) => ({
      id: img.id,
      noteKey: img.noteKey,
      sort: img.sort,
      imageBase64: await blobToBase64(img.blob),
      mimeType: img.blob.type || 'image/jpeg',
    })),
  )
  return {
    schemaVersion: DB_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    cards,
    reviewLogs,
    queuedItems,
    settings,
    notes,
    noteImages: encodedImages,
    standaloneNotes,
  }
}

/**
 * Replaces (not merges) all seven tables with `data`'s contents, in one
 * transaction. `reviewLogs`/`noteImages`/`standaloneNotes` rows keep their
 * original `id` — IndexedDB's auto-increment key generator tracks the
 * highest key ever inserted, so future rows still get fresh, non-colliding
 * ids after this.
 */
export async function importBackup(data: BackupData): Promise<void> {
  const decodedImages: NoteImageRecord[] = data.noteImages.map((img) => ({
    id: img.id,
    noteKey: img.noteKey,
    sort: img.sort,
    blob: base64ToBlob(img.imageBase64, img.mimeType),
  }))

  await db.transaction(
    'rw',
    [db.cards, db.reviewLogs, db.queuedItems, db.settings, db.notes, db.noteImages, db.standaloneNotes],
    async () => {
      await Promise.all([
        db.cards.clear(),
        db.reviewLogs.clear(),
        db.queuedItems.clear(),
        db.settings.clear(),
        db.notes.clear(),
        db.noteImages.clear(),
        db.standaloneNotes.clear(),
      ])
      await Promise.all([
        db.cards.bulkAdd(data.cards),
        db.reviewLogs.bulkAdd(data.reviewLogs),
        db.queuedItems.bulkAdd(data.queuedItems),
        db.settings.bulkAdd(data.settings),
        db.notes.bulkAdd(data.notes),
        db.noteImages.bulkAdd(decodedImages),
        db.standaloneNotes.bulkAdd(data.standaloneNotes),
      ])
    },
  )
}

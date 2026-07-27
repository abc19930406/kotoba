import { db } from './schema.ts'
import { supabase } from './supabase.ts'

const BUCKET = 'kotoba-note-images'

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * `vocab:v1` / `grammar:N5-～（場所）に～があります` → `vocab/{hash}/…` /
 * `grammar/{hash}/…`, `standalone:42` → `standalone/{that note's remoteId}/…`.
 *
 * `itemId` can be an arbitrary human-readable string (confirmed root cause:
 * grammar ids are titles, e.g. containing full-width brackets/tildes/spaces
 * — all invalid or problematic in a Storage object key, which is what
 * produced the 400s). It's hashed rather than sanitized-in-place so the
 * result is guaranteed safe regardless of what future itemIds ever contain,
 * and the hash is a pure function of itemId — any device can recompute the
 * same path prefix from just the note's identity, with no separate
 * path↔noteKey mapping to store or sync.
 *
 * Standalone notes use their own `remoteId` instead of noteKey's local
 * auto-increment id — that id is per-device (Phase C3b's pull assigns a
 * fresh one on each device), so it can't be a stable Storage path segment;
 * `remoteId` is the same cross-device identifier C3a/C3b already rely on.
 */
async function storagePathFor(noteKey: string, imageRemoteId: string): Promise<string> {
  const sep = noteKey.indexOf(':')
  const prefix = noteKey.slice(0, sep)
  const rest = noteKey.slice(sep + 1)

  if (prefix === 'standalone') {
    const note = await db.standaloneNotes.get(Number(rest))
    // Falls back to the local id if the note is somehow already gone —
    // never throws; worst case is a slightly less ideal path, not a failure.
    const stableId = note?.remoteId ?? rest
    return `standalone/${stableId}/${imageRemoteId}.jpg`
  }

  const hash = (await sha256Hex(rest)).slice(0, 16)
  return `${prefix}/${hash}/${imageRemoteId}.jpg`
}

/**
 * Uploads every note image that hasn't been uploaded yet (`storagePath`
 * still unset) to the `kotoba-note-images` bucket. Silently no-ops when not
 * logged in / not configured — same guard as push/pull. Each image is
 * handled independently so one failure doesn't block the rest.
 *
 * Structural guarantee: this function only ever calls `db.noteImages.update`
 * to set `storagePath` — it never touches `blob`/`noteKey`/`sort`, and never
 * deletes a local row. "Doesn't lose or alter local images" isn't a runtime
 * check here, it's simply not a code path that exists.
 */
export async function uploadPendingImages(): Promise<void> {
  if (!supabase) return
  const { data } = await supabase.auth.getSession()
  if (!data.session) return

  const pending = await db.noteImages.filter((img) => img.storagePath === undefined).toArray()

  for (const image of pending) {
    try {
      const path = await storagePathFor(image.noteKey, image.remoteId)
      const { error } = await supabase.storage.from(BUCKET).upload(path, image.blob, {
        upsert: true,
        contentType: 'image/jpeg',
      })
      if (error) throw error
      await db.noteImages.update(image.id!, { storagePath: path })
    } catch {
      // Leave this image pending — retried on the next sync trigger.
    }
  }
}

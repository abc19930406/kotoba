import { db } from './schema.ts'
import { supabase } from './supabase.ts'
import { storagePrefixForNoteKey } from './syncImageShared.ts'

const BUCKET = 'kotoba-note-images'

/**
 * `vocab:v1` / `grammar:N5-～（場所）に～があります` → `vocab/{hash}/…` /
 * `grammar/{hash}/…`, `standalone:42` → `standalone/{that note's remoteId}/…`.
 * Prefix computation (the part any device must be able to recompute
 * identically, shared with C4b's download side) lives in syncImageShared.ts
 * — this just appends the image's own filename.
 */
async function storagePathFor(noteKey: string, imageRemoteId: string): Promise<string> {
  const prefix = await storagePrefixForNoteKey(noteKey)
  return `${prefix}/${imageRemoteId}.jpg`
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

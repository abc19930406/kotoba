import { db } from './schema.ts'
import { supabase } from './supabase.ts'

const BUCKET = 'kotoba-note-images'

/** `vocab:v1` → `vocab/v1`, `standalone:42` → `standalone/42` — noteKey's existing format already carries everything needed for a stable, traceable Storage path. */
function storagePathFor(noteKey: string, remoteId: string): string {
  return `${noteKey.replace(':', '/')}/${remoteId}.jpg`
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
      const path = storagePathFor(image.noteKey, image.remoteId)
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

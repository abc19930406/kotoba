import { db } from './schema.ts'
import { supabase } from './supabase.ts'
import { CLOUD_TABLE } from './syncShared.ts'

const BUCKET = 'kotoba-note-images'

/**
 * Applies image-deletion tombstones pushed by other devices: for each
 * tombstoned `remoteId` that still has a local `noteImages` row, removes the
 * Storage object first (if it had ever been uploaded), then deletes the
 * local row — in that order, deliberately. If the Storage removal fails,
 * the local row is left intact, so the very next pull (which re-fetches the
 * tombstone table fresh every time, same as every other pull function)
 * finds the same local row still there and retries both steps — no
 * separate retry queue needed.
 *
 * Images are immutable (add/remove only, no "edit"), so unlike the six data
 * tables there's no content-vs-delete race to resolve here — a tombstone
 * always applies once it exists, no timestamp comparison needed (same
 * simplicity as reviewLogs' remoteId-presence-only dedup).
 *
 * Silently no-ops when not logged in / not configured, same guard as every
 * other sync entry point. Never deletes a local image that has no matching
 * tombstone row — the tombstone table missing an entry for some image is
 * never treated as "so it's fine to delete," only an explicit tombstone
 * ever triggers a local delete here.
 */
export async function applyImageDeletions(): Promise<void> {
  if (!supabase) return
  const { data } = await supabase.auth.getSession()
  if (!data.session) return

  let tombstones: { remote_id: string }[]
  try {
    const { data: rows, error } = await supabase.from(CLOUD_TABLE.noteImages).select('remote_id')
    if (error) throw error
    tombstones = (rows ?? []) as { remote_id: string }[]
  } catch (err) {
    console.warn('[syncImageDelete] failed to fetch tombstones', err)
    return
  }

  for (const { remote_id: remoteId } of tombstones) {
    try {
      const local = await db.noteImages.where('remoteId').equals(remoteId).first()
      if (!local) continue

      if (local.storagePath) {
        const { error } = await supabase.storage.from(BUCKET).remove([local.storagePath])
        if (error) throw error
      }
      await db.noteImages.delete(local.id!)
    } catch (err) {
      console.warn(`[syncImageDelete] failed to apply deletion for ${remoteId}`, err)
    }
  }
}

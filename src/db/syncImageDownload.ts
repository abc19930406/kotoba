import { db } from './schema.ts'
import { supabase } from './supabase.ts'
import { storagePrefixForItemNote, storagePrefixForStandaloneNoteRemoteId } from './syncImageShared.ts'
import { MAX_NOTE_IMAGES } from './noteImages.ts'

const BUCKET = 'kotoba-note-images'
const JPG_SUFFIX = '.jpg'

/**
 * Downloads every image in `prefix` that isn't local yet and attaches it to
 * `noteKey`. Never throws — a failure at any point (listing the folder, one
 * image's download) is swallowed so it doesn't block sibling images or
 * other notes; the next pull retries.
 */
async function downloadImagesForNote(noteKey: string, prefix: string): Promise<void> {
  let files: { name: string }[]
  try {
    const { data, error } = await supabase!.storage.from(BUCKET).list(prefix)
    if (error) throw error
    files = data ?? []
  } catch {
    return
  }

  for (const file of files) {
    if (!file.name.endsWith(JPG_SUFFIX)) continue
    try {
      const imageRemoteId = file.name.slice(0, -JPG_SUFFIX.length)

      // Global remoteId dedup — it's this image's unique identity regardless
      // of which noteKey namespace it's filed under.
      const existing = await db.noteImages.where('remoteId').equals(imageRemoteId).first()
      if (existing) continue

      const currentCount = await db.noteImages.where('noteKey').equals(noteKey).count()
      if (currentCount >= MAX_NOTE_IMAGES) continue

      const path = `${prefix}/${file.name}`
      const { data: blob, error: downloadError } = await supabase!.storage.from(BUCKET).download(path)
      if (downloadError || !blob) throw downloadError ?? new Error('empty download')

      // storagePath is set immediately — the same "already uploaded" filter
      // uploadPendingImages() already uses (storagePath === undefined means
      // pending) naturally treats this row as never-pending, with no
      // separate "came from remote" flag needed (Phase C3b's pull uses the
      // analogous trick of just never calling enqueueSync).
      await db.noteImages.add({ noteKey, blob, sort: currentCount, remoteId: imageRemoteId, storagePath: path })
    } catch {
      // Leave this image undownloaded — retried on the next pull trigger.
    }
  }
}

/**
 * Downloads, for every locally-known note, any image that exists in its
 * Storage folder but not yet locally. Silently no-ops when not logged in /
 * not configured — same guard as pull/push/upload. Run after
 * pullRemoteChanges() so a brand-new device already has the note rows (and
 * therefore their prefixes) available in the same sync pass.
 *
 * Safety rules (mirrors syncPull.ts's phrasing — same guarantees, same
 * reason they matter here):
 * - never deletes/clears a local row — a cloud folder missing an image, or
 *   missing entirely, is never treated as "so delete the local copy"; this
 *   file has no code path that calls `.delete()`/`.clear()` on noteImages
 * - dedup is by the image's own `remoteId`, which is globally unique, so an
 *   image already local (from C4a's own upload, or a prior download) is
 *   never re-downloaded
 *
 * Known limitation, not covered by the acceptance criteria: Storage's
 * `.list()` doesn't guarantee its result order matches another device's
 * original add-order (filenames are uuids), so `sort` on a freshly-downloaded
 * image only reflects listing order, not necessarily the original device's
 * order — cross-device image ordering isn't guaranteed, only presence/
 * no-duplication/no-loss is.
 */
export async function downloadPendingImages(): Promise<void> {
  if (!supabase) return
  const { data } = await supabase.auth.getSession()
  if (!data.session) return

  for (const note of await db.notes.toArray()) {
    try {
      const noteKey = `${note.itemType}:${note.itemId}`
      const prefix = await storagePrefixForItemNote(note.itemType, note.itemId)
      await downloadImagesForNote(noteKey, prefix)
    } catch {
      // Leave this note's images as-is — retried on the next pull trigger.
    }
  }

  for (const note of await db.standaloneNotes.toArray()) {
    try {
      const noteKey = `standalone:${note.id}`
      const prefix = storagePrefixForStandaloneNoteRemoteId(note.remoteId)
      await downloadImagesForNote(noteKey, prefix)
    } catch {
      // Leave this note's images as-is — retried on the next pull trigger.
    }
  }
}

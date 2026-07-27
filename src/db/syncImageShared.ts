import { db, type ItemType } from './schema.ts'

export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * `vocab`/`v1` → `vocab/{hash of v1}`, `grammar`/`N5-～（場所）に～があります`
 * → `grammar/{hash}`. Pure function of itemType+itemId — any device
 * recomputes the identical prefix with no stored mapping needed, which is
 * what lets C4b's download side discover a note's images without a separate
 * cloud metadata table.
 *
 * itemId is hashed rather than sanitized-in-place so the result is safe
 * regardless of content: grammar ids are human-readable titles that can
 * contain full-width brackets/tildes/spaces — all invalid or problematic in
 * a Storage object key (Phase C4a's root cause for its original 400s).
 */
export async function storagePrefixForItemNote(itemType: ItemType, itemId: string): Promise<string> {
  const hash = (await sha256Hex(itemId)).slice(0, 16)
  return `${itemType}/${hash}`
}

/**
 * `standalone/{remoteId}` — the note's own cross-device-stable `remoteId`,
 * never its per-device local auto-increment id (Phase C3b's pull assigns a
 * fresh local id per device, so that id can't be a stable Storage path
 * segment).
 */
export function storagePrefixForStandaloneNoteRemoteId(remoteId: string): string {
  return `standalone/${remoteId}`
}

/**
 * Resolves a `noteKey` (`${itemType}:${itemId}` or `standalone:{localId}`)
 * to its Storage prefix — used where only the noteKey string is at hand
 * (syncImageUpload.ts), not the note record itself. Looks up the
 * standaloneNotes row to translate its local id into the stable remoteId;
 * falls back to the local id if the note is somehow already gone (never
 * throws — worst case is a slightly less ideal path, not a failure).
 */
export async function storagePrefixForNoteKey(noteKey: string): Promise<string> {
  const sep = noteKey.indexOf(':')
  const prefix = noteKey.slice(0, sep)
  const rest = noteKey.slice(sep + 1)

  if (prefix === 'standalone') {
    const note = await db.standaloneNotes.get(Number(rest))
    return storagePrefixForStandaloneNoteRemoteId(note?.remoteId ?? rest)
  }

  return storagePrefixForItemNote(prefix as ItemType, rest)
}

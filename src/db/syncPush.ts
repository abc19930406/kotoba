import { db, type SyncTable, type SyncQueueRecord } from './schema.ts'
import { supabase } from './supabase.ts'
import { CLOUD_TABLE, decodeCompositeKey } from './syncShared.ts'

const BUCKET = 'kotoba-note-images'

const ON_CONFLICT: Record<SyncTable, string> = {
  cards: 'item_type,item_id',
  reviewLogs: 'id',
  queuedItems: 'item_type,item_id',
  notes: 'item_type,item_id',
  standaloneNotes: 'id',
  settings: 'key',
  // Never actually exercised — noteImages has no upsert path here (its
  // uploads go through src/db/syncImageUpload.ts); this only exists to
  // satisfy Record<SyncTable, string>.
  noteImages: 'remote_id',
}

/**
 * Builds the kotoba_* row payload for one pending upsert, or `null` if the
 * local row no longer exists (nothing left to push — treat as resolved).
 * `updated_at` always comes from the row's own persisted timestamp field —
 * the same field pull (src/db/syncPull.ts) compares against for
 * last-write-wins, so both directions agree on what "last modified" means.
 *
 * `deleted_at: null` (Phase C6, every table except reviewLogs — that one has
 * no tombstone column at all, no delete-sync) unconditionally clears any
 * existing cloud tombstone on every upsert: pushing a local edit always
 * means "I have this data alive right now," so any prior deletion (from a
 * device that hasn't seen this edit yet) should be revived. This is
 * deliberately NOT conditional on timing — see syncPush's own doc comment
 * for why that asymmetry (delete is conditional, upsert isn't) is the
 * intended design.
 */
async function buildUpsertRow(table: SyncTable, key: string): Promise<Record<string, unknown> | null> {
  if (table === 'cards') {
    const { itemType, itemId } = decodeCompositeKey(key)
    const row = await db.cards.get([itemType, itemId])
    if (!row) return null
    return {
      item_id: row.itemId,
      item_type: row.itemType,
      level: row.level,
      due: row.due.toISOString(),
      stability: row.stability,
      difficulty: row.difficulty,
      elapsed_days: row.elapsed_days,
      scheduled_days: row.scheduled_days,
      learning_steps: row.learning_steps,
      reps: row.reps,
      lapses: row.lapses,
      state: row.state,
      last_review: row.last_review ? row.last_review.toISOString() : null,
      suspended: row.suspended,
      updated_at: row.updatedAt.toISOString(),
      deleted_at: null,
    }
  }
  if (table === 'reviewLogs') {
    const row = await db.reviewLogs.where('remoteId').equals(key).first()
    if (!row) return null
    return {
      id: row.remoteId,
      item_id: row.itemId,
      item_type: row.itemType,
      rating: row.rating,
      state: row.state,
      due: row.due.toISOString(),
      stability: row.stability,
      difficulty: row.difficulty,
      scheduled_days: row.scheduled_days,
      learning_steps: row.learning_steps,
      review: row.review.toISOString(),
      // Append-only history — no separate "last modified" concept, so this
      // just reuses the review event's own timestamp. No deleted_at column
      // on this table — reviewLogs is explicitly excluded from C6.
      updated_at: row.review.toISOString(),
    }
  }
  if (table === 'queuedItems') {
    const { itemType, itemId } = decodeCompositeKey(key)
    const row = await db.queuedItems.get([itemType, itemId])
    if (!row) return null
    return {
      item_id: row.itemId,
      item_type: row.itemType,
      level: row.level,
      added_at: row.addedAt.toISOString(),
      // Never updated in place locally (only created/deleted — see
      // src/db/cards.ts), so addedAt already doubles as "last modified".
      updated_at: row.addedAt.toISOString(),
      deleted_at: null,
    }
  }
  if (table === 'notes') {
    const { itemType, itemId } = decodeCompositeKey(key)
    const row = await db.notes.get([itemType, itemId])
    if (!row) return null
    return {
      item_id: row.itemId,
      item_type: row.itemType,
      text: row.text,
      updated_at: row.updatedAt.toISOString(),
      deleted_at: null,
    }
  }
  if (table === 'standaloneNotes') {
    const row = await db.standaloneNotes.where('remoteId').equals(key).first()
    if (!row) return null
    return { id: row.remoteId, title: row.title, text: row.text, updated_at: row.updatedAt.toISOString(), deleted_at: null }
  }
  // settings
  const row = await db.settings.get(key)
  if (!row) return null
  return { key: row.key, value: row.value, updated_at: row.updatedAt.toISOString(), deleted_at: null }
}

function deleteMatch(table: SyncTable, key: string): Record<string, unknown> {
  if (table === 'reviewLogs' || table === 'standaloneNotes') return { id: key }
  if (table === 'settings') return { key }
  const { itemType, itemId } = decodeCompositeKey(key)
  return { item_type: itemType, item_id: itemId }
}

interface Group {
  table: SyncTable
  key: string
  op: 'upsert' | 'delete'
  entryIds: number[]
  deletedAt?: string
  storagePath?: string
}

function coalesce(entries: SyncQueueRecord[]): Group[] {
  const groups = new Map<string, Group>()
  for (const entry of entries) {
    const groupKey = `${entry.table}::${entry.key}`
    const existing = groups.get(groupKey)
    if (!existing || (entry.id ?? 0) > Math.max(...existing.entryIds)) {
      groups.set(groupKey, {
        table: entry.table,
        key: entry.key,
        op: entry.op,
        deletedAt: entry.deletedAt,
        storagePath: entry.storagePath,
        entryIds: existing ? [...existing.entryIds, entry.id!] : [entry.id!],
      })
    } else {
      existing.entryIds.push(entry.id!)
    }
  }
  return [...groups.values()]
}

/**
 * Pushes a tombstone for one deleted `noteImages` row: upserts into the
 * dedicated `kotoba_note_image_deletions` table (images have no per-row
 * cloud table of their own — Storage-only), then removes the Storage
 * object if it had ever been uploaded. Images are immutable (add/remove
 * only, never edited), so unlike the six data tables there's no
 * content-vs-delete race to resolve — a tombstone always applies.
 */
async function pushImageDeletion(group: Group): Promise<void> {
  const deletedAt = group.deletedAt ?? new Date().toISOString()
  const { error } = await supabase!
    .from(CLOUD_TABLE.noteImages)
    .upsert({ remote_id: group.key, deleted_at: deletedAt }, { onConflict: 'remote_id' })
  if (error) throw error

  if (group.storagePath) {
    const { error: removeError } = await supabase!.storage.from(BUCKET).remove([group.storagePath])
    if (removeError) throw removeError
  }
}

/**
 * Pushes a tombstone for one deleted row on a data table (cards/
 * queuedItems/notes/standaloneNotes/settings). Conditional on the cloud
 * row's current `updated_at`: if it's newer than (or equal to) this
 * device's local delete timestamp, the update matches 0 rows — this
 * device's delete silently loses to a genuinely newer edit it hasn't
 * pulled yet, rather than clobbering it (favoring "under-delete" over
 * "wrongly delete", per this phase's top safety priority). That device
 * self-heals on its own next pull: it no longer has a local row, so pull's
 * existing "local missing → add" rule re-adds the (still-alive) cloud row
 * — no extra code needed for that recovery path.
 */
async function pushRowDeletion(table: SyncTable, group: Group): Promise<void> {
  const deletedAt = group.deletedAt ?? new Date().toISOString()
  const { error } = await supabase!
    .from(CLOUD_TABLE[table])
    .update({ deleted_at: deletedAt })
    .match(deleteMatch(table, group.key))
    .or(`updated_at.is.null,updated_at.lt.${deletedAt}`)
  if (error) throw error
}

/**
 * Pushes everything in the outbox to Supabase. Silently no-ops when not
 * logged in / not configured / offline — this is the only entry point that
 * touches `kotoba_*` tables, and it only ever reads local tables and deletes
 * `syncQueue` rows on confirmed success. It never writes to cards/reviewLogs/
 * queuedItems/notes/standaloneNotes/settings — that's the whole reason local
 * data can't be altered by a push, structurally, not by a runtime check.
 *
 * Deletes are soft (a `deleted_at` tombstone), never a real `DELETE FROM` —
 * see pushRowDeletion/pushImageDeletion above for why, and src/db/
 * syncPull.ts for how the tombstone gets applied on other devices.
 */
export async function pushPendingChanges(): Promise<void> {
  if (!supabase) return
  const { data } = await supabase.auth.getSession()
  if (!data.session) return

  const entries = await db.syncQueue.toArray()
  if (entries.length === 0) return

  const byTable = new Map<SyncTable, Group[]>()
  for (const group of coalesce(entries)) {
    const list = byTable.get(group.table) ?? []
    list.push(group)
    byTable.set(group.table, list)
  }

  for (const [table, groups] of byTable) {
    const upsertGroups = groups.filter((g) => g.op === 'upsert')
    const deleteGroups = groups.filter((g) => g.op === 'delete')

    if (upsertGroups.length > 0) {
      try {
        const rows = (await Promise.all(upsertGroups.map((g) => buildUpsertRow(table, g.key)))).filter(
          (row): row is Record<string, unknown> => row !== null,
        )
        if (rows.length > 0) {
          const { error } = await supabase.from(CLOUD_TABLE[table]).upsert(rows, { onConflict: ON_CONFLICT[table] })
          if (error) throw error
        }
        const clearedIds = upsertGroups.flatMap((g) => g.entryIds)
        await db.syncQueue.bulkDelete(clearedIds)
      } catch {
        // Leave this table's upsert entries queued — retried on the next trigger.
      }
    }

    for (const group of deleteGroups) {
      try {
        if (table === 'noteImages') {
          await pushImageDeletion(group)
        } else {
          await pushRowDeletion(table, group)
        }
        await db.syncQueue.bulkDelete(group.entryIds)
      } catch {
        // Leave this one entry queued — retried on the next trigger.
      }
    }
  }
}

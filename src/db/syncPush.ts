import { db, type SyncTable, type SyncQueueRecord } from './schema.ts'
import { supabase } from './supabase.ts'
import { CLOUD_TABLE, decodeCompositeKey } from './syncShared.ts'

const ON_CONFLICT: Record<SyncTable, string> = {
  cards: 'item_type,item_id',
  reviewLogs: 'id',
  queuedItems: 'item_type,item_id',
  notes: 'item_type,item_id',
  standaloneNotes: 'id',
  settings: 'key',
}

/**
 * Builds the kotoba_* row payload for one pending upsert, or `null` if the
 * local row no longer exists (nothing left to push — treat as resolved).
 * `updated_at` always comes from the row's own persisted timestamp field —
 * the same field pull (src/db/syncPull.ts) compares against for
 * last-write-wins, so both directions agree on what "last modified" means.
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
      // just reuses the review event's own timestamp.
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
    }
  }
  if (table === 'notes') {
    const { itemType, itemId } = decodeCompositeKey(key)
    const row = await db.notes.get([itemType, itemId])
    if (!row) return null
    return { item_id: row.itemId, item_type: row.itemType, text: row.text, updated_at: row.updatedAt.toISOString() }
  }
  if (table === 'standaloneNotes') {
    const row = await db.standaloneNotes.where('remoteId').equals(key).first()
    if (!row) return null
    return { id: row.remoteId, title: row.title, text: row.text, updated_at: row.updatedAt.toISOString() }
  }
  // settings
  const row = await db.settings.get(key)
  if (!row) return null
  return { key: row.key, value: row.value, updated_at: row.updatedAt.toISOString() }
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
        entryIds: existing ? [...existing.entryIds, entry.id!] : [entry.id!],
      })
    } else {
      existing.entryIds.push(entry.id!)
    }
  }
  return [...groups.values()]
}

/**
 * Pushes everything in the outbox to Supabase. Silently no-ops when not
 * logged in / not configured / offline — this is the only entry point that
 * touches `kotoba_*` tables, and it only ever reads local tables and deletes
 * `syncQueue` rows on confirmed success. It never writes to cards/reviewLogs/
 * queuedItems/notes/standaloneNotes/settings — that's the whole reason local
 * data can't be altered by a push, structurally, not by a runtime check.
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
        const { error } = await supabase.from(CLOUD_TABLE[table]).delete().match(deleteMatch(table, group.key))
        if (error) throw error
        await db.syncQueue.bulkDelete(group.entryIds)
      } catch {
        // Leave this one entry queued — retried on the next trigger.
      }
    }
  }
}

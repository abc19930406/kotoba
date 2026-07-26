import { db, type SyncTable, type ItemType } from './schema.ts'
import { scheduleSyncPush } from '../shared/syncEngine.ts'

/** Encodes the composite-key tables' (cards/queuedItems/notes) remote primary key. Must match decodeCompositeKey in src/db/syncPush.ts. */
export function compositeKey(itemType: ItemType, itemId: string): string {
  return `${itemType}:${itemId}`
}

/**
 * Logs "this (table, key) needs pushing" and schedules a debounced push.
 * Callers must call this inside the same Dexie transaction as the actual
 * data write (add `db.syncQueue` to the transaction's table list) so the
 * write and its outbox entry commit atomically.
 */
export async function enqueueSync(table: SyncTable, key: string, op: 'upsert' | 'delete'): Promise<void> {
  await db.syncQueue.add({ table, key, op })
  scheduleSyncPush()
}

import type { SyncTable, ItemType } from './schema.ts'

/** The `kotoba_*` table name for each local syncable table. */
export const CLOUD_TABLE: Record<SyncTable, string> = {
  cards: 'kotoba_cards',
  reviewLogs: 'kotoba_review_logs',
  queuedItems: 'kotoba_queued_items',
  notes: 'kotoba_notes',
  standaloneNotes: 'kotoba_standalone_notes',
  settings: 'kotoba_settings',
}

export interface CompositeKey {
  itemType: ItemType
  itemId: string
}

/** Decodes a composite-key table's (cards/queuedItems/notes) syncQueue key back into its parts. Must match src/db/syncQueue.ts's compositeKey(). */
export function decodeCompositeKey(key: string): CompositeKey {
  const sep = key.indexOf(':')
  return { itemType: key.slice(0, sep) as ItemType, itemId: key.slice(sep + 1) }
}

import { db, DB_SCHEMA_VERSION } from './schema.ts'
import type { BackupData } from './backupSchema.ts'

/** Full snapshot of all four tables, for the 資料備份 export/import feature. */
export async function exportBackup(): Promise<BackupData> {
  const [cards, reviewLogs, queuedItems, settings] = await Promise.all([
    db.cards.toArray(),
    db.reviewLogs.toArray(),
    db.queuedItems.toArray(),
    db.settings.toArray(),
  ])
  return {
    schemaVersion: DB_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    cards,
    reviewLogs,
    queuedItems,
    settings,
  }
}

/**
 * Replaces (not merges) all four tables with `data`'s contents, in one
 * transaction. `reviewLogs` rows keep their original `id` — IndexedDB's
 * auto-increment key generator tracks the highest key ever inserted, so
 * future reviews still get fresh, non-colliding ids after this.
 */
export async function importBackup(data: BackupData): Promise<void> {
  await db.transaction('rw', db.cards, db.reviewLogs, db.queuedItems, db.settings, async () => {
    await Promise.all([db.cards.clear(), db.reviewLogs.clear(), db.queuedItems.clear(), db.settings.clear()])
    await Promise.all([
      db.cards.bulkAdd(data.cards),
      db.reviewLogs.bulkAdd(data.reviewLogs),
      db.queuedItems.bulkAdd(data.queuedItems),
      db.settings.bulkAdd(data.settings),
    ])
  })
}

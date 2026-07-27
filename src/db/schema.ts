import Dexie, { type Table } from 'dexie'
import type { FuriganaSegment, JlptLevel } from '../shared/contentTypes.ts'
import type { GrammarNote } from '../shared/dailyMaterialTypes.ts'

export type ItemType = 'vocab' | 'grammar'

/**
 * Mirrors ts-fsrs's `Card` shape (due/stability/.../last_review) plus the
 * fields needed to identify and render the item. `level` is stored here
 * (not just derivable from itemId) so the review queue can lazy-load the
 * right content chunk without scanning every level file.
 */
export interface CardRecord {
  itemId: string
  itemType: ItemType
  level: JlptLevel
  due: Date
  stability: number
  difficulty: number
  elapsed_days: number
  scheduled_days: number
  learning_steps: number
  reps: number
  lapses: number
  state: number
  last_review?: Date
  /** User marked this item "已熟悉" — excluded from due/new queues but scheduling data is kept intact so resuming continues the same FSRS schedule. */
  suspended: boolean
  /** Last local modification — the authoritative source for push's kotoba_cards.updated_at and pull's last-write-wins comparison (Phase C3b). */
  updatedAt: Date
}

/** Mirrors ts-fsrs's `ReviewLog` shape, one row per grading event. */
export interface ReviewLogRecord {
  id?: number
  /** Client-generated at creation — this row's primary key in kotoba_review_logs (Phase C2). Local `id` is a per-device auto-increment and would collide across devices, so sync keys off this instead. */
  remoteId: string
  itemId: string
  itemType: ItemType
  rating: number
  state: number
  due: Date
  stability: number
  difficulty: number
  scheduled_days: number
  learning_steps: number
  review: Date
}

export interface SettingRecord {
  key: string
  value: number
  /** Last local modification — see CardRecord.updatedAt for why this exists (Phase C3b). */
  updatedAt: Date
}

/**
 * A word/grammar point the user chose to study, before it's ever been
 * reviewed. `cards` rows only exist post-first-review (see cards.ts), so
 * "加入複習" from the browse page needs somewhere to register interest —
 * this is that holding area. The review queue drains it (oldest first) into
 * real `cards` rows as new-card slots become available; gradeItem() removes
 * the row here the moment an item gets its first review.
 */
export interface QueuedItemRecord {
  itemId: string
  itemType: ItemType
  level: JlptLevel
  addedAt: Date
}

/** One personal note per item (1:1 via compound key), 文字 + up to 4 images (see NoteImageRecord). */
export interface NoteRecord {
  itemId: string
  itemType: ItemType
  text: string
  updatedAt: Date
}

/**
 * `noteKey` is `${itemType}:${itemId}` — a plain string link back to the
 * owning NoteRecord rather than a compound key, since a note can have
 * several images (Dexie has no real foreign keys either way).
 */
export interface NoteImageRecord {
  id?: number
  noteKey: string
  blob: Blob
  sort: number
  /** Client-generated at creation — Storage object path is `${noteKey with ':' replaced by '/'}/${remoteId}.jpg` (Phase C4a). Same collision rationale as ReviewLogRecord.remoteId: the local auto-increment id is per-device and could collide across devices. */
  remoteId: string
  /** Set once the upload succeeds — its presence (not a separate boolean) is what "already uploaded" means. Absent = still pending. */
  storagePath?: string
}

/** A standalone note (not tied to any vocab/grammar item) — a plain notebook entry. Images share the same `noteImages` table via the `standalone:{id}` noteKey namespace (see src/db/noteImages.ts). */
export interface StandaloneNoteRecord {
  id?: number
  /** Client-generated at creation — this row's primary key in kotoba_standalone_notes (Phase C2). Same rationale as ReviewLogRecord.remoteId. */
  remoteId: string
  title: string
  text: string
  updatedAt: Date
}

/**
 * Cached AI-generated "今日短文" — one row per date+level, primary-keyed by
 * `dateLevel` (`${date}:${level}`) for direct lookup. Deliberately excluded
 * from backup export/import (src/db/backup.ts): this is regeneratable cache,
 * not precious user data.
 */
export interface DailyMaterialCacheRecord {
  dateLevel: string
  date: string
  level: JlptLevel
  paragraphs: FuriganaSegment[][]
  zh: string
  comprehensionPoints: string[]
  grammarNotes: GrammarNote[]
  regenerateCount: number
  createdAt: Date
}

/** The six tables that push to Supabase (Phase C3a) — noteImages/dailyMaterialCache are excluded (image sync is C4; cache is regeneratable). */
export type SyncTable = 'cards' | 'reviewLogs' | 'queuedItems' | 'notes' | 'standaloneNotes' | 'settings'

/**
 * Outbox entry: "this (table, key) needs an upsert or delete pushed to
 * Supabase." `key` is always the row's *remote* primary key shape (not
 * necessarily its local one) — see src/db/syncQueue.ts for the encoding per
 * table. Deliberately not a `dirty` flag per table: deletes need something to
 * survive the local row being gone, which a flag on the row itself can't do.
 */
export interface SyncQueueRecord {
  id?: number
  table: SyncTable
  key: string
  op: 'upsert' | 'delete'
}

export class KotobaDB extends Dexie {
  cards!: Table<CardRecord, [ItemType, string]>
  reviewLogs!: Table<ReviewLogRecord, number>
  settings!: Table<SettingRecord, string>
  queuedItems!: Table<QueuedItemRecord, [ItemType, string]>
  notes!: Table<NoteRecord, [ItemType, string]>
  noteImages!: Table<NoteImageRecord, number>
  standaloneNotes!: Table<StandaloneNoteRecord, number>
  dailyMaterialCache!: Table<DailyMaterialCacheRecord, string>
  syncQueue!: Table<SyncQueueRecord, number>

  constructor() {
    super('kotoba')
    this.version(1).stores({
      cards: '[itemType+itemId], due, state',
      reviewLogs: '++id, [itemType+itemId], review',
      settings: 'key',
    })
    this.version(2).stores({
      cards: '[itemType+itemId], due, state',
      reviewLogs: '++id, [itemType+itemId], review',
      settings: 'key',
      queuedItems: '[itemType+itemId], addedAt',
    })
    this.version(3)
      .stores({
        cards: '[itemType+itemId], due, state',
        reviewLogs: '++id, [itemType+itemId], review',
        settings: 'key',
        queuedItems: '[itemType+itemId], addedAt',
      })
      .upgrade(async (tx) => {
        await tx.table<CardRecord, [ItemType, string]>('cards').toCollection().modify({ suspended: false })
      })
    // Only adds new stores — existing tables' definitions are untouched, so
    // this never affects data already in cards/reviewLogs/settings/queuedItems.
    this.version(4).stores({
      cards: '[itemType+itemId], due, state',
      reviewLogs: '++id, [itemType+itemId], review',
      settings: 'key',
      queuedItems: '[itemType+itemId], addedAt',
      notes: '[itemType+itemId]',
      noteImages: '++id, noteKey',
    })
    // Again, only a new store — notes/noteImages/everything else untouched.
    this.version(5).stores({
      cards: '[itemType+itemId], due, state',
      reviewLogs: '++id, [itemType+itemId], review',
      settings: 'key',
      queuedItems: '[itemType+itemId], addedAt',
      notes: '[itemType+itemId]',
      noteImages: '++id, noteKey',
      standaloneNotes: '++id, updatedAt',
    })
    // Again, only a new store — nothing else is touched.
    this.version(6).stores({
      cards: '[itemType+itemId], due, state',
      reviewLogs: '++id, [itemType+itemId], review',
      settings: 'key',
      queuedItems: '[itemType+itemId], addedAt',
      notes: '[itemType+itemId]',
      noteImages: '++id, noteKey',
      standaloneNotes: '++id, updatedAt',
      dailyMaterialCache: 'dateLevel',
    })
    // Phase C3a: adds the sync outbox + remoteId on the two tables whose
    // local primary key is a per-device auto-increment integer (cards/
    // queuedItems/notes already have a stable composite key and need none).
    this.version(7)
      .stores({
        cards: '[itemType+itemId], due, state',
        reviewLogs: '++id, [itemType+itemId], review, remoteId',
        settings: 'key',
        queuedItems: '[itemType+itemId], addedAt',
        notes: '[itemType+itemId]',
        noteImages: '++id, noteKey',
        standaloneNotes: '++id, updatedAt, remoteId',
        dailyMaterialCache: 'dateLevel',
        syncQueue: '++id, table, key',
      })
      .upgrade(async (tx) => {
        // Backfill remoteId on pre-existing rows of the two uuid-keyed tables.
        await tx
          .table<ReviewLogRecord, number>('reviewLogs')
          .toCollection()
          .modify((row) => {
            row.remoteId = crypto.randomUUID()
          })
        await tx
          .table<StandaloneNoteRecord, number>('standaloneNotes')
          .toCollection()
          .modify((row) => {
            row.remoteId = crypto.randomUUID()
          })

        // Enqueue every existing row across all six syncable tables — without
        // this, only *future* writes would ever get queued, and pre-existing
        // local data from Phases 2–10 would never sync after login.
        const keyOfComposite = (row: { itemType: ItemType; itemId: string }) => `${row.itemType}:${row.itemId}`
        const enqueueAll = async (table: SyncTable, keyOf: (row: unknown) => string) => {
          const rows = await tx.table(table).toArray()
          const now = new Date()
          for (const row of rows) {
            // Untyped .table() call deliberately — this is historical
            // migration code writing the *v7-era* syncQueue row shape
            // (which included `queuedAt`, since removed in v8), not the
            // current SyncQueueRecord interface.
            await tx.table('syncQueue').add({ table, key: keyOf(row), op: 'upsert', queuedAt: now })
          }
        }
        await enqueueAll('cards', (row) => keyOfComposite(row as { itemType: ItemType; itemId: string }))
        await enqueueAll('reviewLogs', (row) => (row as ReviewLogRecord).remoteId)
        await enqueueAll('queuedItems', (row) => keyOfComposite(row as { itemType: ItemType; itemId: string }))
        await enqueueAll('notes', (row) => keyOfComposite(row as { itemType: ItemType; itemId: string }))
        await enqueueAll('standaloneNotes', (row) => (row as StandaloneNoteRecord).remoteId)
        await enqueueAll('settings', (row) => (row as SettingRecord).key)
      })
    // Phase C3b: cards/settings need their own persisted "last modified"
    // timestamp so pull can compare it against kotoba_*.updated_at — push
    // previously derived that value from the sync queue's own transient
    // queuedAt, which never survived past a successful push, leaving pull
    // with nothing to compare against. Backfilled to "now": existing local
    // data should win against any older cloud state after this upgrade,
    // not be silently overwritten by a stale pull.
    this.version(8)
      .stores({
        cards: '[itemType+itemId], due, state',
        reviewLogs: '++id, [itemType+itemId], review, remoteId',
        settings: 'key',
        queuedItems: '[itemType+itemId], addedAt',
        notes: '[itemType+itemId]',
        noteImages: '++id, noteKey',
        standaloneNotes: '++id, updatedAt, remoteId',
        dailyMaterialCache: 'dateLevel',
        syncQueue: '++id, table, key',
      })
      .upgrade(async (tx) => {
        const now = new Date()
        await tx
          .table<CardRecord, [ItemType, string]>('cards')
          .toCollection()
          .modify((row) => {
            row.updatedAt = now
          })
        await tx
          .table<SettingRecord, string>('settings')
          .toCollection()
          .modify((row) => {
            row.updatedAt = now
          })
      })
    // Phase C4a: noteImages needs its own remoteId for the same reason
    // reviewLogs/standaloneNotes did in C3a — the local auto-increment id
    // is per-device and would collide across devices if used as a Storage
    // path. storagePath is deliberately left unset here (not backfilled):
    // every pre-existing image becomes "pending upload", which is exactly
    // right — none of them have ever been uploaded before this phase.
    this.version(9)
      .stores({
        cards: '[itemType+itemId], due, state',
        reviewLogs: '++id, [itemType+itemId], review, remoteId',
        settings: 'key',
        queuedItems: '[itemType+itemId], addedAt',
        notes: '[itemType+itemId]',
        noteImages: '++id, noteKey',
        standaloneNotes: '++id, updatedAt, remoteId',
        dailyMaterialCache: 'dateLevel',
        syncQueue: '++id, table, key',
      })
      .upgrade(async (tx) => {
        await tx
          .table<NoteImageRecord, number>('noteImages')
          .toCollection()
          .modify((row) => {
            row.remoteId = crypto.randomUUID()
          })
      })
    // Phase C4b: download needs to look up a noteImages row by remoteId
    // (global dedup — has this image already been fetched, regardless of
    // which note it's filed under) without scanning every row. No .upgrade()
    // needed: the field already exists on every row since v9's backfill,
    // Dexie just builds the index over existing data on this version bump.
    this.version(10).stores({
      cards: '[itemType+itemId], due, state',
      reviewLogs: '++id, [itemType+itemId], review, remoteId',
      settings: 'key',
      queuedItems: '[itemType+itemId], addedAt',
      notes: '[itemType+itemId]',
      noteImages: '++id, noteKey, remoteId',
      standaloneNotes: '++id, updatedAt, remoteId',
      dailyMaterialCache: 'dateLevel',
      syncQueue: '++id, table, key',
    })
  }
}

export const db = new KotobaDB()

// Mirrors the highest `.version(N)` above — bump alongside any future schema
// migration. Written into backup exports (src/db/backup.ts) as an FYI for
// the import confirmation screen; import validates the *current* row shape
// via zod rather than branching on this number.
export const DB_SCHEMA_VERSION = 10

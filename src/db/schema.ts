import Dexie, { type Table } from 'dexie'
import type { FuriganaSegment, JlptLevel } from '../shared/contentTypes.ts'

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
}

/** Mirrors ts-fsrs's `ReviewLog` shape, one row per grading event. */
export interface ReviewLogRecord {
  id?: number
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
}

/** A standalone note (not tied to any vocab/grammar item) — a plain notebook entry. Images share the same `noteImages` table via the `standalone:{id}` noteKey namespace (see src/db/noteImages.ts). */
export interface StandaloneNoteRecord {
  id?: number
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
  regenerateCount: number
  createdAt: Date
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
  }
}

export const db = new KotobaDB()

// Mirrors the highest `.version(N)` above — bump alongside any future schema
// migration. Written into backup exports (src/db/backup.ts) as an FYI for
// the import confirmation screen; import validates the *current* row shape
// via zod rather than branching on this number.
export const DB_SCHEMA_VERSION = 6

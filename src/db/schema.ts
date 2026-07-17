import Dexie, { type Table } from 'dexie'
import type { JlptLevel } from '../shared/contentTypes.ts'

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

export class KotobaDB extends Dexie {
  cards!: Table<CardRecord, [ItemType, string]>
  reviewLogs!: Table<ReviewLogRecord, number>
  settings!: Table<SettingRecord, string>

  constructor() {
    super('kotoba')
    this.version(1).stores({
      cards: '[itemType+itemId], due, state',
      reviewLogs: '++id, [itemType+itemId], review',
      settings: 'key',
    })
  }
}

export const db = new KotobaDB()

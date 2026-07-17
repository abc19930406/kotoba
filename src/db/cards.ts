import { fsrs, createEmptyCard, State, type Card as FsrsCard, type Grade } from 'ts-fsrs'
import { db, type CardRecord, type ItemType } from './schema.ts'
import type { JlptLevel } from '../shared/contentTypes.ts'

const scheduler = fsrs()

const DAILY_NEW_CARD_LIMIT_KEY = 'dailyNewCardLimit'
export const DEFAULT_DAILY_NEW_CARD_LIMIT = 10

function toFsrsCard(record: CardRecord): FsrsCard {
  return {
    due: record.due,
    stability: record.stability,
    difficulty: record.difficulty,
    elapsed_days: record.elapsed_days,
    scheduled_days: record.scheduled_days,
    learning_steps: record.learning_steps,
    reps: record.reps,
    lapses: record.lapses,
    state: record.state,
    last_review: record.last_review,
  }
}

export async function getCard(itemType: ItemType, itemId: string): Promise<CardRecord | undefined> {
  return db.cards.get([itemType, itemId])
}

export async function cardExists(itemType: ItemType, itemId: string): Promise<boolean> {
  return (await getCard(itemType, itemId)) !== undefined
}

export async function listDueCards(now: Date = new Date()): Promise<CardRecord[]> {
  return db.cards.where('due').belowOrEqual(now).toArray()
}

export async function countDueCards(now: Date = new Date()): Promise<number> {
  return db.cards.where('due').belowOrEqual(now).count()
}

export async function listExistingItemIds(itemType: ItemType): Promise<Set<string>> {
  const rows = await db.cards.where('itemType').equals(itemType).toArray()
  return new Set(rows.map((r) => r.itemId))
}

function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function endOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d
}

/**
 * Counts cards reviewed for the first time today. `ReviewLog.state` records
 * the state the card was in *before* this review, so `state === New`
 * uniquely identifies a card's first-ever review (confirmed empirically —
 * ts-fsrs never logs State.New on a second review of the same card).
 */
export async function countNewCardsIntroducedToday(now: Date = new Date()): Promise<number> {
  const start = startOfDay(now)
  const end = endOfDay(now)
  const logsToday = await db.reviewLogs.where('review').between(start, end, true, true).toArray()
  return logsToday.filter((log) => log.state === State.New).length
}

export async function getDailyNewCardLimit(): Promise<number> {
  const setting = await db.settings.get(DAILY_NEW_CARD_LIMIT_KEY)
  return setting?.value ?? DEFAULT_DAILY_NEW_CARD_LIMIT
}

export async function setDailyNewCardLimit(value: number): Promise<void> {
  await db.settings.put({ key: DAILY_NEW_CARD_LIMIT_KEY, value })
}

/**
 * Grades an item via ts-fsrs and persists both the updated card and the
 * review log in one transaction. Never reimplements scheduling — `next()`
 * from ts-fsrs is the sole source of the resulting due/stability/etc.
 */
export async function gradeItem(
  itemType: ItemType,
  itemId: string,
  level: JlptLevel,
  grade: Grade,
  now: Date = new Date(),
): Promise<CardRecord> {
  const existing = await getCard(itemType, itemId)
  const currentFsrsCard = existing ? toFsrsCard(existing) : createEmptyCard(now)
  const { card: nextCard, log } = scheduler.next(currentFsrsCard, now, grade)

  const record: CardRecord = {
    itemId,
    itemType,
    level,
    due: nextCard.due,
    stability: nextCard.stability,
    difficulty: nextCard.difficulty,
    elapsed_days: nextCard.elapsed_days,
    scheduled_days: nextCard.scheduled_days,
    learning_steps: nextCard.learning_steps,
    reps: nextCard.reps,
    lapses: nextCard.lapses,
    state: nextCard.state,
    last_review: nextCard.last_review,
  }

  await db.transaction('rw', db.cards, db.reviewLogs, async () => {
    await db.cards.put(record)
    await db.reviewLogs.add({
      itemId,
      itemType,
      rating: log.rating,
      state: log.state,
      due: log.due,
      stability: log.stability,
      difficulty: log.difficulty,
      scheduled_days: log.scheduled_days,
      learning_steps: log.learning_steps,
      review: log.review,
    })
  })

  return record
}

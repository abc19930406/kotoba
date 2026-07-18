import { fsrs, createEmptyCard, State, type Card as FsrsCard, type Grade } from 'ts-fsrs'
import { db, type CardRecord, type ItemType, type QueuedItemRecord } from './schema.ts'
import { LEVEL_ORDER, LEVEL_TO_DIFFICULTY, type JlptLevel } from '../shared/contentTypes.ts'

const scheduler = fsrs()

const DAILY_NEW_CARD_LIMIT_KEY = 'dailyNewCardLimit'
export const DEFAULT_DAILY_NEW_CARD_LIMIT = 10

const CURRENT_LEVEL_KEY = 'currentLevel'
export const DEFAULT_CURRENT_LEVEL: JlptLevel = 'N5'

const SHOW_FURIGANA_KEY = 'showFurigana'
export const DEFAULT_SHOW_FURIGANA = true

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

/** Due cards, excluding suspended ("已熟悉") ones. */
export async function listDueCards(now: Date = new Date()): Promise<CardRecord[]> {
  const cards = await db.cards.where('due').belowOrEqual(now).toArray()
  return cards.filter((c) => !c.suspended)
}

export async function countDueCards(now: Date = new Date()): Promise<number> {
  return (await listDueCards(now)).length
}

export async function listExistingItemIds(itemType: ItemType): Promise<Set<string>> {
  const rows = await db.cards.where('itemType').equals(itemType).toArray()
  return new Set(rows.map((r) => r.itemId))
}

/** True if the item already has review progress or is queued awaiting its first review. */
export async function isInReviewQueueOrCards(itemType: ItemType, itemId: string): Promise<boolean> {
  const [card, queued] = await Promise.all([
    db.cards.get([itemType, itemId]),
    db.queuedItems.get([itemType, itemId]),
  ])
  return card !== undefined || queued !== undefined
}

/** Registers interest in an item ("加入複習") without granting it a review yet. No-op if already added. */
export async function addToReviewQueue(
  itemType: ItemType,
  itemId: string,
  level: JlptLevel,
  now: Date = new Date(),
): Promise<void> {
  if (await isInReviewQueueOrCards(itemType, itemId)) return
  await db.queuedItems.put({ itemType, itemId, level, addedAt: now })
}

/** Manually-queued candidates awaiting their first review, oldest first, up to `limit`. */
export async function listQueuedCandidates(limit: number): Promise<QueuedItemRecord[]> {
  if (limit <= 0) return []
  return db.queuedItems.orderBy('addedAt').limit(limit).toArray()
}

/** Total manually-queued items awaiting their first review, regardless of today's new-card quota. */
export async function countQueuedItems(): Promise<number> {
  return db.queuedItems.count()
}

/** itemIds that already have review progress or are queued, for a given itemType (cards ∪ queuedItems). */
export async function listAddedItemIds(itemType: ItemType): Promise<Set<string>> {
  const [cards, queued] = await Promise.all([
    db.cards.where('itemType').equals(itemType).toArray(),
    db.queuedItems.where('itemType').equals(itemType).toArray(),
  ])
  return new Set([...cards.map((c) => c.itemId), ...queued.map((q) => q.itemId)])
}

export type ItemStatus = 'queued' | 'active' | 'suspended'

/**
 * Per-item progress status for a given itemType, for the browse page's
 * three-state display (未加入 = absent from the map / 已加入複習 = 'queued'
 * or 'active' / 已熟悉 = 'suspended').
 */
export async function getItemStatuses(itemType: ItemType): Promise<Map<string, ItemStatus>> {
  const [cards, queued] = await Promise.all([
    db.cards.where('itemType').equals(itemType).toArray(),
    db.queuedItems.where('itemType').equals(itemType).toArray(),
  ])
  const statuses = new Map<string, ItemStatus>()
  for (const c of cards) statuses.set(c.itemId, c.suspended ? 'suspended' : 'active')
  for (const q of queued) if (!statuses.has(q.itemId)) statuses.set(q.itemId, 'queued')
  return statuses
}

/**
 * Marks an item "已熟悉" — excluded from due/new queues from now on. If it
 * already has a card, its FSRS schedule and review history are left
 * untouched so resuming continues exactly where it left off. If it doesn't
 * yet (e.g. suspended straight out of the review flow before ever being
 * graded — a "new" queue item is never granted a review just by suspending
 * it), a fresh un-scheduled card is created so it's still tracked and
 * excluded going forward, without writing a reviewLog entry.
 */
export async function suspendCard(itemType: ItemType, itemId: string, level: JlptLevel, now: Date = new Date()): Promise<void> {
  await db.transaction('rw', db.cards, db.queuedItems, async () => {
    const existing = await getCard(itemType, itemId)
    if (existing) {
      await db.cards.update([itemType, itemId], { suspended: true })
      return
    }
    const empty = createEmptyCard(now)
    await db.cards.put({
      itemId,
      itemType,
      level,
      due: empty.due,
      stability: empty.stability,
      difficulty: empty.difficulty,
      elapsed_days: empty.elapsed_days,
      scheduled_days: empty.scheduled_days,
      learning_steps: empty.learning_steps,
      reps: empty.reps,
      lapses: empty.lapses,
      state: empty.state,
      last_review: empty.last_review,
      suspended: true,
    })
    // Was queued but never reviewed — it now has a real card row instead.
    await db.queuedItems.delete([itemType, itemId])
  })
}

/** Reverses suspendCard — the card resumes its existing schedule, not a fresh one. */
export async function resumeCard(itemType: ItemType, itemId: string): Promise<void> {
  await db.cards.update([itemType, itemId], { suspended: false })
}

/** All suspended cards ("已熟悉清單"), across both item types. */
export async function listSuspendedCards(): Promise<CardRecord[]> {
  const cards = await db.cards.toArray()
  return cards.filter((c) => c.suspended)
}

export async function countSuspendedCards(): Promise<number> {
  return (await listSuspendedCards()).length
}

/**
 * Registers interest in many items at once ("批次加入"), skipping any that
 * already have progress or are queued. Returns how many were actually added.
 */
export async function addManyToReviewQueue(
  items: Array<{ itemType: ItemType; itemId: string; level: JlptLevel }>,
  now: Date = new Date(),
): Promise<number> {
  let added = 0
  await db.transaction('rw', db.cards, db.queuedItems, async () => {
    for (const item of items) {
      const alreadyAdded = await isInReviewQueueOrCards(item.itemType, item.itemId)
      if (alreadyAdded) continue
      await db.queuedItems.put({ itemType: item.itemType, itemId: item.itemId, level: item.level, addedAt: now })
      added++
    }
  })
  return added
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
 * The user's current main study level — used to sort grammar example
 * sentences by closeness to it. Stored as its numeric difficulty (N5=1..N1=5)
 * so it fits the existing `settings` table's `value: number` shape.
 */
export async function getCurrentLevel(): Promise<JlptLevel> {
  const setting = await db.settings.get(CURRENT_LEVEL_KEY)
  const difficulty = setting?.value ?? LEVEL_TO_DIFFICULTY[DEFAULT_CURRENT_LEVEL]
  return LEVEL_ORDER[difficulty - 1] ?? DEFAULT_CURRENT_LEVEL
}

export async function setCurrentLevel(level: JlptLevel): Promise<void> {
  await db.settings.put({ key: CURRENT_LEVEL_KEY, value: LEVEL_TO_DIFFICULTY[level] })
}

/** Global "例句顯示假名注音" toggle, default on. Encoded as 1/0 to fit the `settings` table's `value: number` shape. */
export async function getShowFurigana(): Promise<boolean> {
  const setting = await db.settings.get(SHOW_FURIGANA_KEY)
  return setting === undefined ? DEFAULT_SHOW_FURIGANA : setting.value === 1
}

export async function setShowFurigana(value: boolean): Promise<void> {
  await db.settings.put({ key: SHOW_FURIGANA_KEY, value: value ? 1 : 0 })
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
    suspended: existing?.suspended ?? false,
  }

  await db.transaction('rw', db.cards, db.reviewLogs, db.queuedItems, async () => {
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
    // No-op if it was never queued (e.g. auto-sourced from the N5 pool).
    await db.queuedItems.delete([itemType, itemId])
  })

  return record
}

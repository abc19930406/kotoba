import {
  listDueCards,
  countDueCards,
  listExistingItemIds,
  getDailyNewCardLimit,
  countNewCardsIntroducedToday,
  listQueuedCandidates,
  countQueuedItems,
  countSuspendedCards,
} from '../../db/cards.ts'
import { loadVocabLevel } from '../../shared/contentLoader.ts'
import type { ItemType } from '../../db/schema.ts'
import type { JlptLevel } from '../../shared/contentTypes.ts'

export interface QueueItem {
  itemType: ItemType
  itemId: string
  level: JlptLevel
  isNew: boolean
}

/** Fallback new-card source (any level, not just N5) once the manually-queued pool runs dry. */
const AUTO_NEW_CARD_SOURCE_LEVEL: JlptLevel = 'N5'

export async function getRemainingNewCardSlots(now: Date = new Date()): Promise<number> {
  const dailyLimit = await getDailyNewCardLimit()
  const introducedToday = await countNewCardsIntroducedToday(now)
  return Math.max(0, dailyLimit - introducedToday)
}

/**
 * New-card candidates, capped at `limit`: manually-queued items first
 * (oldest "加入複習" first, any level — this is what Phase 3's browse page
 * feeds), then the N5 auto-pool fills any remaining slots so the app still
 * has new cards to offer before the user has curated anything.
 */
export async function getNewCardCandidates(limit: number): Promise<QueueItem[]> {
  if (limit <= 0) return []

  const queued = await listQueuedCandidates(limit)
  const candidates: QueueItem[] = queued.map((q) => ({
    itemType: q.itemType,
    itemId: q.itemId,
    level: q.level,
    isNew: true,
  }))
  if (candidates.length >= limit) return candidates

  const queuedIds = new Set(queued.filter((q) => q.itemType === 'vocab').map((q) => q.itemId))
  const [allVocab, existingIds] = await Promise.all([
    loadVocabLevel(AUTO_NEW_CARD_SOURCE_LEVEL),
    listExistingItemIds('vocab'),
  ])
  for (const entry of allVocab) {
    if (existingIds.has(entry.id) || queuedIds.has(entry.id)) continue
    candidates.push({ itemType: 'vocab', itemId: entry.id, level: entry.level, isNew: true })
    if (candidates.length >= limit) break
  }
  return candidates
}

/**
 * Builds today's review queue: due cards first (earliest due first), then
 * new cards up to the remaining daily slot count. Deduplicates by
 * itemType+itemId as a safety net — the same id must never appear twice,
 * whether because it's simultaneously "due" and "new" (shouldn't happen by
 * construction) or because of a caller bug.
 */
export async function buildReviewQueue(now: Date = new Date()): Promise<QueueItem[]> {
  const dueCards = await listDueCards(now)
  const dueQueueItems: QueueItem[] = dueCards
    .slice()
    .sort((a, b) => a.due.getTime() - b.due.getTime())
    .map((c) => ({ itemType: c.itemType, itemId: c.itemId, level: c.level, isNew: false }))

  const remainingNewSlots = await getRemainingNewCardSlots(now)
  const newQueueItems = await getNewCardCandidates(remainingNewSlots)

  const seen = new Set<string>()
  const merged: QueueItem[] = []
  for (const item of [...dueQueueItems, ...newQueueItems]) {
    const key = `${item.itemType}:${item.itemId}`
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(item)
  }
  return merged
}

export interface HomeReviewStats {
  dueCount: number
  /** New cards actually offered today, capped at the remaining daily quota. */
  newCount: number
  /** Everything sitting in the manually-queued pool, regardless of today's quota. */
  queuedCount: number
  remainingNewSlots: number
  /** Queued items exist but today's quota is used up — the queue isn't empty, it's just blocked until tomorrow (or a higher limit). */
  budgetExhausted: boolean
  /** Cards marked "已熟悉" — excluded from the queue but not deleted. */
  suspendedCount: number
}

export async function getHomeReviewStats(now: Date = new Date()): Promise<HomeReviewStats> {
  const [dueCount, remainingNewSlots, queuedCount, suspendedCount] = await Promise.all([
    countDueCards(now),
    getRemainingNewCardSlots(now),
    countQueuedItems(),
    countSuspendedCards(),
  ])
  const newCount = (await getNewCardCandidates(remainingNewSlots)).length
  return {
    dueCount,
    newCount,
    queuedCount,
    remainingNewSlots,
    budgetExhausted: remainingNewSlots <= 0 && queuedCount > 0,
    suspendedCount,
  }
}

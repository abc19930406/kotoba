import { listDueCards, listExistingItemIds, getDailyNewCardLimit, countNewCardsIntroducedToday } from '../../db/cards.ts'
import { loadVocabLevel } from '../../shared/contentLoader.ts'
import type { ItemType } from '../../db/schema.ts'
import type { JlptLevel } from '../../shared/contentTypes.ts'

export interface QueueItem {
  itemType: ItemType
  itemId: string
  level: JlptLevel
  isNew: boolean
}

/** New cards are sourced from N5 vocab until Phase 3 adds manual add-to-review. */
const NEW_CARD_SOURCE_LEVEL: JlptLevel = 'N5'

export async function getRemainingNewCardSlots(now: Date = new Date()): Promise<number> {
  const dailyLimit = await getDailyNewCardLimit()
  const introducedToday = await countNewCardsIntroducedToday(now)
  return Math.max(0, dailyLimit - introducedToday)
}

/** Vocab entries from the new-card source level not yet in the cards table, capped at `limit`. */
export async function getNewCardCandidates(limit: number): Promise<QueueItem[]> {
  if (limit <= 0) return []
  const [allVocab, existingIds] = await Promise.all([
    loadVocabLevel(NEW_CARD_SOURCE_LEVEL),
    listExistingItemIds('vocab'),
  ])
  const candidates: QueueItem[] = []
  for (const entry of allVocab) {
    if (existingIds.has(entry.id)) continue
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

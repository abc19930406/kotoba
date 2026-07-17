import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Rating } from 'ts-fsrs'
import { db } from '../../db/schema.ts'
import { gradeItem, setDailyNewCardLimit } from '../../db/cards.ts'
import type { VocabEntry } from '../../shared/contentTypes.ts'

const mockN5Vocab: VocabEntry[] = Array.from({ length: 15 }, (_, i) => ({
  id: `n5-${i}`,
  level: 'N5',
  kanji: `字${i}`,
  kana: `かな${i}`,
  usageNote: null,
  partOfSpeech: [],
  meaningEn: [`meaning ${i}`],
  meaningZh: null,
  sentences: [],
}))

vi.mock('../../shared/contentLoader.ts', () => ({
  loadVocabLevel: vi.fn(async () => mockN5Vocab),
}))

const { buildReviewQueue, getNewCardCandidates } = await import('./queue.ts')

beforeEach(async () => {
  await db.cards.clear()
  await db.reviewLogs.clear()
  await db.settings.clear()
})

describe('buildReviewQueue', () => {
  it('orders due cards before new cards, earliest-due first', async () => {
    const yesterday = new Date('2026-01-05T10:00:00Z')
    const now = new Date('2026-01-06T12:00:00Z')
    // Two already-known cards, first introduced yesterday (so they don't
    // themselves count against today's new-card budget) and reviewed again
    // today with "Again", landing them due a minute later — before `now`.
    await gradeItem('vocab', 'n5-0', 'N5', Rating.Good, yesterday)
    await gradeItem('vocab', 'n5-0', 'N5', Rating.Again, new Date('2026-01-06T11:00:00Z')) // due ~11:01
    await gradeItem('vocab', 'n5-1', 'N5', Rating.Good, yesterday)
    await gradeItem('vocab', 'n5-1', 'N5', Rating.Again, new Date('2026-01-06T10:00:00Z')) // due ~10:01, earlier still

    await setDailyNewCardLimit(3)
    const queue = await buildReviewQueue(now)

    const dueItems = queue.filter((q) => !q.isNew)
    const newItems = queue.filter((q) => q.isNew)

    expect(dueItems.map((q) => q.itemId)).toEqual(['n5-1', 'n5-0']) // earliest due first
    expect(queue.slice(0, dueItems.length)).toEqual(dueItems) // due cards come before new cards
    expect(newItems).toHaveLength(3) // capped at daily limit
    // New cards exclude the two already-carded items even though they're in the source pool.
    expect(newItems.some((q) => q.itemId === 'n5-0' || q.itemId === 'n5-1')).toBe(false)
  })

  it('caps new cards at the remaining daily slots, accounting for cards already introduced today', async () => {
    const now = new Date('2026-01-06T12:00:00Z')
    await setDailyNewCardLimit(5)
    // Introduce 3 new cards a few minutes earlier the same day.
    await gradeItem('vocab', 'n5-0', 'N5', Rating.Good, new Date('2026-01-06T11:57:00Z'))
    await gradeItem('vocab', 'n5-1', 'N5', Rating.Good, new Date('2026-01-06T11:58:00Z'))
    await gradeItem('vocab', 'n5-2', 'N5', Rating.Good, new Date('2026-01-06T11:59:00Z'))

    const queue = await buildReviewQueue(now)
    const newItems = queue.filter((q) => q.isNew)

    expect(newItems).toHaveLength(2) // 5 - 3 already introduced
  })

  it('never contains the same itemId twice, even if the same id could appear in both due and new pools', async () => {
    const now = new Date('2026-01-06T12:00:00Z')
    await gradeItem('vocab', 'n5-0', 'N5', Rating.Again, new Date('2026-01-06T11:00:00Z'))
    await setDailyNewCardLimit(10)

    const queue = await buildReviewQueue(now)
    const keys = queue.map((q) => `${q.itemType}:${q.itemId}`)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('getNewCardCandidates', () => {
  it('excludes items that already have a card, regardless of source pool order', async () => {
    await gradeItem('vocab', 'n5-3', 'N5', Rating.Good, new Date('2026-01-01T00:00:00Z'))
    const candidates = await getNewCardCandidates(20)
    expect(candidates.some((c) => c.itemId === 'n5-3')).toBe(false)
  })

  it('returns an empty list when the limit is 0', async () => {
    expect(await getNewCardCandidates(0)).toEqual([])
  })
})

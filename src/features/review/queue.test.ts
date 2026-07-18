import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Rating } from 'ts-fsrs'
import { db } from '../../db/schema.ts'
import { gradeItem, setDailyNewCardLimit, addToReviewQueue } from '../../db/cards.ts'
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

const { buildReviewQueue, getNewCardCandidates, getRemainingNewCardSlots, getHomeReviewStats } = await import(
  './queue.ts'
)

beforeEach(async () => {
  await db.cards.clear()
  await db.reviewLogs.clear()
  await db.settings.clear()
  await db.queuedItems.clear()
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

  it('sources manually-queued items (any level, oldest first) before falling back to the N5 auto-pool', async () => {
    // A non-N5 word manually added via "加入複習" on the browse page.
    await addToReviewQueue('vocab', 'n3-manual-1', 'N3', new Date('2026-01-01T00:00:00Z'))
    await addToReviewQueue('vocab', 'n3-manual-2', 'N3', new Date('2026-01-01T00:01:00Z'))

    const candidates = await getNewCardCandidates(3)

    expect(candidates[0]).toMatchObject({ itemId: 'n3-manual-1', level: 'N3', isNew: true })
    expect(candidates[1]).toMatchObject({ itemId: 'n3-manual-2', level: 'N3', isNew: true })
    // Third slot backfilled from the N5 auto-pool.
    expect(candidates[2]).toMatchObject({ itemType: 'vocab', level: 'N5', isNew: true })
  })

  it('does not double-count an N5 word that was both manually queued and present in the auto-pool', async () => {
    await addToReviewQueue('vocab', 'n5-0', 'N5', new Date('2026-01-01T00:00:00Z'))

    const candidates = await getNewCardCandidates(20)
    const occurrences = candidates.filter((c) => c.itemId === 'n5-0').length
    expect(occurrences).toBe(1)
  })

  it('ROOT CAUSE REPRO: a manually-queued item is invisible once today\'s new-card quota is exhausted', async () => {
    const today = new Date('2026-01-06T09:00:00Z')
    await setDailyNewCardLimit(10)
    // Exhaust today's default quota of 10 with 10 distinct first-time reviews.
    for (let i = 0; i < 10; i++) {
      await gradeItem('vocab', `quota-filler-${i}`, 'N5', Rating.Good, new Date(today.getTime() + i * 1000))
    }
    // User then manually adds an 11th word from the browse page.
    await addToReviewQueue('vocab', 'manually-added-11th', 'N3', today)

    const candidates = await getNewCardCandidates(await getRemainingNewCardSlots(today))
    // Confirms the hypothesis: the queued item exists but never surfaces because
    // getRemainingNewCardSlots() is 0, and getNewCardCandidates(0) short-circuits
    // to [] before ever consulting queuedItems.
    expect(candidates).toEqual([])
  })
})

describe('getHomeReviewStats', () => {
  it('reports queuedCount honestly and flags budgetExhausted when quota is used up but items are waiting', async () => {
    const today = new Date('2026-01-06T09:00:00Z')
    await setDailyNewCardLimit(10)
    for (let i = 0; i < 10; i++) {
      await gradeItem('vocab', `quota-filler-${i}`, 'N5', Rating.Good, new Date(today.getTime() + i * 1000))
    }
    await addToReviewQueue('vocab', 'manually-added-11th', 'N3', today)

    const stats = await getHomeReviewStats(today)

    expect(stats.queuedCount).toBe(1) // still visible, unlike newCount
    expect(stats.newCount).toBe(0) // quota gate unchanged — still 0 offered today
    expect(stats.remainingNewSlots).toBe(0)
    expect(stats.budgetExhausted).toBe(true)
  })

  it('is not exhausted when slots remain, even with items queued', async () => {
    const today = new Date('2026-01-06T09:00:00Z')
    await setDailyNewCardLimit(10)
    await addToReviewQueue('vocab', 'manually-added-1', 'N3', today)

    const stats = await getHomeReviewStats(today)

    expect(stats.queuedCount).toBe(1)
    expect(stats.newCount).toBe(10) // the queued item plus N5 auto-pool backfill, since quota is available
    expect(stats.remainingNewSlots).toBe(10)
    expect(stats.budgetExhausted).toBe(false)
  })

  it('is not exhausted when the queue is empty, even if quota happens to be used up', async () => {
    const today = new Date('2026-01-06T09:00:00Z')
    await setDailyNewCardLimit(10)
    for (let i = 0; i < 10; i++) {
      await gradeItem('vocab', `quota-filler-${i}`, 'N5', Rating.Good, new Date(today.getTime() + i * 1000))
    }

    const stats = await getHomeReviewStats(today)

    expect(stats.queuedCount).toBe(0)
    expect(stats.budgetExhausted).toBe(false) // nothing waiting, so no "額度用完" message needed
  })
})

describe('buildReviewQueue — mixed vocab + grammar (Phase 4)', () => {
  it('mixes due vocab and grammar cards together, sorted by due date regardless of itemType', async () => {
    const now = new Date('2026-01-06T12:00:00Z')
    const yesterday = new Date('2026-01-05T10:00:00Z')
    await gradeItem('grammar', 'g-earlier', 'N4', Rating.Good, yesterday)
    await gradeItem('grammar', 'g-earlier', 'N4', Rating.Again, new Date('2026-01-06T10:00:00Z')) // due ~10:01
    await gradeItem('vocab', 'v-later', 'N5', Rating.Good, yesterday)
    await gradeItem('vocab', 'v-later', 'N5', Rating.Again, new Date('2026-01-06T11:00:00Z')) // due ~11:01

    await setDailyNewCardLimit(0) // isolate this assertion to the due cards only
    const queue = await buildReviewQueue(now)

    expect(queue.map((q) => `${q.itemType}:${q.itemId}`)).toEqual(['grammar:g-earlier', 'vocab:v-later'])
  })

  it('lets manually-queued vocab and grammar items compete for the same new-card slots, oldest first', async () => {
    await addToReviewQueue('grammar', 'g-manual', 'N3', new Date('2026-01-01T00:00:00Z'))
    await addToReviewQueue('vocab', 'v-manual', 'N3', new Date('2026-01-01T00:01:00Z'))

    const candidates = await getNewCardCandidates(2)

    expect(candidates.map((c) => `${c.itemType}:${c.itemId}`)).toEqual(['grammar:g-manual', 'vocab:v-manual'])
  })
})

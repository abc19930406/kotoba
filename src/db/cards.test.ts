import { beforeEach, describe, expect, it } from 'vitest'
import { Rating, State } from 'ts-fsrs'
import { db } from './schema.ts'
import {
  gradeItem,
  getCard,
  cardExists,
  listDueCards,
  countDueCards,
  addToReviewQueue,
  addManyToReviewQueue,
  isInReviewQueueOrCards,
  listQueuedCandidates,
  listAddedItemIds,
} from './cards.ts'

beforeEach(async () => {
  await db.cards.clear()
  await db.reviewLogs.clear()
  await db.settings.clear()
  await db.queuedItems.clear()
})

describe('gradeItem', () => {
  it('creates a new card in Learning state with due in the future after the first Good rating', async () => {
    const now = new Date('2026-01-01T00:00:00Z')
    const record = await gradeItem('vocab', 'v1', 'N5', Rating.Good, now)

    expect(record.state).toBe(State.Learning)
    expect(record.due.getTime()).toBeGreaterThan(now.getTime())
  })

  it('advances the due date further on a second Good rating (schedule moves forward)', async () => {
    const now = new Date('2026-01-01T00:00:00Z')
    const first = await gradeItem('vocab', 'v1', 'N5', Rating.Good, now)

    const second = await gradeItem('vocab', 'v1', 'N5', Rating.Good, first.due)

    expect(second.state).toBe(State.Review)
    expect(second.due.getTime()).toBeGreaterThan(first.due.getTime())
  })

  it('persists the card in IndexedDB and updates the same row on re-grading (no duplicate rows)', async () => {
    const now = new Date('2026-01-01T00:00:00Z')
    await gradeItem('vocab', 'v1', 'N5', Rating.Good, now)
    expect(await cardExists('vocab', 'v1')).toBe(true)

    const stored = await getCard('vocab', 'v1')
    expect(stored?.itemId).toBe('v1')
    expect(stored?.itemType).toBe('vocab')
    expect(stored?.level).toBe('N5')

    await gradeItem('vocab', 'v1', 'N5', Rating.Good, stored!.due)

    const rowCount = await db.cards.where('[itemType+itemId]').equals(['vocab', 'v1']).count()
    expect(rowCount).toBe(1)
  })

  it('writes a review log entry per grading event', async () => {
    const now = new Date('2026-01-01T00:00:00Z')
    await gradeItem('vocab', 'v1', 'N5', Rating.Good, now)
    await gradeItem('vocab', 'v1', 'N5', Rating.Good, new Date('2026-01-01T00:10:00Z'))

    const logs = await db.reviewLogs.where('[itemType+itemId]').equals(['vocab', 'v1']).toArray()
    expect(logs).toHaveLength(2)
    expect(logs[0].state).toBe(State.New)
    expect(logs[1].state).toBe(State.Learning)
  })
})

describe('addToReviewQueue ("加入複習" from the browse page)', () => {
  it('registers an item without granting it a review (no card row, no review log)', async () => {
    await addToReviewQueue('vocab', 'v1', 'N5')

    expect(await cardExists('vocab', 'v1')).toBe(false)
    expect(await isInReviewQueueOrCards('vocab', 'v1')).toBe(true)
    const queued = await listQueuedCandidates(10)
    expect(queued.map((q) => q.itemId)).toEqual(['v1'])
  })

  it('is a no-op when the item is already queued or already has a card', async () => {
    await addToReviewQueue('vocab', 'v1', 'N5', new Date('2026-01-01T00:00:00Z'))
    await addToReviewQueue('vocab', 'v1', 'N5', new Date('2026-01-01T01:00:00Z'))
    expect(await listQueuedCandidates(10)).toHaveLength(1)

    await gradeItem('vocab', 'v2', 'N5', Rating.Good, new Date('2026-01-01T00:00:00Z'))
    await addToReviewQueue('vocab', 'v2', 'N5')
    expect(await listQueuedCandidates(10)).toHaveLength(1) // still just v1 — v2 already has a card
  })

  it('is removed from the queue the moment the item gets its first real review', async () => {
    await addToReviewQueue('vocab', 'v1', 'N5', new Date('2026-01-01T00:00:00Z'))
    expect(await listQueuedCandidates(10)).toHaveLength(1)

    await gradeItem('vocab', 'v1', 'N5', Rating.Good, new Date('2026-01-02T00:00:00Z'))

    expect(await listQueuedCandidates(10)).toHaveLength(0)
    expect(await cardExists('vocab', 'v1')).toBe(true)
  })
})

describe('addManyToReviewQueue (batch add)', () => {
  it('adds every item not already added, and skips ones that are', async () => {
    await gradeItem('vocab', 'existing-card', 'N5', Rating.Good, new Date('2026-01-01T00:00:00Z'))
    await addToReviewQueue('vocab', 'existing-queued', 'N5')

    const added = await addManyToReviewQueue([
      { itemType: 'vocab', itemId: 'existing-card', level: 'N5' },
      { itemType: 'vocab', itemId: 'existing-queued', level: 'N5' },
      { itemType: 'vocab', itemId: 'brand-new-1', level: 'N5' },
      { itemType: 'vocab', itemId: 'brand-new-2', level: 'N5' },
    ])

    expect(added).toBe(2)
    const addedIds = await listAddedItemIds('vocab')
    expect(addedIds).toEqual(new Set(['existing-card', 'existing-queued', 'brand-new-1', 'brand-new-2']))
  })
})

describe('listDueCards / countDueCards', () => {
  it('only returns cards whose due date has passed', async () => {
    const now = new Date('2026-01-01T00:00:00Z')
    // Again on a brand-new card schedules a very short due (learning step), so
    // it's reliably due again a few minutes later relative to `now`.
    await gradeItem('vocab', 'due-soon', 'N5', Rating.Again, now)
    await gradeItem('vocab', 'not-due-yet', 'N5', Rating.Easy, now)

    const checkTime = new Date(now.getTime() + 5 * 60 * 1000) // 5 minutes later
    const due = await listDueCards(checkTime)
    const dueIds = due.map((c) => c.itemId)

    expect(dueIds).toContain('due-soon')
    expect(dueIds).not.toContain('not-due-yet')
    expect(await countDueCards(checkTime)).toBe(due.length)
  })
})

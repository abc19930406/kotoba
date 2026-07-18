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
  suspendCard,
  resumeCard,
  listSuspendedCards,
  getItemStatuses,
  getCurrentLevel,
  setCurrentLevel,
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

describe('suspendCard / resumeCard ("已熟悉" retirement)', () => {
  it('excludes a suspended card from listDueCards even though its due date has passed', async () => {
    const now = new Date('2026-01-01T00:00:00Z')
    await gradeItem('vocab', 'due-soon', 'N5', Rating.Again, now)
    const checkTime = new Date(now.getTime() + 5 * 60 * 1000)

    expect((await listDueCards(checkTime)).map((c) => c.itemId)).toContain('due-soon')

    await suspendCard('vocab', 'due-soon', 'N5')

    const due = await listDueCards(checkTime)
    expect(due.map((c) => c.itemId)).not.toContain('due-soon')
    expect(await countDueCards(checkTime)).toBe(due.length)
    // The card row itself still exists — this is retirement, not deletion.
    expect(await cardExists('vocab', 'due-soon')).toBe(true)
  })

  it('resuming continues the same FSRS schedule instead of resetting to a new card', async () => {
    const now = new Date('2026-01-01T00:00:00Z')
    const first = await gradeItem('vocab', 'v1', 'N5', Rating.Good, now)
    const second = await gradeItem('vocab', 'v1', 'N5', Rating.Good, first.due)

    await suspendCard('vocab', 'v1', 'N5')
    await resumeCard('vocab', 'v1')

    const resumed = await getCard('vocab', 'v1')
    expect(resumed?.suspended).toBe(false)
    expect(resumed?.state).toBe(second.state)
    expect(resumed?.stability).toBe(second.stability)
    expect(resumed?.difficulty).toBe(second.difficulty)
    expect(resumed?.due.getTime()).toBe(second.due.getTime())
    expect(resumed?.reps).toBe(second.reps) // not reset to 0 like a fresh card
  })

  it('a suspend followed immediately by resume (simulating an undo) leaves the card exactly as it was', async () => {
    const now = new Date('2026-01-01T00:00:00Z')
    const graded = await gradeItem('vocab', 'v1', 'N5', Rating.Good, now)

    await suspendCard('vocab', 'v1', 'N5')
    await resumeCard('vocab', 'v1') // the "撤銷" action

    const restored = await getCard('vocab', 'v1')
    expect(restored).toEqual(graded)
  })

  it('listSuspendedCards / getItemStatuses reflect suspended items separately from active ones', async () => {
    await gradeItem('vocab', 'v1', 'N5', Rating.Good, new Date('2026-01-01T00:00:00Z'))
    await gradeItem('vocab', 'v2', 'N5', Rating.Good, new Date('2026-01-01T00:00:00Z'))
    await addToReviewQueue('vocab', 'v3', 'N5')
    await suspendCard('vocab', 'v1', 'N5')

    const suspended = await listSuspendedCards()
    expect(suspended.map((c) => c.itemId)).toEqual(['v1'])

    const statuses = await getItemStatuses('vocab')
    expect(statuses.get('v1')).toBe('suspended')
    expect(statuses.get('v2')).toBe('active')
    expect(statuses.get('v3')).toBe('queued')
    expect(statuses.get('v4')).toBeUndefined() // never added — "未加入"
  })

  it('a regrade after resuming keeps suspended=false (does not silently re-suspend)', async () => {
    const now = new Date('2026-01-01T00:00:00Z')
    await gradeItem('vocab', 'v1', 'N5', Rating.Good, now)
    await suspendCard('vocab', 'v1', 'N5')
    await resumeCard('vocab', 'v1')

    const regraded = await gradeItem('vocab', 'v1', 'N5', Rating.Good, new Date('2026-01-02T00:00:00Z'))
    expect(regraded.suspended).toBe(false)
  })

  it('suspending a brand-new item (never graded, e.g. straight from the review flow) still creates a tracked, excluded card instead of silently no-op-ing', async () => {
    // Reachable in practice: a "new" queue item (isNew: true) has no cards
    // row yet — suspendCard must not depend on one already existing.
    await addToReviewQueue('vocab', 'never-reviewed', 'N4')
    expect(await listQueuedCandidates(10)).toHaveLength(1)

    await suspendCard('vocab', 'never-reviewed', 'N4')

    expect(await cardExists('vocab', 'never-reviewed')).toBe(true)
    expect(await listQueuedCandidates(10)).toHaveLength(0) // moved out of the queued-holding table
    const suspended = await listSuspendedCards()
    expect(suspended.map((c) => c.itemId)).toContain('never-reviewed')

    const due = await listDueCards(new Date('2099-01-01T00:00:00Z'))
    expect(due.map((c) => c.itemId)).not.toContain('never-reviewed') // never surfaces despite the far-future check time
  })

  it('suspend/resume work identically for itemType grammar (Phase 4 addendum)', async () => {
    const now = new Date('2026-01-01T00:00:00Z')
    const graded = await gradeItem('grammar', 'g1', 'N4', Rating.Good, now)

    await suspendCard('grammar', 'g1', 'N4')
    expect((await getCard('grammar', 'g1'))?.suspended).toBe(true)
    const dueAfterSuspend = await listDueCards(new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000))
    expect(dueAfterSuspend.map((c) => c.itemId)).not.toContain('g1')

    await resumeCard('grammar', 'g1')
    const resumed = await getCard('grammar', 'g1')
    expect(resumed?.suspended).toBe(false)
    expect(resumed?.stability).toBe(graded.stability) // FSRS state continues, not reset

    const statuses = await getItemStatuses('grammar')
    expect(statuses.get('g1')).toBe('active')
  })

  it('已熟悉清單 (listSuspendedCards) mixes vocab and grammar, distinguishable by itemType', async () => {
    await gradeItem('vocab', 'v1', 'N5', Rating.Good, new Date('2026-01-01T00:00:00Z'))
    await gradeItem('grammar', 'g1', 'N4', Rating.Good, new Date('2026-01-01T00:00:00Z'))
    await suspendCard('vocab', 'v1', 'N5')
    await suspendCard('grammar', 'g1', 'N4')

    const suspended = await listSuspendedCards()
    expect(suspended).toHaveLength(2)
    expect(suspended.find((c) => c.itemId === 'v1')?.itemType).toBe('vocab')
    expect(suspended.find((c) => c.itemId === 'g1')?.itemType).toBe('grammar')
  })
})

describe('getCurrentLevel / setCurrentLevel', () => {
  it('defaults to N5 and round-trips through every level', async () => {
    expect(await getCurrentLevel()).toBe('N5')

    for (const level of ['N4', 'N3', 'N2', 'N1', 'N5'] as const) {
      await setCurrentLevel(level)
      expect(await getCurrentLevel()).toBe(level)
    }
  })
})

describe('Phase 4.5: detail-page 標記已熟悉 on a "queued but never reviewed" item', () => {
  it('vocab: 標記→退役→恢復 works for an item that was only 加入複習, never graded', async () => {
    await addToReviewQueue('vocab', 'v-queued-only', 'N4')
    expect((await getItemStatuses('vocab')).get('v-queued-only')).toBe('queued')

    // Detail page's "標記已熟悉" click on a queued item — routes through the
    // same new-card retirement path as the review-flow suspend button.
    await suspendCard('vocab', 'v-queued-only', 'N4')

    expect(await cardExists('vocab', 'v-queued-only')).toBe(true)
    expect(await listQueuedCandidates(10)).toHaveLength(0)
    expect((await getItemStatuses('vocab')).get('v-queued-only')).toBe('suspended')

    await resumeCard('vocab', 'v-queued-only')
    expect((await getItemStatuses('vocab')).get('v-queued-only')).toBe('active')
    const due = await listDueCards(new Date('2099-01-01T00:00:00Z'))
    expect(due.map((c) => c.itemId)).toContain('v-queued-only') // recovered, immediately eligible
  })

  it('grammar: 標記→退役→恢復 works for an item that was only 加入複習, never graded', async () => {
    await addToReviewQueue('grammar', 'g-queued-only', 'N3')
    expect((await getItemStatuses('grammar')).get('g-queued-only')).toBe('queued')

    await suspendCard('grammar', 'g-queued-only', 'N3')

    expect(await cardExists('grammar', 'g-queued-only')).toBe(true)
    expect(await listQueuedCandidates(10)).toHaveLength(0)
    expect((await getItemStatuses('grammar')).get('g-queued-only')).toBe('suspended')

    await resumeCard('grammar', 'g-queued-only')
    expect((await getItemStatuses('grammar')).get('g-queued-only')).toBe('active')
    const due = await listDueCards(new Date('2099-01-01T00:00:00Z'))
    expect(due.map((c) => c.itemId)).toContain('g-queued-only')
  })
})

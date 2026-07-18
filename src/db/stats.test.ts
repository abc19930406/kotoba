import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './schema.ts'
import { gradeItem, suspendCard } from './cards.ts'
import { Rating } from 'ts-fsrs'
import { getDailyReviewCounts, getLevelProgress, getStreakDays } from './stats.ts'

beforeEach(async () => {
  await db.cards.clear()
  await db.reviewLogs.clear()
  await db.settings.clear()
  await db.queuedItems.clear()
})

describe('getDailyReviewCounts', () => {
  it('zero-fills days with no reviews and buckets reviews by local day', async () => {
    const now = new Date('2026-01-10T12:00:00')
    const threeDaysAgo = new Date('2026-01-07T09:00:00')
    await gradeItem('vocab', 'v1', 'N5', Rating.Good, threeDaysAgo)
    await gradeItem('vocab', 'v2', 'N5', Rating.Good, now)
    await gradeItem('vocab', 'v3', 'N5', Rating.Good, now)

    const counts = await getDailyReviewCounts(5, now)

    expect(counts).toHaveLength(5)
    expect(counts.map((c) => c.date)).toEqual(['2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09', '2026-01-10'])
    expect(counts.find((c) => c.date === '2026-01-07')?.count).toBe(1)
    expect(counts.find((c) => c.date === '2026-01-06')?.count).toBe(0)
    expect(counts.find((c) => c.date === '2026-01-08')?.count).toBe(0)
    expect(counts.find((c) => c.date === '2026-01-10')?.count).toBe(2)
  })

  it('returns all-zero counts when there are no reviews at all', async () => {
    const counts = await getDailyReviewCounts(3, new Date('2026-01-10T00:00:00'))
    expect(counts.every((c) => c.count === 0)).toBe(true)
  })
})

describe('getLevelProgress', () => {
  it('buckets active/suspended/notStarted per level, vocab and grammar counted separately', async () => {
    const now = new Date('2026-01-01T00:00:00Z')
    await gradeItem('vocab', 'v1', 'N5', Rating.Good, now) // active
    await gradeItem('vocab', 'v2', 'N5', Rating.Good, now)
    await suspendCard('vocab', 'v2', 'N5', now) // suspended
    await gradeItem('grammar', 'g1', 'N5', Rating.Good, now) // active, grammar only

    const totals = { N5: 10, N4: 0, N3: 0, N2: 0, N1: 0 }
    const vocabProgress = await getLevelProgress('vocab', totals)
    const grammarProgress = await getLevelProgress('grammar', totals)

    const n5Vocab = vocabProgress.find((p) => p.level === 'N5')!
    expect(n5Vocab).toEqual({ level: 'N5', active: 1, suspended: 1, notStarted: 8 })

    const n5Grammar = grammarProgress.find((p) => p.level === 'N5')!
    expect(n5Grammar).toEqual({ level: 'N5', active: 1, suspended: 0, notStarted: 9 })

    const n4Vocab = vocabProgress.find((p) => p.level === 'N4')!
    expect(n4Vocab).toEqual({ level: 'N4', active: 0, suspended: 0, notStarted: 0 })
  })

  it('clamps notStarted at 0 when active+suspended exceeds the known total (stale totals)', async () => {
    const now = new Date('2026-01-01T00:00:00Z')
    await gradeItem('vocab', 'v1', 'N5', Rating.Good, now)
    await gradeItem('vocab', 'v2', 'N5', Rating.Good, now)

    const progress = await getLevelProgress('vocab', { N5: 1, N4: 0, N3: 0, N2: 0, N1: 0 })
    expect(progress.find((p) => p.level === 'N5')?.notStarted).toBe(0)
  })
})

describe('getStreakDays', () => {
  it('returns 0 when there are no reviews ever', async () => {
    expect(await getStreakDays(new Date('2026-01-10T00:00:00'))).toBe(0)
  })

  it('counts consecutive days ending today', async () => {
    await gradeItem('vocab', 'v1', 'N5', Rating.Good, new Date('2026-01-08T09:00:00'))
    await gradeItem('vocab', 'v2', 'N5', Rating.Good, new Date('2026-01-09T09:00:00'))
    await gradeItem('vocab', 'v3', 'N5', Rating.Good, new Date('2026-01-10T09:00:00'))

    expect(await getStreakDays(new Date('2026-01-10T20:00:00'))).toBe(3)
  })

  it("doesn't zero out the streak just because today has no review yet — counts from yesterday", async () => {
    await gradeItem('vocab', 'v1', 'N5', Rating.Good, new Date('2026-01-08T09:00:00'))
    await gradeItem('vocab', 'v2', 'N5', Rating.Good, new Date('2026-01-09T09:00:00'))

    expect(await getStreakDays(new Date('2026-01-10T08:00:00'))).toBe(2)
  })

  it('breaks the streak at the first gap day', async () => {
    await gradeItem('vocab', 'v1', 'N5', Rating.Good, new Date('2026-01-05T09:00:00'))
    // gap on 2026-01-06
    await gradeItem('vocab', 'v2', 'N5', Rating.Good, new Date('2026-01-09T09:00:00'))
    await gradeItem('vocab', 'v3', 'N5', Rating.Good, new Date('2026-01-10T09:00:00'))

    expect(await getStreakDays(new Date('2026-01-10T20:00:00'))).toBe(2)
  })
})

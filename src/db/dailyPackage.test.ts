import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Rating, State } from 'ts-fsrs'
import { db } from './schema.ts'
import { gradeItem, addToReviewQueue } from './cards.ts'
import type { VocabEntry, GrammarEntry } from '../shared/contentTypes.ts'

function makeVocab(n: number): VocabEntry[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `v${i}`,
    level: 'N5',
    kanji: `字${i}`,
    kana: `かな${i}`,
    usageNote: null,
    partOfSpeech: [],
    meaningEn: [],
    meaningZh: null,
    sentences: [],
  }))
}

function makeGrammar(n: number): GrammarEntry[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `g${i}`,
    level: 'N5',
    title: `文法${i}`,
    formation: '',
    shortExplanation: '',
    longExplanation: '',
    zhShort: null,
    zhLong: null,
    sentences: [],
  }))
}

const mockVocab = makeVocab(30)
const mockGrammar = makeGrammar(30)

vi.mock('../shared/contentLoader.ts', () => ({
  loadVocabLevel: vi.fn(async () => mockVocab),
  loadGrammarLevel: vi.fn(async () => mockGrammar),
  findVocabEntry: vi.fn(async (_level: string, id: string) => mockVocab.find((v) => v.id === id)),
}))

const { buildDailyPackage, seededShuffle } = await import('./dailyPackage.ts')

async function putReviewCard(itemId: string, stability: number, now: Date): Promise<void> {
  const lastReview = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  await db.cards.put({
    itemId,
    itemType: 'vocab',
    level: 'N5',
    due: new Date(now.getTime() - 1000),
    stability,
    difficulty: 5,
    elapsed_days: 30,
    scheduled_days: 30,
    learning_steps: 0,
    reps: 3,
    lapses: 0,
    state: State.Review,
    last_review: lastReview,
    suspended: false,
  })
}

beforeEach(async () => {
  await db.cards.clear()
  await db.reviewLogs.clear()
  await db.settings.clear()
  await db.queuedItems.clear()
})

describe('seededShuffle', () => {
  it('is deterministic for the same seed', () => {
    const items = Array.from({ length: 20 }, (_, i) => i)
    expect(seededShuffle(items, 'seed-a')).toEqual(seededShuffle(items, 'seed-a'))
  })

  it('differs for different seeds', () => {
    const items = Array.from({ length: 20 }, (_, i) => i)
    expect(seededShuffle(items, 'seed-a')).not.toEqual(seededShuffle(items, 'seed-b'))
  })
})

describe('buildDailyPackage', () => {
  it('is deterministic for the same date and level (repeated calls return identical order)', async () => {
    const now = new Date('2026-03-01T09:00:00')
    const a = await buildDailyPackage('N5', now)
    const b = await buildDailyPackage('N5', now)
    expect(a.newVocab.map((v) => v.id)).toEqual(b.newVocab.map((v) => v.id))
    expect(a.newGrammar.map((g) => g.id)).toEqual(b.newGrammar.map((g) => g.id))
  })

  it('changes the selection on a different date', async () => {
    const a = await buildDailyPackage('N5', new Date('2026-03-01T09:00:00'))
    const b = await buildDailyPackage('N5', new Date('2026-03-02T09:00:00'))
    expect(a.newVocab.map((v) => v.id)).not.toEqual(b.newVocab.map((v) => v.id))
  })

  it('picks exactly 5 new vocab and 2 new grammar when enough are available', async () => {
    const pkg = await buildDailyPackage('N5', new Date('2026-03-01T09:00:00'))
    expect(pkg.newVocab).toHaveLength(5)
    expect(pkg.newGrammar).toHaveLength(2)
  })

  it('excludes items that already have progress or are queued', async () => {
    const now = new Date('2026-03-01T09:00:00')
    await gradeItem('vocab', 'v0', 'N5', Rating.Good, now)
    await addToReviewQueue('vocab', 'v1', 'N5', now)

    const pkg = await buildDailyPackage('N5', now)

    expect(pkg.newVocab.map((v) => v.id)).not.toContain('v0')
    expect(pkg.newVocab.map((v) => v.id)).not.toContain('v1')
  })

  it('gracefully degrades when fewer than the target count remain untouched', async () => {
    const now = new Date('2026-03-01T09:00:00')
    for (let i = 0; i < 28; i++) {
      await addToReviewQueue('vocab', `v${i}`, 'N5', now)
    }
    const pkg = await buildDailyPackage('N5', now)
    expect(pkg.newVocab).toHaveLength(2)
  })

  it('picks the 3 due vocab cards with lowest retrievability, ascending', async () => {
    const now = new Date('2026-03-10T09:00:00')
    await putReviewCard('v10', 1, now)
    await putReviewCard('v11', 5, now)
    await putReviewCard('v12', 10, now)
    await putReviewCard('v13', 20, now)
    await putReviewCard('v14', 50, now)

    const pkg = await buildDailyPackage('N5', now)

    expect(pkg.reviewVocab.map((v) => v.id)).toEqual(['v10', 'v11', 'v12'])
  })

  it('gracefully degrades reviewVocab when fewer than 3 due cards exist', async () => {
    const now = new Date('2026-03-10T09:00:00')
    await putReviewCard('v10', 1, now)

    const pkg = await buildDailyPackage('N5', now)

    expect(pkg.reviewVocab.map((v) => v.id)).toEqual(['v10'])
  })
})

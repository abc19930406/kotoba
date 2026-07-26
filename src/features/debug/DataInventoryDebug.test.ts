import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Rating } from 'ts-fsrs'
import { db } from '../../db/schema.ts'
import { gradeItem, addToReviewQueue, setCurrentLevel } from '../../db/cards.ts'
import { saveNoteText, addNoteImage } from '../../db/notes.ts'
import { createStandaloneNote } from '../../db/standaloneNotes.ts'
import { computeDataInventory, summarizeBlobSizes } from './DataInventoryDebug.tsx'

// enqueueSync's scheduleSyncPush() side effect fires a real 5s debounce timer
// otherwise — irrelevant to these tests and would leave a dangling timer.
vi.mock('../../shared/syncEngine.ts', () => ({
  scheduleSyncPush: vi.fn(),
  pushNow: vi.fn(),
  initSyncEngine: vi.fn(),
}))

beforeEach(async () => {
  await db.cards.clear()
  await db.reviewLogs.clear()
  await db.queuedItems.clear()
  await db.notes.clear()
  await db.standaloneNotes.clear()
  await db.settings.clear()
  await db.noteImages.clear()
})

describe('computeDataInventory', () => {
  it('reports zero counts and zero bytes for an empty database', async () => {
    const result = await computeDataInventory()
    expect(result.counts).toEqual({
      cards: 0,
      reviewLogs: 0,
      queuedItems: 0,
      notes: 0,
      standaloneNotes: 0,
      settings: 0,
      noteImages: 0,
    })
    expect(result.imageTotalBytes).toBe(0)
    expect(result.imageMaxBytes).toBe(0)
    // Still non-zero — an empty-arrays JSON skeleton has some bytes.
    expect(result.jsonBytes).toBeGreaterThan(0)
  })

  it('counts rows across cards/reviewLogs/queuedItems/notes/standaloneNotes/settings correctly', async () => {
    const now = new Date('2026-01-01T00:00:00Z')
    await gradeItem('vocab', 'v1', 'N5', Rating.Good, now)
    await addToReviewQueue('grammar', 'g1', 'N3', now)
    await saveNoteText('vocab', 'v1', '筆記內容')
    await createStandaloneNote('標題', '內文')
    await setCurrentLevel('N4')

    const result = await computeDataInventory()

    expect(result.counts.cards).toBe(1)
    expect(result.counts.reviewLogs).toBe(1)
    expect(result.counts.queuedItems).toBe(1)
    expect(result.counts.notes).toBe(1)
    expect(result.counts.standaloneNotes).toBe(1)
    expect(result.counts.settings).toBe(1)
  })

  it('counts noteImages rows correctly through a real Dexie round-trip', async () => {
    await addNoteImage('vocab', 'v1', new Blob(['a'.repeat(100)]))
    await addNoteImage('vocab', 'v1', new Blob(['b'.repeat(300)]))

    const result = await computeDataInventory()

    expect(result.counts.noteImages).toBe(2)
  })

  it('excludes image bytes from the JSON size estimate', async () => {
    const before = await computeDataInventory()
    await addNoteImage('vocab', 'v1', new Blob(['x'.repeat(10_000)]))
    const after = await computeDataInventory()

    // A 10KB image shouldn't meaningfully move the non-image JSON estimate —
    // the noteImages table (and its own note row's text-only note record,
    // already covered above) is excluded from the JSON size, only its
    // *count* changes elsewhere.
    expect(after.jsonBytes - before.jsonBytes).toBeLessThan(1000)
  })
})

describe('summarizeBlobSizes', () => {
  it('sums all sizes and finds the max', () => {
    expect(summarizeBlobSizes([100, 300, 50])).toEqual({ total: 450, max: 300 })
  })

  it('returns zeros for an empty array', () => {
    expect(summarizeBlobSizes([])).toEqual({ total: 0, max: 0 })
  })

  it('handles a single value', () => {
    expect(summarizeBlobSizes([42])).toEqual({ total: 42, max: 42 })
  })
})

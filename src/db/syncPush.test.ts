import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from './schema.ts'

const mockGetSession = vi.fn()
const mockUpsert = vi.fn(async (_table: string, _rows: unknown[], _opts: unknown) => ({ error: null }) as { error: unknown })
const mockDeleteMatch = vi.fn(async (_table: string, _obj: unknown) => ({ error: null }) as { error: unknown })
const mockFrom = vi.fn((table: string) => ({
  upsert: (rows: unknown[], opts: unknown) => mockUpsert(table, rows, opts),
  delete: () => ({ match: (obj: unknown) => mockDeleteMatch(table, obj) }),
}))

vi.mock('./supabase.ts', () => ({
  supabase: {
    auth: { getSession: mockGetSession },
    from: mockFrom,
  },
}))

const { pushPendingChanges } = await import('./syncPush.ts')

const FAKE_SESSION = { data: { session: { user: { email: 'a@b.com' } } } }

beforeEach(async () => {
  await db.cards.clear()
  await db.reviewLogs.clear()
  await db.queuedItems.clear()
  await db.notes.clear()
  await db.standaloneNotes.clear()
  await db.settings.clear()
  await db.syncQueue.clear()
  mockGetSession.mockReset().mockResolvedValue(FAKE_SESSION)
  mockUpsert.mockReset().mockResolvedValue({ error: null })
  mockDeleteMatch.mockReset().mockResolvedValue({ error: null })
  mockFrom.mockClear()
})

async function seedCard() {
  await db.cards.put({
    itemId: 'v1',
    itemType: 'vocab',
    level: 'N5',
    due: new Date('2026-01-02T00:00:00Z'),
    stability: 1,
    difficulty: 2,
    elapsed_days: 0,
    scheduled_days: 1,
    learning_steps: 0,
    reps: 1,
    lapses: 0,
    state: 1,
    suspended: false,
  })
}

describe('pushPendingChanges — not logged in', () => {
  it('no-ops and leaves the queue untouched', async () => {
    await seedCard()
    await db.syncQueue.add({ table: 'cards', key: 'vocab:v1', op: 'upsert', queuedAt: new Date() })
    mockGetSession.mockResolvedValue({ data: { session: null } })

    await pushPendingChanges()

    expect(mockFrom).not.toHaveBeenCalled()
    expect(await db.syncQueue.count()).toBe(1)
  })
})

describe('pushPendingChanges — upsert success', () => {
  it('sends the correct kotoba_cards payload and clears the queue entry', async () => {
    await seedCard()
    const queuedAt = new Date('2026-01-02T03:04:05Z')
    await db.syncQueue.add({ table: 'cards', key: 'vocab:v1', op: 'upsert', queuedAt })

    await pushPendingChanges()

    expect(mockUpsert).toHaveBeenCalledTimes(1)
    const [table, rows, opts] = mockUpsert.mock.calls[0]!
    expect(table).toBe('kotoba_cards')
    expect(rows).toEqual([
      {
        item_id: 'v1',
        item_type: 'vocab',
        level: 'N5',
        due: '2026-01-02T00:00:00.000Z',
        stability: 1,
        difficulty: 2,
        elapsed_days: 0,
        scheduled_days: 1,
        learning_steps: 0,
        reps: 1,
        lapses: 0,
        state: 1,
        last_review: null,
        suspended: false,
        updated_at: queuedAt.toISOString(),
      },
    ])
    expect(opts).toEqual({ onConflict: 'item_type,item_id' })
    expect(await db.syncQueue.count()).toBe(0)
  })

  it('sends reviewLogs keyed by remoteId, not the local auto-increment id', async () => {
    const remoteId = 'aaaa-bbbb-cccc'
    await db.reviewLogs.add({
      remoteId,
      itemId: 'v1',
      itemType: 'vocab',
      rating: 3,
      state: 1,
      due: new Date('2026-01-02T00:00:00Z'),
      stability: 1,
      difficulty: 2,
      scheduled_days: 1,
      learning_steps: 0,
      review: new Date('2026-01-01T00:00:00Z'),
    })
    await db.syncQueue.add({ table: 'reviewLogs', key: remoteId, op: 'upsert', queuedAt: new Date() })

    await pushPendingChanges()

    const [table, rows, opts] = mockUpsert.mock.calls[0]!
    expect(table).toBe('kotoba_review_logs')
    expect((rows as Array<{ id: string }>)[0]!.id).toBe(remoteId)
    expect(opts).toEqual({ onConflict: 'id' })
  })

  it('a table with no pending entries is never queried', async () => {
    await seedCard()
    await db.syncQueue.add({ table: 'cards', key: 'vocab:v1', op: 'upsert', queuedAt: new Date() })

    await pushPendingChanges()

    const queriedTables = mockFrom.mock.calls.map((c) => c[0])
    expect(queriedTables).toEqual(['kotoba_cards'])
  })
})

describe('pushPendingChanges — failure', () => {
  it('leaves the queue entry when the API call throws', async () => {
    await seedCard()
    await db.syncQueue.add({ table: 'cards', key: 'vocab:v1', op: 'upsert', queuedAt: new Date() })
    mockUpsert.mockRejectedValue(new Error('network down'))

    await expect(pushPendingChanges()).resolves.toBeUndefined()

    expect(await db.syncQueue.count()).toBe(1)
  })

  it('leaves the queue entry when the API returns an error object', async () => {
    await seedCard()
    await db.syncQueue.add({ table: 'cards', key: 'vocab:v1', op: 'upsert', queuedAt: new Date() })
    mockUpsert.mockResolvedValue({ error: { message: 'rejected' } })

    await pushPendingChanges()

    expect(await db.syncQueue.count()).toBe(1)
  })

  it('a failure in one table does not block other tables from pushing', async () => {
    await seedCard()
    await db.notes.put({ itemType: 'vocab', itemId: 'v1', text: '筆記', updatedAt: new Date() })
    await db.syncQueue.bulkAdd([
      { table: 'cards', key: 'vocab:v1', op: 'upsert', queuedAt: new Date() },
      { table: 'notes', key: 'vocab:v1', op: 'upsert', queuedAt: new Date() },
    ])
    mockUpsert.mockImplementation(async (table) => (table === 'kotoba_cards' ? Promise.reject(new Error('down')) : { error: null }))

    await pushPendingChanges()

    const remaining = await db.syncQueue.toArray()
    expect(remaining).toEqual([expect.objectContaining({ table: 'cards' })])
  })
})

describe('pushPendingChanges — coalescing', () => {
  it('collapses repeated upserts for the same key into a single API call', async () => {
    await seedCard()
    await db.syncQueue.add({ table: 'cards', key: 'vocab:v1', op: 'upsert', queuedAt: new Date('2026-01-01T00:00:00Z') })
    await db.syncQueue.add({ table: 'cards', key: 'vocab:v1', op: 'upsert', queuedAt: new Date('2026-01-01T00:00:05Z') })

    await pushPendingChanges()

    expect(mockUpsert).toHaveBeenCalledTimes(1)
    expect((mockUpsert.mock.calls[0]![1] as unknown[]).length).toBe(1)
  })

  it('an upsert followed by a delete for the same key only sends the delete', async () => {
    await db.syncQueue.add({ table: 'notes', key: 'vocab:v1', op: 'upsert', queuedAt: new Date('2026-01-01T00:00:00Z') })
    await db.syncQueue.add({ table: 'notes', key: 'vocab:v1', op: 'delete', queuedAt: new Date('2026-01-01T00:00:05Z') })

    await pushPendingChanges()

    expect(mockUpsert).not.toHaveBeenCalled()
    expect(mockDeleteMatch).toHaveBeenCalledTimes(1)
    expect(mockDeleteMatch.mock.calls[0]).toEqual(['kotoba_notes', { item_type: 'vocab', item_id: 'v1' }])
    expect(await db.syncQueue.count()).toBe(0)
  })
})

describe('pushPendingChanges — never touches local data tables', () => {
  it('leaves cards/notes/standaloneNotes/settings row counts and content unchanged', async () => {
    await seedCard()
    await db.notes.put({ itemType: 'vocab', itemId: 'v1', text: '筆記', updatedAt: new Date() })
    await db.settings.put({ key: 'theme', value: 1 })
    await db.syncQueue.bulkAdd([
      { table: 'cards', key: 'vocab:v1', op: 'upsert', queuedAt: new Date() },
      { table: 'notes', key: 'vocab:v1', op: 'upsert', queuedAt: new Date() },
      { table: 'settings', key: 'theme', op: 'upsert', queuedAt: new Date() },
    ])

    const before = {
      cards: await db.cards.toArray(),
      notes: await db.notes.toArray(),
      settings: await db.settings.toArray(),
    }

    await pushPendingChanges()

    expect(await db.cards.toArray()).toEqual(before.cards)
    expect(await db.notes.toArray()).toEqual(before.notes)
    expect(await db.settings.toArray()).toEqual(before.settings)
  })
})

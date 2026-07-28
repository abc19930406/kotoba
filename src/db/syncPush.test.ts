import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from './schema.ts'

const mockGetSession = vi.fn()
const mockUpsert = vi.fn(async (_table: string, _rows: unknown[], _opts: unknown) => ({ error: null }) as { error: unknown })
const mockUpdate = vi.fn(
  async (_table: string, _values: unknown, _match: unknown, _or: string) => ({ error: null }) as { error: unknown },
)
const mockStorageRemove = vi.fn(async (_paths: string[]) => ({ error: null }) as { error: unknown })

const mockFrom = vi.fn((table: string) => ({
  upsert: (rows: unknown[], opts: unknown) => mockUpsert(table, rows, opts),
  update: (values: unknown) => ({
    match: (matchObj: unknown) => ({
      or: (orExpr: string) => mockUpdate(table, values, matchObj, orExpr),
    }),
  }),
}))

const mockStorageFrom = vi.fn((_bucket: string) => ({ remove: mockStorageRemove }))

vi.mock('./supabase.ts', () => ({
  supabase: {
    auth: { getSession: mockGetSession },
    from: mockFrom,
    storage: { from: mockStorageFrom },
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
  await db.noteImages.clear()
  await db.syncQueue.clear()
  mockGetSession.mockReset().mockResolvedValue(FAKE_SESSION)
  mockUpsert.mockReset().mockResolvedValue({ error: null })
  mockUpdate.mockReset().mockResolvedValue({ error: null })
  mockStorageRemove.mockReset().mockResolvedValue({ error: null })
  mockFrom.mockClear()
  mockStorageFrom.mockClear()
})

async function seedCard(updatedAt: Date = new Date('2026-01-02T03:04:05Z')) {
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
    updatedAt,
  })
}

describe('pushPendingChanges — not logged in', () => {
  it('no-ops and leaves the queue untouched', async () => {
    await seedCard()
    await db.syncQueue.add({ table: 'cards', key: 'vocab:v1', op: 'upsert' })
    mockGetSession.mockResolvedValue({ data: { session: null } })

    await pushPendingChanges()

    expect(mockFrom).not.toHaveBeenCalled()
    expect(await db.syncQueue.count()).toBe(1)
  })
})

describe('pushPendingChanges — upsert success', () => {
  it('sends the correct kotoba_cards payload (updated_at from the row itself, deleted_at cleared) and clears the queue entry', async () => {
    const updatedAt = new Date('2026-01-02T03:04:05Z')
    await seedCard(updatedAt)
    await db.syncQueue.add({ table: 'cards', key: 'vocab:v1', op: 'upsert' })

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
        updated_at: updatedAt.toISOString(),
        deleted_at: null,
      },
    ])
    expect(opts).toEqual({ onConflict: 'item_type,item_id' })
    expect(await db.syncQueue.count()).toBe(0)
  })

  it('sends reviewLogs keyed by remoteId, not the local auto-increment id, with updated_at from its own review time, and no deleted_at field at all (no such column, no delete sync for this table)', async () => {
    const remoteId = 'aaaa-bbbb-cccc'
    const reviewTime = new Date('2026-01-01T00:00:00Z')
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
      review: reviewTime,
    })
    await db.syncQueue.add({ table: 'reviewLogs', key: remoteId, op: 'upsert' })

    await pushPendingChanges()

    const [table, rows, opts] = mockUpsert.mock.calls[0]!
    expect(table).toBe('kotoba_review_logs')
    const row = (rows as Array<Record<string, unknown>>)[0]!
    expect(row).toMatchObject({ id: remoteId, updated_at: reviewTime.toISOString() })
    expect(row).not.toHaveProperty('deleted_at')
    expect(opts).toEqual({ onConflict: 'id' })
  })

  it('a table with no pending entries is never queried', async () => {
    await seedCard()
    await db.syncQueue.add({ table: 'cards', key: 'vocab:v1', op: 'upsert' })

    await pushPendingChanges()

    const queriedTables = mockFrom.mock.calls.map((c) => c[0])
    expect(queriedTables).toEqual(['kotoba_cards'])
  })
})

describe('pushPendingChanges — failure', () => {
  it('leaves the queue entry when the API call throws', async () => {
    await seedCard()
    await db.syncQueue.add({ table: 'cards', key: 'vocab:v1', op: 'upsert' })
    mockUpsert.mockRejectedValue(new Error('network down'))

    await expect(pushPendingChanges()).resolves.toBeUndefined()

    expect(await db.syncQueue.count()).toBe(1)
  })

  it('leaves the queue entry when the API returns an error object', async () => {
    await seedCard()
    await db.syncQueue.add({ table: 'cards', key: 'vocab:v1', op: 'upsert' })
    mockUpsert.mockResolvedValue({ error: { message: 'rejected' } })

    await pushPendingChanges()

    expect(await db.syncQueue.count()).toBe(1)
  })

  it('a failure in one table does not block other tables from pushing', async () => {
    await seedCard()
    await db.notes.put({ itemType: 'vocab', itemId: 'v1', text: '筆記', updatedAt: new Date() })
    await db.syncQueue.bulkAdd([
      { table: 'cards', key: 'vocab:v1', op: 'upsert' },
      { table: 'notes', key: 'vocab:v1', op: 'upsert' },
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
    await db.syncQueue.add({ table: 'cards', key: 'vocab:v1', op: 'upsert' })
    await db.syncQueue.add({ table: 'cards', key: 'vocab:v1', op: 'upsert' })

    await pushPendingChanges()

    expect(mockUpsert).toHaveBeenCalledTimes(1)
    expect((mockUpsert.mock.calls[0]![1] as unknown[]).length).toBe(1)
  })

  it('an upsert followed by a delete for the same key only sends the delete', async () => {
    const deletedAt = '2026-01-05T00:00:00.000Z'
    await db.syncQueue.add({ table: 'notes', key: 'vocab:v1', op: 'upsert' })
    await db.syncQueue.add({ table: 'notes', key: 'vocab:v1', op: 'delete', deletedAt })

    await pushPendingChanges()

    expect(mockUpsert).not.toHaveBeenCalled()
    expect(mockUpdate).toHaveBeenCalledTimes(1)
    const [table, values, matchObj] = mockUpdate.mock.calls[0]!
    expect(table).toBe('kotoba_notes')
    expect(values).toEqual({ deleted_at: deletedAt })
    expect(matchObj).toEqual({ item_type: 'vocab', item_id: 'v1' })
    expect(await db.syncQueue.count()).toBe(0)
  })
})

describe('pushPendingChanges — delete (Phase C6 tombstone)', () => {
  it('is a soft delete: sends deleted_at via .update(), never .delete()', async () => {
    const deletedAt = '2026-02-01T00:00:00.000Z'
    await db.syncQueue.add({ table: 'standaloneNotes', key: 'note-uuid-1', op: 'delete', deletedAt })

    await pushPendingChanges()

    expect(mockUpdate).toHaveBeenCalledTimes(1)
    const [table, values, matchObj, orExpr] = mockUpdate.mock.calls[0]!
    expect(table).toBe('kotoba_standalone_notes')
    expect(values).toEqual({ deleted_at: deletedAt })
    expect(matchObj).toEqual({ id: 'note-uuid-1' })
    // Conditional on the cloud row's own updated_at — a genuinely newer edit
    // this device hasn't pulled yet must not be clobbered by a stale delete.
    expect(orExpr).toBe(`updated_at.is.null,updated_at.lt.${deletedAt}`)
  })

  it('falls back to "now" as deletedAt for a pre-existing queue entry that predates this field (defensive, not expected in practice)', async () => {
    await db.syncQueue.add({ table: 'settings', key: 'theme', op: 'delete' })

    await pushPendingChanges()

    const [, values] = mockUpdate.mock.calls[0]!
    expect((values as { deleted_at: string }).deleted_at).toEqual(expect.any(String))
  })
})

describe('pushPendingChanges — noteImages delete (Phase C6)', () => {
  it('upserts a tombstone into kotoba_note_image_deletions', async () => {
    const deletedAt = '2026-02-01T00:00:00.000Z'
    await db.syncQueue.add({ table: 'noteImages', key: 'img-remote-1', op: 'delete', deletedAt })

    await pushPendingChanges()

    expect(mockUpsert).toHaveBeenCalledTimes(1)
    const [table, rows, opts] = mockUpsert.mock.calls[0]!
    expect(table).toBe('kotoba_note_image_deletions')
    expect(rows).toEqual({ remote_id: 'img-remote-1', deleted_at: deletedAt })
    expect(opts).toEqual({ onConflict: 'remote_id' })
    expect(await db.syncQueue.count()).toBe(0)
  })

  it('also removes the Storage object when storagePath was captured', async () => {
    await db.syncQueue.add({
      table: 'noteImages',
      key: 'img-remote-1',
      op: 'delete',
      deletedAt: '2026-02-01T00:00:00.000Z',
      storagePath: 'vocab/abc123/img-remote-1.jpg',
    })

    await pushPendingChanges()

    expect(mockStorageFrom).toHaveBeenCalledWith('kotoba-note-images')
    expect(mockStorageRemove).toHaveBeenCalledWith(['vocab/abc123/img-remote-1.jpg'])
  })

  it('skips the Storage removal when the image was never uploaded (no storagePath)', async () => {
    await db.syncQueue.add({ table: 'noteImages', key: 'img-remote-1', op: 'delete', deletedAt: '2026-02-01T00:00:00.000Z' })

    await pushPendingChanges()

    expect(mockStorageRemove).not.toHaveBeenCalled()
    expect(await db.syncQueue.count()).toBe(0)
  })

  it('leaves the queue entry when the Storage removal fails, so it retries next time', async () => {
    await db.syncQueue.add({
      table: 'noteImages',
      key: 'img-remote-1',
      op: 'delete',
      deletedAt: '2026-02-01T00:00:00.000Z',
      storagePath: 'vocab/abc123/img-remote-1.jpg',
    })
    mockStorageRemove.mockResolvedValue({ error: { message: 'storage down' } })

    await pushPendingChanges()

    expect(await db.syncQueue.count()).toBe(1)
  })

  it('leaves the queue entry when the tombstone upsert itself fails', async () => {
    await db.syncQueue.add({ table: 'noteImages', key: 'img-remote-1', op: 'delete', deletedAt: '2026-02-01T00:00:00.000Z' })
    mockUpsert.mockResolvedValue({ error: { message: 'rejected' } })

    await pushPendingChanges()

    expect(await db.syncQueue.count()).toBe(1)
    expect(mockStorageRemove).not.toHaveBeenCalled()
  })
})

describe('pushPendingChanges — never touches local data tables', () => {
  it('leaves cards/notes/standaloneNotes/settings row counts and content unchanged', async () => {
    await seedCard()
    await db.notes.put({ itemType: 'vocab', itemId: 'v1', text: '筆記', updatedAt: new Date() })
    await db.settings.put({ key: 'theme', value: 1, updatedAt: new Date() })
    await db.syncQueue.bulkAdd([
      { table: 'cards', key: 'vocab:v1', op: 'upsert' },
      { table: 'notes', key: 'vocab:v1', op: 'upsert' },
      { table: 'settings', key: 'theme', op: 'upsert' },
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

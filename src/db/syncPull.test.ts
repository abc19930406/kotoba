import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from './schema.ts'

const mockGetSession = vi.fn()
const tableData = new Map<string, { data: unknown[] | null; error: unknown }>()
const mockFrom = vi.fn((table: string) => ({
  select: () => Promise.resolve(tableData.get(table) ?? { data: [], error: null }),
}))

vi.mock('./supabase.ts', () => ({
  supabase: {
    auth: { getSession: mockGetSession },
    from: mockFrom,
  },
}))

const { pullRemoteChanges } = await import('./syncPull.ts')

const FAKE_SESSION = { data: { session: { user: { email: 'a@b.com' } } } }

function setRemote(table: string, rows: unknown[]) {
  tableData.set(table, { data: rows, error: null })
}

function setRemoteError(table: string) {
  tableData.set(table, { data: null, error: { message: 'fail' } })
}

beforeEach(async () => {
  await db.cards.clear()
  await db.reviewLogs.clear()
  await db.queuedItems.clear()
  await db.notes.clear()
  await db.standaloneNotes.clear()
  await db.settings.clear()
  await db.syncQueue.clear()
  tableData.clear()
  mockGetSession.mockReset().mockResolvedValue(FAKE_SESSION)
  mockFrom.mockClear()
})

describe('pullRemoteChanges — not logged in', () => {
  it('no-ops and writes nothing locally', async () => {
    setRemote('kotoba_cards', [{ item_id: 'v1', item_type: 'vocab', updated_at: '2026-01-01T00:00:00.000Z' }])
    mockGetSession.mockResolvedValue({ data: { session: null } })

    await pullRemoteChanges()

    expect(mockFrom).not.toHaveBeenCalled()
    expect(await db.cards.count()).toBe(0)
  })
})

describe('a. empty local, remote has data — new-device restore', () => {
  it('cards: writes a matching local row with updatedAt from remote', async () => {
    setRemote('kotoba_cards', [
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
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ])

    await pullRemoteChanges()

    const local = await db.cards.get(['vocab', 'v1'])
    expect(local).toMatchObject({ itemId: 'v1', itemType: 'vocab', level: 'N5', stability: 1, suspended: false })
    expect(local!.updatedAt).toEqual(new Date('2026-01-01T00:00:00.000Z'))
  })

  it('reviewLogs: writes a new local row keyed by remoteId', async () => {
    setRemote('kotoba_review_logs', [
      {
        id: 'log-uuid-1',
        item_id: 'v1',
        item_type: 'vocab',
        rating: 3,
        state: 1,
        due: '2026-01-02T00:00:00.000Z',
        stability: 1,
        difficulty: 2,
        scheduled_days: 1,
        learning_steps: 0,
        review: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ])

    await pullRemoteChanges()

    const local = await db.reviewLogs.where('remoteId').equals('log-uuid-1').first()
    expect(local).toMatchObject({ remoteId: 'log-uuid-1', itemId: 'v1', rating: 3 })
  })

  it('queuedItems: writes a matching local row', async () => {
    setRemote('kotoba_queued_items', [{ item_id: 'v1', item_type: 'vocab', level: 'N3', added_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' }])

    await pullRemoteChanges()

    const local = await db.queuedItems.get(['vocab', 'v1'])
    expect(local).toMatchObject({ itemId: 'v1', itemType: 'vocab', level: 'N3' })
  })

  it('notes: writes a matching local row', async () => {
    setRemote('kotoba_notes', [{ item_id: 'v1', item_type: 'vocab', text: '筆記內容', updated_at: '2026-01-01T00:00:00.000Z' }])

    await pullRemoteChanges()

    const local = await db.notes.get(['vocab', 'v1'])
    expect(local).toMatchObject({ itemId: 'v1', itemType: 'vocab', text: '筆記內容' })
  })

  it('standaloneNotes: creates a new local row keyed by remoteId', async () => {
    setRemote('kotoba_standalone_notes', [{ id: 'note-uuid-1', title: '標題', text: '內文', updated_at: '2026-01-01T00:00:00.000Z' }])

    await pullRemoteChanges()

    const local = await db.standaloneNotes.where('remoteId').equals('note-uuid-1').first()
    expect(local).toMatchObject({ remoteId: 'note-uuid-1', title: '標題', text: '內文' })
  })

  it('settings: writes a matching local row', async () => {
    setRemote('kotoba_settings', [{ key: 'theme', value: 2, updated_at: '2026-01-01T00:00:00.000Z' }])

    await pullRemoteChanges()

    const local = await db.settings.get('theme')
    expect(local).toMatchObject({ key: 'theme', value: 2 })
  })
})

describe('b. local newer than remote — local preserved', () => {
  it('cards: keeps local content and local updatedAt untouched', async () => {
    const localUpdatedAt = new Date('2026-01-05T00:00:00.000Z')
    await db.cards.put({
      itemId: 'v1',
      itemType: 'vocab',
      level: 'N5',
      due: new Date('2026-01-05T00:00:00.000Z'),
      stability: 99,
      difficulty: 2,
      elapsed_days: 0,
      scheduled_days: 1,
      learning_steps: 0,
      reps: 5,
      lapses: 0,
      state: 2,
      suspended: false,
      updatedAt: localUpdatedAt,
    })
    setRemote('kotoba_cards', [
      {
        item_id: 'v1',
        item_type: 'vocab',
        level: 'N5',
        due: '2026-01-01T00:00:00.000Z',
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
        updated_at: '2026-01-01T00:00:00.000Z', // older than local
      },
    ])

    await pullRemoteChanges()

    const local = await db.cards.get(['vocab', 'v1'])
    expect(local!.stability).toBe(99)
    expect(local!.updatedAt).toEqual(localUpdatedAt)
  })

  it('standaloneNotes: keeps local content untouched', async () => {
    const localUpdatedAt = new Date('2026-01-05T00:00:00.000Z')
    const id = await db.standaloneNotes.add({ remoteId: 'note-uuid-1', title: '本地標題', text: '本地內文', updatedAt: localUpdatedAt })
    setRemote('kotoba_standalone_notes', [{ id: 'note-uuid-1', title: '雲端標題', text: '雲端內文', updated_at: '2026-01-01T00:00:00.000Z' }])

    await pullRemoteChanges()

    const local = await db.standaloneNotes.get(id)
    expect(local).toMatchObject({ title: '本地標題', text: '本地內文' })
  })
})

describe('c. local older than remote — overwritten with remote content', () => {
  it('cards: local content and updatedAt become the remote values', async () => {
    await db.cards.put({
      itemId: 'v1',
      itemType: 'vocab',
      level: 'N5',
      due: new Date('2026-01-01T00:00:00.000Z'),
      stability: 1,
      difficulty: 2,
      elapsed_days: 0,
      scheduled_days: 1,
      learning_steps: 0,
      reps: 1,
      lapses: 0,
      state: 1,
      suspended: false,
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    })
    setRemote('kotoba_cards', [
      {
        item_id: 'v1',
        item_type: 'vocab',
        level: 'N5',
        due: '2026-01-05T00:00:00.000Z',
        stability: 99,
        difficulty: 3,
        elapsed_days: 4,
        scheduled_days: 4,
        learning_steps: 0,
        reps: 5,
        lapses: 1,
        state: 2,
        last_review: '2026-01-04T00:00:00.000Z',
        suspended: true,
        updated_at: '2026-01-05T00:00:00.000Z', // newer than local
      },
    ])

    await pullRemoteChanges()

    const local = await db.cards.get(['vocab', 'v1'])
    expect(local).toMatchObject({ stability: 99, difficulty: 3, suspended: true })
    expect(local!.updatedAt).toEqual(new Date('2026-01-05T00:00:00.000Z'))
  })

  it('standaloneNotes: overwrites in place, keeping the same local id', async () => {
    const localId = await db.standaloneNotes.add({ remoteId: 'note-uuid-1', title: '舊標題', text: '舊內文', updatedAt: new Date('2026-01-01T00:00:00.000Z') })
    setRemote('kotoba_standalone_notes', [{ id: 'note-uuid-1', title: '新標題', text: '新內文', updated_at: '2026-01-05T00:00:00.000Z' }])

    await pullRemoteChanges()

    const local = await db.standaloneNotes.get(localId)
    expect(local).toMatchObject({ id: localId, remoteId: 'note-uuid-1', title: '新標題', text: '新內文' })
    expect(await db.standaloneNotes.count()).toBe(1) // overwritten in place, not duplicated
  })
})

describe('d. remote missing a key that local has — local row is never deleted', () => {
  it('cards: the local-only row survives a pull untouched', async () => {
    await db.cards.put({
      itemId: 'v2',
      itemType: 'vocab',
      level: 'N5',
      due: new Date('2026-01-01T00:00:00.000Z'),
      stability: 1,
      difficulty: 2,
      elapsed_days: 0,
      scheduled_days: 1,
      learning_steps: 0,
      reps: 1,
      lapses: 0,
      state: 1,
      suspended: false,
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    })
    setRemote('kotoba_cards', []) // cloud has nothing at all — e.g. v2 was created locally but never pushed yet

    await pullRemoteChanges()

    expect(await db.cards.get(['vocab', 'v2'])).toBeDefined()
    expect(await db.cards.count()).toBe(1)
  })
})

describe('e. reviewLogs — dedupe by remoteId', () => {
  it('does not duplicate a row that already exists locally', async () => {
    await db.reviewLogs.add({
      remoteId: 'log-uuid-1',
      itemId: 'v1',
      itemType: 'vocab',
      rating: 3,
      state: 1,
      due: new Date('2026-01-01T00:00:00.000Z'),
      stability: 1,
      difficulty: 2,
      scheduled_days: 1,
      learning_steps: 0,
      review: new Date('2026-01-01T00:00:00.000Z'),
    })
    setRemote('kotoba_review_logs', [
      {
        id: 'log-uuid-1',
        item_id: 'v1',
        item_type: 'vocab',
        rating: 3,
        state: 1,
        due: '2026-01-01T00:00:00.000Z',
        stability: 1,
        difficulty: 2,
        scheduled_days: 1,
        learning_steps: 0,
        review: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ])

    await pullRemoteChanges()

    expect(await db.reviewLogs.where('remoteId').equals('log-uuid-1').count()).toBe(1)
  })

  it('adds a genuinely new remoteId', async () => {
    await db.reviewLogs.add({
      remoteId: 'log-uuid-1',
      itemId: 'v1',
      itemType: 'vocab',
      rating: 3,
      state: 1,
      due: new Date('2026-01-01T00:00:00.000Z'),
      stability: 1,
      difficulty: 2,
      scheduled_days: 1,
      learning_steps: 0,
      review: new Date('2026-01-01T00:00:00.000Z'),
    })
    setRemote('kotoba_review_logs', [
      {
        id: 'log-uuid-2',
        item_id: 'v2',
        item_type: 'vocab',
        rating: 4,
        state: 1,
        due: '2026-01-02T00:00:00.000Z',
        stability: 1,
        difficulty: 2,
        scheduled_days: 1,
        learning_steps: 0,
        review: '2026-01-02T00:00:00.000Z',
        updated_at: '2026-01-02T00:00:00.000Z',
      },
    ])

    await pullRemoteChanges()

    expect(await db.reviewLogs.count()).toBe(2)
    expect(await db.reviewLogs.where('remoteId').equals('log-uuid-2').first()).toBeDefined()
  })
})

describe('f. pull never enqueues a push — no pull→push loop', () => {
  it('the sync queue stays empty even though pull inserts and overwrites local rows', async () => {
    await db.cards.put({
      itemId: 'v1',
      itemType: 'vocab',
      level: 'N5',
      due: new Date('2026-01-01T00:00:00.000Z'),
      stability: 1,
      difficulty: 2,
      elapsed_days: 0,
      scheduled_days: 1,
      learning_steps: 0,
      reps: 1,
      lapses: 0,
      state: 1,
      suspended: false,
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    })
    setRemote('kotoba_cards', [
      {
        item_id: 'v1', // overwrite branch
        item_type: 'vocab',
        level: 'N5',
        due: '2026-01-05T00:00:00.000Z',
        stability: 5,
        difficulty: 2,
        elapsed_days: 0,
        scheduled_days: 1,
        learning_steps: 0,
        reps: 1,
        lapses: 0,
        state: 1,
        last_review: null,
        suspended: false,
        updated_at: '2026-01-05T00:00:00.000Z',
      },
      {
        item_id: 'v2', // insert branch
        item_type: 'vocab',
        level: 'N5',
        due: '2026-01-01T00:00:00.000Z',
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
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ])
    setRemote('kotoba_standalone_notes', [{ id: 'note-uuid-1', title: '標題', text: '內文', updated_at: '2026-01-01T00:00:00.000Z' }])

    expect(await db.syncQueue.count()).toBe(0)

    await pullRemoteChanges()

    // Confirm the pull actually did something (both branches exercised)…
    expect(await db.cards.get(['vocab', 'v1'])).toMatchObject({ stability: 5 })
    expect(await db.cards.get(['vocab', 'v2'])).toBeDefined()
    expect(await db.standaloneNotes.where('remoteId').equals('note-uuid-1').first()).toBeDefined()
    // …yet none of it got queued to push back out.
    expect(await db.syncQueue.count()).toBe(0)
  })
})

describe('g. pull is interrupted — resilience per table', () => {
  it("a failing table's local data is untouched, other tables still succeed, and the call itself does not throw", async () => {
    await db.notes.put({ itemType: 'vocab', itemId: 'v9', text: '不會被動到', updatedAt: new Date('2026-01-01T00:00:00.000Z') })
    setRemoteError('kotoba_notes') // this table's fetch fails
    setRemote('kotoba_cards', [
      {
        item_id: 'v1',
        item_type: 'vocab',
        level: 'N5',
        due: '2026-01-01T00:00:00.000Z',
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
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ])

    await expect(pullRemoteChanges()).resolves.toBeUndefined()

    // cards (unaffected table) still pulled successfully.
    expect(await db.cards.get(['vocab', 'v1'])).toBeDefined()
    // notes (the failing table) is completely unchanged, not partially written.
    const note = await db.notes.get(['vocab', 'v9'])
    expect(note).toMatchObject({ text: '不會被動到' })
    expect(await db.notes.count()).toBe(1)
  })
})

describe('equal updated_at — tie goes to local, no overwrite', () => {
  it('cards: an identical timestamp does not overwrite local content', async () => {
    const tiedAt = new Date('2026-01-03T00:00:00.000Z')
    await db.cards.put({
      itemId: 'v1',
      itemType: 'vocab',
      level: 'N5',
      due: new Date('2026-01-01T00:00:00.000Z'),
      stability: 42, // distinguishing value — would change if pull overwrote it
      difficulty: 2,
      elapsed_days: 0,
      scheduled_days: 1,
      learning_steps: 0,
      reps: 1,
      lapses: 0,
      state: 1,
      suspended: false,
      updatedAt: tiedAt,
    })
    setRemote('kotoba_cards', [
      {
        item_id: 'v1',
        item_type: 'vocab',
        level: 'N5',
        due: '2026-01-01T00:00:00.000Z',
        stability: 1, // different from local — would prove an overwrite happened
        difficulty: 2,
        elapsed_days: 0,
        scheduled_days: 1,
        learning_steps: 0,
        reps: 1,
        lapses: 0,
        state: 1,
        last_review: null,
        suspended: false,
        updated_at: tiedAt.toISOString(), // exactly equal to local
      },
    ])

    await pullRemoteChanges()

    const local = await db.cards.get(['vocab', 'v1'])
    expect(local!.stability).toBe(42) // untouched — remote's differing content never applied
  })
})

describe('same-data pull — the most important safety check', () => {
  it('pulling identical remote data back does not duplicate or lose anything, across all six tables', async () => {
    const t = '2026-01-01T00:00:00.000Z'
    await db.cards.put({
      itemId: 'v1',
      itemType: 'vocab',
      level: 'N5',
      due: new Date(t),
      stability: 1,
      difficulty: 2,
      elapsed_days: 0,
      scheduled_days: 1,
      learning_steps: 0,
      reps: 1,
      lapses: 0,
      state: 1,
      suspended: false,
      updatedAt: new Date(t),
    })
    await db.queuedItems.put({ itemId: 'v2', itemType: 'vocab', level: 'N3', addedAt: new Date(t) })
    await db.notes.put({ itemId: 'v1', itemType: 'vocab', text: '筆記', updatedAt: new Date(t) })
    await db.settings.put({ key: 'theme', value: 2, updatedAt: new Date(t) })
    const noteId = await db.standaloneNotes.add({ remoteId: 'note-uuid-1', title: '標題', text: '內文', updatedAt: new Date(t) })
    await db.reviewLogs.add({
      remoteId: 'log-uuid-1',
      itemId: 'v1',
      itemType: 'vocab',
      rating: 3,
      state: 1,
      due: new Date(t),
      stability: 1,
      difficulty: 2,
      scheduled_days: 1,
      learning_steps: 0,
      review: new Date(t),
    })

    setRemote('kotoba_cards', [{ item_id: 'v1', item_type: 'vocab', level: 'N5', due: t, stability: 1, difficulty: 2, elapsed_days: 0, scheduled_days: 1, learning_steps: 0, reps: 1, lapses: 0, state: 1, last_review: null, suspended: false, updated_at: t }])
    setRemote('kotoba_queued_items', [{ item_id: 'v2', item_type: 'vocab', level: 'N3', added_at: t, updated_at: t }])
    setRemote('kotoba_notes', [{ item_id: 'v1', item_type: 'vocab', text: '筆記', updated_at: t }])
    setRemote('kotoba_settings', [{ key: 'theme', value: 2, updated_at: t }])
    setRemote('kotoba_standalone_notes', [{ id: 'note-uuid-1', title: '標題', text: '內文', updated_at: t }])
    setRemote('kotoba_review_logs', [{ id: 'log-uuid-1', item_id: 'v1', item_type: 'vocab', rating: 3, state: 1, due: t, stability: 1, difficulty: 2, scheduled_days: 1, learning_steps: 0, review: t, updated_at: t }])

    const before = {
      cards: await db.cards.count(),
      queuedItems: await db.queuedItems.count(),
      notes: await db.notes.count(),
      settings: await db.settings.count(),
      standaloneNotes: await db.standaloneNotes.count(),
      reviewLogs: await db.reviewLogs.count(),
    }

    await pullRemoteChanges()

    expect(await db.cards.count()).toBe(before.cards)
    expect(await db.queuedItems.count()).toBe(before.queuedItems)
    expect(await db.notes.count()).toBe(before.notes)
    expect(await db.settings.count()).toBe(before.settings)
    expect(await db.standaloneNotes.count()).toBe(before.standaloneNotes)
    expect(await db.reviewLogs.count()).toBe(before.reviewLogs)
    expect(await db.standaloneNotes.get(noteId)).toMatchObject({ title: '標題', text: '內文' })
    expect(await db.syncQueue.count()).toBe(0)
  })
})

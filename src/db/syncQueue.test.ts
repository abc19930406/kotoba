import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from './schema.ts'

// enqueueSync's scheduleSyncPush() side effect fires a real 5s debounce timer
// otherwise — irrelevant to what this file tests (the queue row itself), and
// would leave a dangling timer in every test that calls a write function.
vi.mock('../shared/syncEngine.ts', () => ({
  scheduleSyncPush: vi.fn(),
  pushNow: vi.fn(),
  initSyncEngine: vi.fn(),
}))

const { enqueueSync, compositeKey } = await import('./syncQueue.ts')

beforeEach(async () => {
  await db.syncQueue.clear()
})

describe('compositeKey', () => {
  it('joins itemType and itemId with a colon', () => {
    expect(compositeKey('vocab', 'v1')).toBe('vocab:v1')
  })
})

describe('enqueueSync', () => {
  it('writes a queue row with the given table/key/op', async () => {
    await enqueueSync('cards', 'vocab:v1', 'upsert')
    const rows = await db.syncQueue.toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ table: 'cards', key: 'vocab:v1', op: 'upsert' })
    expect(rows[0].queuedAt).toBeInstanceOf(Date)
  })

  it('does not dedupe — repeated enqueues for the same key each become their own row (coalescing happens at push time)', async () => {
    await enqueueSync('notes', 'vocab:v1', 'upsert')
    await enqueueSync('notes', 'vocab:v1', 'upsert')
    await enqueueSync('notes', 'vocab:v1', 'delete')
    const rows = await db.syncQueue.toArray()
    expect(rows).toHaveLength(3)
  })
})

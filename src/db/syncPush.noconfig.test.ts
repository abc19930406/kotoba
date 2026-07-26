import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from './schema.ts'

// Mirrors the real degraded state when VITE_SUPABASE_URL/ANON_KEY aren't
// configured — src/db/supabase.ts exports `supabase: null` in that case.
vi.mock('./supabase.ts', () => ({ supabase: null }))

const { pushPendingChanges } = await import('./syncPush.ts')

beforeEach(async () => {
  await db.syncQueue.clear()
})

describe('pushPendingChanges (Supabase not configured)', () => {
  it('resolves without throwing and leaves the queue untouched', async () => {
    await db.syncQueue.add({ table: 'cards', key: 'vocab:v1', op: 'upsert' })

    await expect(pushPendingChanges()).resolves.toBeUndefined()

    expect(await db.syncQueue.count()).toBe(1)
  })
})

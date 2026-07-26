import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from './schema.ts'

// Mirrors the real degraded state when VITE_SUPABASE_URL/ANON_KEY aren't
// configured — src/db/supabase.ts exports `supabase: null` in that case.
vi.mock('./supabase.ts', () => ({ supabase: null }))

const { pullRemoteChanges } = await import('./syncPull.ts')

beforeEach(async () => {
  await db.cards.clear()
})

describe('pullRemoteChanges (Supabase not configured)', () => {
  it('resolves without throwing and writes nothing locally', async () => {
    await expect(pullRemoteChanges()).resolves.toBeUndefined()
    expect(await db.cards.count()).toBe(0)
  })
})

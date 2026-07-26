import { describe, expect, it, vi } from 'vitest'

// Mirrors the real degraded state when VITE_SUPABASE_URL/ANON_KEY aren't
// configured — src/db/supabase.ts exports `supabase: null` in that case.
vi.mock('../db/supabase.ts', () => ({ supabase: null }))

const { initSyncEngine } = await import('./syncEngine.ts')

describe('initSyncEngine (Supabase not configured)', () => {
  it('does not throw when there is no client to subscribe to', () => {
    expect(() => initSyncEngine()).not.toThrow()
  })
})

import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

// When VITE_SUPABASE_URL/ANON_KEY aren't configured, src/db/supabase.ts
// exports `supabase: null` rather than throwing — this verifies the hook
// degrades to "always logged out" instead of crashing in that state.
vi.mock('../db/supabase.ts', () => ({ supabase: null }))

const { useAuthSession } = await import('./authSession.ts')

describe('useAuthSession (Supabase not configured)', () => {
  it('returns null without throwing when the client is unavailable', () => {
    const { result } = renderHook(() => useAuthSession())
    expect(result.current).toBeNull()
  })
})

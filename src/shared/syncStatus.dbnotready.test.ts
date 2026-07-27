import { describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

// Simulates a brand-new device whose IndexedDB schema migration hasn't
// finished (or fails outright) by the time refreshPendingCount runs — the
// real-world scenario that threw an uncaught NotFoundError on a genuinely
// fresh, incognito-window IndexedDB (Phase C4b bugfix). The rejection is
// pre-caught on a separate subscription purely to avoid a spurious
// "unhandled rejection" from this mock module itself, mirroring the same
// safety pattern src/db/schema.ts uses for the real dbReady export.
vi.mock('../db/schema.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../db/schema.ts')>()
  const rejected = Promise.reject(new Error('simulated: still mid-migration'))
  rejected.catch(() => {})
  return { ...actual, dbReady: rejected }
})

const { refreshPendingCount, useSyncStatus } = await import('./syncStatus.ts')

describe('refreshPendingCount — database not ready yet', () => {
  it('resolves without throwing instead of propagating the rejection', async () => {
    await expect(refreshPendingCount()).resolves.toBeUndefined()
  })
})

describe('useSyncStatus — database not ready yet', () => {
  it('settles on synced (pending count defaults to 0) instead of crashing', async () => {
    const { result } = renderHook(() => useSyncStatus())
    await waitFor(() => expect(result.current).toEqual({ kind: 'synced' }))
  })
})

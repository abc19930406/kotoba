import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// A brand-new device still running its first-ever schema migration when
// runSync/runPushOnly fire (Phase C4b bugfix scenario) — dbReady rejects
// for the whole file; every test below still passes, proving runSync's
// `await dbReady.catch(() => {})` genuinely swallows it rather than
// happening to work only because dbReady resolves in this test env.
// vi.hoisted (not a plain outer const) guarantees this is initialized
// before vi.mock's factory below ever runs, regardless of statement order.
const { mockDbReady } = vi.hoisted(() => {
  const rejected = Promise.reject(new Error('simulated: still mid-migration'))
  rejected.catch(() => {})
  return { mockDbReady: rejected }
})
vi.mock('../db/schema.ts', () => ({ dbReady: mockDbReady }))

const mockPullRemoteChanges = vi.fn(async () => {})
vi.mock('../db/syncPull.ts', () => ({ pullRemoteChanges: mockPullRemoteChanges }))

const mockDownloadPendingImages = vi.fn(async () => {})
vi.mock('../db/syncImageDownload.ts', () => ({ downloadPendingImages: mockDownloadPendingImages }))

const mockPushPendingChanges = vi.fn(async () => {})
vi.mock('../db/syncPush.ts', () => ({ pushPendingChanges: mockPushPendingChanges }))

const mockUploadPendingImages = vi.fn(async () => {})
vi.mock('../db/syncImageUpload.ts', () => ({ uploadPendingImages: mockUploadPendingImages }))

const mockOnAuthStateChange = vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } }))
vi.mock('../db/supabase.ts', () => ({
  supabase: { auth: { onAuthStateChange: mockOnAuthStateChange } },
}))

const { scheduleSyncPush, syncNow, initSyncEngine } = await import('./syncEngine.ts')

beforeEach(() => {
  mockPullRemoteChanges.mockClear().mockResolvedValue(undefined)
  mockDownloadPendingImages.mockClear().mockResolvedValue(undefined)
  mockPushPendingChanges.mockClear().mockResolvedValue(undefined)
  mockUploadPendingImages.mockClear().mockResolvedValue(undefined)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('scheduleSyncPush', () => {
  it('debounces repeated calls into a single push', async () => {
    vi.useFakeTimers()
    scheduleSyncPush()
    scheduleSyncPush()
    scheduleSyncPush()

    await vi.advanceTimersByTimeAsync(5000)

    expect(mockPushPendingChanges).toHaveBeenCalledTimes(1)
  })

  it('never pulls or downloads images — the debounced after-write trigger is push-only', async () => {
    vi.useFakeTimers()
    scheduleSyncPush()

    await vi.advanceTimersByTimeAsync(5000)

    expect(mockPullRemoteChanges).not.toHaveBeenCalled()
    expect(mockDownloadPendingImages).not.toHaveBeenCalled()
    expect(mockPushPendingChanges).toHaveBeenCalledTimes(1)
  })

  it('uploads pending images too (Phase C4a) — text and image sync share one trigger', async () => {
    vi.useFakeTimers()
    scheduleSyncPush()

    await vi.advanceTimersByTimeAsync(5000)

    expect(mockUploadPendingImages).toHaveBeenCalledTimes(1)
  })
})

describe('syncNow', () => {
  it('pulls before pushing', async () => {
    const order: string[] = []
    mockPullRemoteChanges.mockImplementation(async () => {
      order.push('pull')
    })
    mockPushPendingChanges.mockImplementation(async () => {
      order.push('push')
    })

    syncNow()

    await vi.waitFor(() => expect(order).toEqual(['pull', 'push']))
  })

  it('still pushes even when pull fails', async () => {
    mockPullRemoteChanges.mockRejectedValue(new Error('network down'))

    syncNow()

    await vi.waitFor(() => expect(mockPushPendingChanges).toHaveBeenCalledTimes(1))
  })

  it('downloads pending images after pull, then pushes, then uploads pending images', async () => {
    const order: string[] = []
    mockPullRemoteChanges.mockImplementation(async () => {
      order.push('pull')
    })
    mockDownloadPendingImages.mockImplementation(async () => {
      order.push('download')
    })
    mockPushPendingChanges.mockImplementation(async () => {
      order.push('push')
    })
    mockUploadPendingImages.mockImplementation(async () => {
      order.push('upload')
    })

    syncNow()

    await vi.waitFor(() => expect(order).toEqual(['pull', 'download', 'push', 'upload']))
  })

  it('still pushes even when downloading images fails', async () => {
    mockDownloadPendingImages.mockRejectedValue(new Error('network down'))

    syncNow()

    await vi.waitFor(() => expect(mockPushPendingChanges).toHaveBeenCalledTimes(1))
  })

  it('skips a concurrent call while a sync is already in flight', async () => {
    let resolvePush: () => void = () => {}
    mockPushPendingChanges.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolvePush = resolve
        }),
    )

    syncNow()
    syncNow()

    // syncNow() only synchronously sets the `syncing` flag before its first
    // await — pushPendingChanges() itself isn't actually invoked (and
    // resolvePush reassigned from its no-op default) until a few microtasks
    // later. Resolving before that point would resolve the wrong (stale,
    // never-awaited) closure value, permanently hanging this call's
    // runSync() and leaking a stuck `syncing = true` into later tests.
    await vi.waitFor(() => expect(mockPushPendingChanges).toHaveBeenCalledTimes(1))
    resolvePush()
  })
})

describe('syncNow / scheduleSyncPush — database not ready yet', () => {
  it('syncNow still pushes even though dbReady rejects for the whole file', async () => {
    syncNow()
    await vi.waitFor(() => expect(mockPushPendingChanges).toHaveBeenCalledTimes(1))
  })

  it('scheduleSyncPush still pushes even though dbReady rejects for the whole file', async () => {
    vi.useFakeTimers()
    scheduleSyncPush()

    await vi.advanceTimersByTimeAsync(5000)

    expect(mockPushPendingChanges).toHaveBeenCalledTimes(1)
  })
})

describe('initSyncEngine', () => {
  it('is idempotent — subscribes to auth state changes only once', () => {
    initSyncEngine()
    initSyncEngine()
    expect(mockOnAuthStateChange).toHaveBeenCalledTimes(1)
  })
})

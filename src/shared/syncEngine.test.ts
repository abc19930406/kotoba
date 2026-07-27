import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockPullRemoteChanges = vi.fn(async () => {})
vi.mock('../db/syncPull.ts', () => ({ pullRemoteChanges: mockPullRemoteChanges }))

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

  it('never pulls — the debounced after-write trigger is push-only', async () => {
    vi.useFakeTimers()
    scheduleSyncPush()

    await vi.advanceTimersByTimeAsync(5000)

    expect(mockPullRemoteChanges).not.toHaveBeenCalled()
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

  it('uploads pending images after pull and push', async () => {
    const order: string[] = []
    mockPullRemoteChanges.mockImplementation(async () => {
      order.push('pull')
    })
    mockPushPendingChanges.mockImplementation(async () => {
      order.push('push')
    })
    mockUploadPendingImages.mockImplementation(async () => {
      order.push('upload')
    })

    syncNow()

    await vi.waitFor(() => expect(order).toEqual(['pull', 'push', 'upload']))
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
    resolvePush()

    await vi.waitFor(() => expect(mockPushPendingChanges).toHaveBeenCalledTimes(1))
  })
})

describe('initSyncEngine', () => {
  it('is idempotent — subscribes to auth state changes only once', () => {
    initSyncEngine()
    initSyncEngine()
    expect(mockOnAuthStateChange).toHaveBeenCalledTimes(1)
  })
})

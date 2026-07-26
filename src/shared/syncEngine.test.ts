import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockPushPendingChanges = vi.fn(async (): Promise<'no-op' | 'reached' | 'unreachable'> => 'reached')
vi.mock('../db/syncPush.ts', () => ({ pushPendingChanges: mockPushPendingChanges }))

const mockReportPushOutcome = vi.fn()
vi.mock('./syncStatus.ts', () => ({
  setSyncing: vi.fn(),
  refreshPendingCount: vi.fn(async () => {}),
  reportPushOutcome: mockReportPushOutcome,
}))

const mockOnAuthStateChange = vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } }))
vi.mock('../db/supabase.ts', () => ({
  supabase: { auth: { onAuthStateChange: mockOnAuthStateChange } },
}))

const { scheduleSyncPush, pushNow, initSyncEngine } = await import('./syncEngine.ts')

beforeEach(() => {
  mockPushPendingChanges.mockClear().mockResolvedValue('reached')
  mockReportPushOutcome.mockClear()
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
})

describe('pushNow', () => {
  it('triggers a push immediately', async () => {
    pushNow()
    await vi.waitFor(() => expect(mockPushPendingChanges).toHaveBeenCalledTimes(1))
  })

  it('skips a concurrent call while a push is already in flight', async () => {
    let resolvePush: (outcome: 'reached') => void = () => {}
    mockPushPendingChanges.mockImplementation(
      () =>
        new Promise<'reached'>((resolve) => {
          resolvePush = resolve
        }),
    )

    pushNow()
    pushNow()
    resolvePush('reached')

    await vi.waitFor(() => expect(mockPushPendingChanges).toHaveBeenCalledTimes(1))
  })

  it('reports the push outcome to syncStatus', async () => {
    mockPushPendingChanges.mockResolvedValue('unreachable')

    pushNow()

    await vi.waitFor(() => expect(mockReportPushOutcome).toHaveBeenCalledWith('unreachable'))
  })
})

describe('initSyncEngine', () => {
  it('is idempotent — subscribes to auth state changes only once', () => {
    initSyncEngine()
    initSyncEngine()
    expect(mockOnAuthStateChange).toHaveBeenCalledTimes(1)
  })
})

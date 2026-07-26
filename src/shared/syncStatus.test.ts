import { beforeEach, describe, expect, it } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { db } from '../db/schema.ts'
import { useSyncStatus, setSyncing, reportPushOutcome } from './syncStatus.ts'

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { value, configurable: true })
}

beforeEach(async () => {
  await db.syncQueue.clear()
  setOnline(true)
  setSyncing(false)
  reportPushOutcome('reached') // reset the last-push-unreachable fallback signal between tests
})

describe('useSyncStatus', () => {
  it('reports synced when the queue is empty', async () => {
    const { result } = renderHook(() => useSyncStatus())
    await waitFor(() => expect(result.current).toEqual({ kind: 'synced' }))
  })

  it('reports pending with the queue count', async () => {
    await db.syncQueue.add({ table: 'cards', key: 'vocab:v1', op: 'upsert', queuedAt: new Date() })
    const { result } = renderHook(() => useSyncStatus())
    await waitFor(() => expect(result.current).toEqual({ kind: 'pending', count: 1 }))
  })

  it('reports syncing when setSyncing(true) is called', async () => {
    const { result } = renderHook(() => useSyncStatus())
    await waitFor(() => expect(result.current).toEqual({ kind: 'synced' }))

    act(() => setSyncing(true))

    expect(result.current).toEqual({ kind: 'syncing' })
  })

  it('reports offline when navigator.onLine is false, taking priority over pending/syncing', async () => {
    await db.syncQueue.add({ table: 'cards', key: 'vocab:v1', op: 'upsert', queuedAt: new Date() })
    setOnline(false)
    const { result } = renderHook(() => useSyncStatus())
    await waitFor(() => expect(result.current).toEqual({ kind: 'offline' }))
  })

  it('reacts to the browser online/offline events', async () => {
    const { result } = renderHook(() => useSyncStatus())
    await waitFor(() => expect(result.current).toEqual({ kind: 'synced' }))

    act(() => {
      setOnline(false)
      window.dispatchEvent(new Event('offline'))
    })
    expect(result.current).toEqual({ kind: 'offline' })

    act(() => {
      setOnline(true)
      window.dispatchEvent(new Event('online'))
    })
    expect(result.current).toEqual({ kind: 'synced' })
  })
})

describe('reportPushOutcome — fallback offline signal for when navigator.onLine lies', () => {
  it('shows offline when a push comes back unreachable, even though navigator.onLine still says true', async () => {
    const { result } = renderHook(() => useSyncStatus())
    await waitFor(() => expect(result.current).toEqual({ kind: 'synced' }))

    act(() => reportPushOutcome('unreachable'))

    expect(result.current).toEqual({ kind: 'offline' })
    expect(navigator.onLine).toBe(true) // the browser flag never budged — this is the whole point of the fallback
  })

  it('clears back to synced once a push reaches the server again', async () => {
    const { result } = renderHook(() => useSyncStatus())
    act(() => reportPushOutcome('unreachable'))
    expect(result.current).toEqual({ kind: 'offline' })

    act(() => reportPushOutcome('reached'))

    expect(result.current).toEqual({ kind: 'synced' })
  })

  it('a no-op outcome does not change the current status', async () => {
    const { result } = renderHook(() => useSyncStatus())
    act(() => reportPushOutcome('unreachable'))
    expect(result.current).toEqual({ kind: 'offline' })

    act(() => reportPushOutcome('no-op'))

    expect(result.current).toEqual({ kind: 'offline' }) // unchanged — no-op carries no connectivity information
  })
})

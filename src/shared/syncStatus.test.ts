import { beforeEach, describe, expect, it } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { db } from '../db/schema.ts'
import { useSyncStatus, setSyncing } from './syncStatus.ts'

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { value, configurable: true })
}

beforeEach(async () => {
  await db.syncQueue.clear()
  setOnline(true)
  setSyncing(false)
})

describe('useSyncStatus', () => {
  it('reports synced when the queue is empty', async () => {
    const { result } = renderHook(() => useSyncStatus())
    await waitFor(() => expect(result.current).toEqual({ kind: 'synced' }))
  })

  it('reports pending with the queue count', async () => {
    await db.syncQueue.add({ table: 'cards', key: 'vocab:v1', op: 'upsert' })
    const { result } = renderHook(() => useSyncStatus())
    await waitFor(() => expect(result.current).toEqual({ kind: 'pending', count: 1 }))
  })

  it('reports syncing when setSyncing(true) is called', async () => {
    const { result } = renderHook(() => useSyncStatus())
    await waitFor(() => expect(result.current).toEqual({ kind: 'synced' }))

    act(() => setSyncing(true))

    expect(result.current).toEqual({ kind: 'syncing' })
  })

  it('shows the pending count, not offline, when the queue is non-empty and navigator.onLine is false', async () => {
    // A failed push leaves items queued either way — the growing/stuck
    // count already tells the user something isn't syncing, so a non-empty
    // queue always wins over the offline label rather than showing both.
    await db.syncQueue.add({ table: 'cards', key: 'vocab:v1', op: 'upsert' })
    setOnline(false)
    const { result } = renderHook(() => useSyncStatus())
    await waitFor(() => expect(result.current).toEqual({ kind: 'pending', count: 1 }))
  })

  it('falls back to offline only once the queue is empty', async () => {
    setOnline(false)
    const { result } = renderHook(() => useSyncStatus())
    await waitFor(() => expect(result.current).toEqual({ kind: 'offline' }))
  })

  it('reacts to the browser online/offline events when the queue is empty', async () => {
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

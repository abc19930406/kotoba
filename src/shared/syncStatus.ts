import { useEffect, useState } from 'react'
import { db } from '../db/schema.ts'
import type { PushOutcome } from '../db/syncPush.ts'

export type SyncStatus = { kind: 'syncing' } | { kind: 'pending'; count: number } | { kind: 'synced' } | { kind: 'offline' }

let syncing = false
let pendingCount = 0
// navigator.onLine / the online-offline events aren't reliable everywhere
// (notably iOS Safari can lag or miss the transition) — this is the
// fallback signal from the last real push attempt. Starts `false` (assume
// reachable) so a fresh page load doesn't show "離線" before any push has
// even been attempted.
let lastPushUnreachable = false
const listeners = new Set<() => void>()

function computeStatus(): SyncStatus {
  if (!navigator.onLine || lastPushUnreachable) return { kind: 'offline' }
  if (syncing) return { kind: 'syncing' }
  if (pendingCount > 0) return { kind: 'pending', count: pendingCount }
  return { kind: 'synced' }
}

function notify(): void {
  for (const listener of listeners) listener()
}

export function setSyncing(value: boolean): void {
  syncing = value
  notify()
}

/** Called after every push attempt (src/shared/syncEngine.ts) with what src/db/syncPush.ts's pushPendingChanges() actually observed. */
export function reportPushOutcome(outcome: PushOutcome): void {
  if (outcome === 'no-op') return // tells us nothing about connectivity either way
  lastPushUnreachable = outcome === 'unreachable'
  notify()
}

export async function refreshPendingCount(): Promise<void> {
  pendingCount = await db.syncQueue.count()
  notify()
}

/** Reactive sync status for display — see src/db/syncPush.ts / src/shared/syncEngine.ts for what drives it. */
export function useSyncStatus(): SyncStatus {
  const [status, setStatus] = useState<SyncStatus>(computeStatus)

  useEffect(() => {
    const listener = () => setStatus(computeStatus())
    listeners.add(listener)
    void refreshPendingCount()
    window.addEventListener('online', listener)
    window.addEventListener('offline', listener)
    return () => {
      listeners.delete(listener)
      window.removeEventListener('online', listener)
      window.removeEventListener('offline', listener)
    }
  }, [])

  return status
}

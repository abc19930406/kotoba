import { useEffect, useState } from 'react'
import { db, dbReady } from '../db/schema.ts'

export type SyncStatus = { kind: 'syncing' } | { kind: 'pending'; count: number } | { kind: 'synced' } | { kind: 'offline' }

let syncing = false
let pendingCount = 0
const listeners = new Set<() => void>()

/**
 * Pending count takes priority over the offline label: a non-empty queue
 * already tells the user something isn't syncing (whether that's because
 * they're offline or some other push failure) — no need for a separate
 * "離線" state to also fire, and it means a failed push is always visible as
 * a stuck/growing count rather than silently swallowed by the offline check.
 * navigator.onLine only gets consulted once the queue is empty — it isn't
 * reliable everywhere (notably iOS Safari can lag or miss the transition),
 * so this is deliberately best-effort: an empty queue while genuinely
 * offline may still show "已同步", which is fine since nothing's at risk.
 */
function computeStatus(): SyncStatus {
  if (syncing) return { kind: 'syncing' }
  if (pendingCount > 0) return { kind: 'pending', count: pendingCount }
  if (!navigator.onLine) return { kind: 'offline' }
  return { kind: 'synced' }
}

function notify(): void {
  for (const listener of listeners) listener()
}

export function setSyncing(value: boolean): void {
  syncing = value
  notify()
}

/**
 * "N 筆待同步" is one merged number covering both the text outbox
 * (`syncQueue`) and images still waiting to upload (Phase C4a) — reporting
 * them as two separate counts would just raise "what's the difference"
 * questions without telling the user anything more actionable than "not
 * everything is synced yet".
 *
 * Called unconditionally on every HomePage mount (via useSyncStatus below),
 * regardless of login state — unlike pull/push/upload/download, there's no
 * "not logged in" guard to naturally delay this past the db's first-ever
 * open. Awaits dbReady explicitly and defaults to 0 on any failure (a
 * brand-new device still mid-migration, or anything else) rather than
 * throwing — a background status probe should never crash the app (Phase
 * C4b bugfix: this threw NotFoundError on a genuinely fresh IndexedDB).
 */
export async function refreshPendingCount(): Promise<void> {
  try {
    await dbReady
    const [queueCount, pendingImages] = await Promise.all([
      db.syncQueue.count(),
      db.noteImages.filter((img) => img.storagePath === undefined).count(),
    ])
    pendingCount = queueCount + pendingImages
  } catch {
    pendingCount = 0
  }
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

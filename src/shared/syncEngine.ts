import { supabase } from '../db/supabase.ts'
import { pushPendingChanges } from '../db/syncPush.ts'
import { setSyncing, refreshPendingCount } from './syncStatus.ts'

const DEBOUNCE_MS = 5000

let debounceTimer: ReturnType<typeof setTimeout> | null = null
let pushing = false
let initialized = false

async function runPush(): Promise<void> {
  if (pushing) return
  pushing = true
  setSyncing(true)
  try {
    await pushPendingChanges()
  } finally {
    pushing = false
    setSyncing(false)
    await refreshPendingCount()
  }
}

/** Push immediately (app startup / login / back to foreground / back online). */
export function pushNow(): void {
  void runPush()
}

/** Push after a short quiet period — multiple writes in quick succession only trigger one push. Called from src/db/syncQueue.ts's enqueueSync(). */
export function scheduleSyncPush(): void {
  void refreshPendingCount()
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    void runPush()
  }, DEBOUNCE_MS)
}

/**
 * Wires up the automatic push triggers. Idempotent — safe to call from
 * App.tsx's mount effect even under React StrictMode's double-invoke.
 * No-ops entirely when Supabase isn't configured (matches src/db/supabase.ts
 * and src/db/syncPush.ts's null-safety — nothing to push to, nothing to
 * listen for).
 */
export function initSyncEngine(): void {
  if (initialized) return
  initialized = true
  if (!supabase) return

  // Covers both "app just started and session finished resolving" and
  // "user just logged in" — without this, pre-existing local data would
  // only start pushing on the next write or foreground return, not promptly
  // after login.
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session) pushNow()
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') pushNow()
  })
  window.addEventListener('online', () => pushNow())
}

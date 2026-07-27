import { supabase } from '../db/supabase.ts'
import { pullRemoteChanges } from '../db/syncPull.ts'
import { downloadPendingImages } from '../db/syncImageDownload.ts'
import { pushPendingChanges } from '../db/syncPush.ts'
import { uploadPendingImages } from '../db/syncImageUpload.ts'
import { setSyncing, refreshPendingCount } from './syncStatus.ts'

const DEBOUNCE_MS = 5000

let debounceTimer: ReturnType<typeof setTimeout> | null = null
let syncing = false
let initialized = false

/** Pull text, then download pending images (Phase C4b — the freshly-pulled note rows give the download step its prefixes in the same pass), then push, then upload pending images. Pull/download failures don't block push: both already retry safely on their own on the next trigger, and push has its own independent safety regardless of whether they succeeded. */
async function runSync(): Promise<void> {
  if (syncing) return
  syncing = true
  setSyncing(true)
  try {
    await pullRemoteChanges().catch(() => {})
    await downloadPendingImages().catch(() => {})
    await pushPendingChanges()
    await uploadPendingImages()
  } finally {
    syncing = false
    setSyncing(false)
    await refreshPendingCount()
  }
}

/** Push text + upload pending images — no pull. Used by the debounced after-write trigger, where the only goal is getting *this* write up promptly; pulling isn't relevant to that and would just be extra network cost. */
async function runPushOnly(): Promise<void> {
  if (syncing) return
  syncing = true
  setSyncing(true)
  try {
    await pushPendingChanges()
    await uploadPendingImages()
  } finally {
    syncing = false
    setSyncing(false)
    await refreshPendingCount()
  }
}

/** Full sync (pull then push) immediately — app startup / login / back to foreground / back online. */
export function syncNow(): void {
  void runSync()
}

/** Push after a short quiet period — multiple writes in quick succession only trigger one push. Called from src/db/syncQueue.ts's enqueueSync(). */
export function scheduleSyncPush(): void {
  void refreshPendingCount()
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    void runPushOnly()
  }, DEBOUNCE_MS)
}

/**
 * Wires up the automatic sync triggers. Idempotent — safe to call from
 * App.tsx's mount effect even under React StrictMode's double-invoke.
 * No-ops entirely when Supabase isn't configured (matches src/db/supabase.ts
 * and src/db/syncPush.ts's null-safety — nothing to sync with, nothing to
 * listen for).
 */
export function initSyncEngine(): void {
  if (initialized) return
  initialized = true
  if (!supabase) return

  // Covers both "app just started and session finished resolving" and
  // "user just logged in" — without this, pre-existing local data would
  // only start syncing on the next write or foreground return, not promptly
  // after login.
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session) syncNow()
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncNow()
  })
  window.addEventListener('online', () => syncNow())
}

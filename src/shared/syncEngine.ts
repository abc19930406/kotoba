import { dbReady } from '../db/schema.ts'
import { supabase } from '../db/supabase.ts'
import { pullRemoteChanges } from '../db/syncPull.ts'
import { downloadPendingImages } from '../db/syncImageDownload.ts'
import { applyImageDeletions } from '../db/syncImageDelete.ts'
import { pushPendingChanges } from '../db/syncPush.ts'
import { uploadPendingImages } from '../db/syncImageUpload.ts'
import { setSyncing, refreshPendingCount } from './syncStatus.ts'

const DEBOUNCE_MS = 5000

let debounceTimer: ReturnType<typeof setTimeout> | null = null
let syncing = false
let initialized = false

/**
 * Pull text, then download pending images (Phase C4b — the freshly-pulled
 * note rows give the download step its prefixes in the same pass), then
 * apply image-deletion tombstones (Phase C6 — deliberately AFTER download,
 * not before: an image that was just deleted on another device but whose
 * Storage object hadn't been removed yet could otherwise get freshly
 * downloaded by the step above and then never get cleaned up until the next
 * sync pass; running the tombstone check right after download catches that
 * in the same pass), then push, then upload pending images. Awaits dbReady
 * first (belt-and-suspenders for a device that's already logged in but
 * still running its first-ever schema migration, e.g. C5's "new device"
 * scenario) — a rejection there is swallowed since every step below already
 * guards/retries independently. Pull/download/deletion failures don't block
 * push: all three already retry safely on their own on the next trigger,
 * and push has its own independent safety regardless of whether they
 * succeeded.
 */
async function runSync(): Promise<void> {
  if (syncing) return
  syncing = true
  setSyncing(true)
  try {
    await dbReady.catch(() => {})
    await pullRemoteChanges().catch(() => {})
    await downloadPendingImages().catch(() => {})
    await applyImageDeletions().catch(() => {})
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
    await dbReady.catch(() => {})
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

  // iOS Safari/WebKit is documented as unreliable about firing
  // visibilitychange when a home-screen-installed (standalone) PWA resumes
  // from being backgrounded/app-switched — confirmed by a real-device field
  // report where sync only ever ran after a full close-and-reopen (which
  // re-triggers the onAuthStateChange fire above), never on a plain
  // switch-away-and-back. focus/pageshow are added as redundant, more
  // reliable signals for the same "we're back in the foreground" moment —
  // harmless if visibilitychange also fires for the same transition, since
  // syncNow()'s `syncing` guard already collapses overlapping calls.
  const triggerIfVisible = () => {
    if (document.visibilityState === 'visible') syncNow()
  }
  document.addEventListener('visibilitychange', triggerIfVisible)
  window.addEventListener('focus', triggerIfVisible)
  window.addEventListener('pageshow', triggerIfVisible)
  window.addEventListener('online', () => syncNow())
}

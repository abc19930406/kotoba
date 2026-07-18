type BackHandler = () => void

// Module-level, mirrors useScrollRestore.ts's scrollPositions Maps: survives
// component remounts within the app session, deliberately never persisted —
// a full page reload always starts at depth 0 (home), which is explicitly
// acceptable (no deep-link support).
const handlers: BackHandler[] = []
let listenerAttached = false

function handlePopState(event: PopStateEvent): void {
  const targetDepth = typeof event.state?.depth === 'number' ? event.state.depth : 0
  if (targetDepth === handlers.length - 1) {
    handlers.pop()?.()
    return
  }
  // Forward-navigated to a depth we have no handler for (e.g. a bfcache-
  // restored stale state). Forward-history reconstruction is out of scope —
  // converge the URL/history back to our real current depth without
  // touching the UI, so we don't leave a dangling mismatched entry above us.
  history.replaceState({ depth: handlers.length }, '')
}

function ensureListener(): void {
  if (listenerAttached) return
  listenerAttached = true
  window.addEventListener('popstate', handlePopState)
}

/**
 * Call when entering one layer of in-app navigation (opening a detail view,
 * switching to a sub-page, opening a confirm dialog). `onPop` performs
 * whatever state change your own in-app "back" button for this layer would
 * — it runs when the user returns to the entry below this one, via the
 * system back gesture/button or via `goBack()`.
 */
export function pushLayer(onPop: BackHandler): void {
  ensureListener()
  handlers.push(onPop)
  history.pushState({ depth: handlers.length }, '')
}

/**
 * For in-app "back"/"cancel" UI, so it behaves identically to the system
 * back gesture — call this instead of invoking your `onPop` handler
 * directly, otherwise the browser's history position and our handler stack
 * fall out of sync. No-op when nothing has been pushed (e.g. already home).
 */
export function goBack(): void {
  if (handlers.length === 0) return
  history.back()
}

/** Test-only: clears all pushed layers and detaches the listener so each test file starts from a clean slate — module state otherwise persists across `it()` blocks within the same file. */
export function resetBackStackForTests(): void {
  handlers.length = 0
  if (listenerAttached) {
    window.removeEventListener('popstate', handlePopState)
    listenerAttached = false
  }
}

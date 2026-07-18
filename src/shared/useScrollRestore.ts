import { useLayoutEffect } from 'react'

/**
 * Manually captures the current scroll position under `signature`. Callers
 * must call this synchronously, right before triggering any state change
 * that alters what's rendered (opening a detail view, switching level) —
 * by the time an effect could read window.scrollY, the DOM has already
 * changed to the new content and the browser may have clamped the scroll
 * offset, so capture has to happen imperatively at the exact transition
 * point, not reactively.
 */
export function saveScrollPosition(store: Map<string, number>, signature: string): void {
  store.set(signature, window.scrollY)
}

/**
 * Restores window.scrollY for a given browse-state `signature` when it
 * becomes active again, or resets to top for a signature never seen before
 * (a genuinely different state — level/search/filter changed, or nothing
 * was ever saved for it). `store` is expected to be a module-level Map so
 * it survives this component unmounting/remounting within the same app
 * session, without ever touching persistent storage.
 *
 * `active` should be false while a detail view (or anything else covering
 * the list) is showing — restoration is skipped in that case. `ready`
 * should reflect whether the list's data has actually finished loading, so
 * a lazy-loaded level doesn't get scrolled before it has any content.
 */
export function useScrollRestore(store: Map<string, number>, signature: string, ready: boolean, active: boolean): void {
  // Runs before paint so there's no visible flash at the wrong position.
  useLayoutEffect(() => {
    if (!active || !ready) return
    window.scrollTo(0, store.get(signature) ?? 0)
  }, [store, signature, ready, active])
}

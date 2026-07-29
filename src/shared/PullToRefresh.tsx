import { useEffect, useRef, useState, type ReactNode } from 'react'

const THRESHOLD = 80
const DEAD_ZONE = 10
const RESISTANCE = 0.5
const MAX_PULL = 100

interface PullToRefreshProps {
  onRefresh: () => Promise<void>
  children: ReactNode
}

/**
 * Touch-only pull-to-refresh: pulling down past `THRESHOLD` while already
 * scrolled to the very top of the page calls `onRefresh` (this project's
 * `syncNow()` composed with each page's own data-reload function — see
 * call sites). Never triggers on a mouse/desktop interaction — those simply
 * never fire touch events, so no separate device check is needed.
 *
 * Deliberately renders the indicator as a `position: fixed` overlay and
 * never applies a `transform` to any ancestor of `children` — this app has
 * several pages with a `position: sticky` filter bar
 * (`.vocab-browse-sticky-bar`), and transforming an ancestor to visually
 * "push the page down" while pulling would change that sticky element's
 * containing block, breaking its stick-to-viewport behavior. Rendering
 * `children` completely untouched (via a Fragment, no wrapping element at
 * all) sidesteps that entirely.
 */
export function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const armedRef = useRef(false)
  const startYRef = useRef(0)
  const pullRef = useRef(0)
  const refreshingRef = useRef(false)

  useEffect(() => {
    function handleTouchStart(e: TouchEvent) {
      armedRef.current = window.scrollY <= 0
      startYRef.current = e.touches[0]!.clientY
    }

    function handleTouchMove(e: TouchEvent) {
      if (!armedRef.current || window.scrollY > 0) return
      const deltaY = e.touches[0]!.clientY - startYRef.current
      if (deltaY <= DEAD_ZONE) {
        if (pullRef.current !== 0) {
          pullRef.current = 0
          setPull(0)
        }
        return
      }
      // Only once we're confident this is a deliberate pull (past the dead
      // zone) do we suppress the native gesture — iOS's own rubber-band
      // overscroll bounce would otherwise visually fight with our indicator.
      e.preventDefault()
      const next = Math.min(MAX_PULL, (deltaY - DEAD_ZONE) * RESISTANCE)
      pullRef.current = next
      setPull(next)
    }

    function handleTouchEnd() {
      armedRef.current = false
      const wasPastThreshold = pullRef.current >= THRESHOLD
      pullRef.current = 0
      setPull(0)
      // The `refreshing` state is only for the indicator's own UI — the
      // real de-duplication is syncEngine.ts's module-level `syncing` flag,
      // which syncNow()/runSync() already guard with. Re-entering here
      // while a refresh is in flight would just call onRefresh() again,
      // which resolves as a safe no-op rather than doing duplicate work.
      if (!wasPastThreshold || refreshingRef.current) return

      refreshingRef.current = true
      setRefreshing(true)
      void onRefresh().finally(() => {
        refreshingRef.current = false
        setRefreshing(false)
      })
    }

    window.addEventListener('touchstart', handleTouchStart, { passive: true })
    window.addEventListener('touchmove', handleTouchMove, { passive: false })
    window.addEventListener('touchend', handleTouchEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', handleTouchStart)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('touchend', handleTouchEnd)
    }
  }, [onRefresh])

  const label = refreshing ? '同步中…' : pull >= THRESHOLD ? '↑ 放開以同步' : '↓ 下拉以同步'

  return (
    <>
      {(pull > 0 || refreshing) && (
        <div className="pull-to-refresh-indicator" style={{ height: refreshing ? THRESHOLD : pull }}>
          {label}
        </div>
      )}
      {children}
    </>
  )
}

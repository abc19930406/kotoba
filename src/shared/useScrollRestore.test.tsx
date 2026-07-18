import { describe, expect, it, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import { saveScrollPosition, useScrollRestore } from './useScrollRestore.ts'

// jsdom doesn't implement window.scrollTo/scrollY, so this stands in a
// minimal, controllable model: scrollTo(x, y) updates a tracked value,
// and reading window.scrollY reflects it — matching real browser semantics
// closely enough to exercise the save/restore logic under test.
function mockScroll() {
  let y = 0
  window.scrollTo = ((_x: number, newY: number) => {
    y = newY
  }) as typeof window.scrollTo
  Object.defineProperty(window, 'scrollY', { configurable: true, get: () => y })
  return { setScrollY: (v: number) => (y = v) }
}

// Mirrors how the real browse pages use the hook: save() is called
// imperatively at the exact transition point (before the state change that
// alters what's rendered), matching handleSelectEntry/handleLevelChange.
function TestHarness({ store, ready = true }: { store: Map<string, number>; ready?: boolean }) {
  const [signature, setSignature] = useState('a')
  const [active, setActive] = useState(true)
  useScrollRestore(store, signature, ready, active)

  function goTo(next: string) {
    saveScrollPosition(store, signature)
    setSignature(next)
  }

  return (
    <div>
      <span data-testid="sig">{signature}</span>
      <button onClick={() => goTo('b')}>go-b</button>
      <button onClick={() => goTo('a')}>go-a</button>
      <button
        onClick={() => {
          saveScrollPosition(store, signature)
          setActive(false)
        }}
      >
        enter-detail
      </button>
      <button onClick={() => setActive(true)}>back-to-list</button>
    </div>
  )
}

describe('useScrollRestore', () => {
  let scroll: ReturnType<typeof mockScroll>
  let store: Map<string, number>

  beforeEach(() => {
    scroll = mockScroll()
    store = new Map()
  })

  it('restores the exact scroll position when returning from a detail view (same signature)', () => {
    render(<TestHarness store={store} />)
    scroll.setScrollY(800)
    fireEvent.click(screen.getByText('enter-detail')) // captures 800 under 'a'
    scroll.setScrollY(0) // simulates the detail page rendering at its own top
    fireEvent.click(screen.getByText('back-to-list')) // same signature 'a' becomes active again
    expect(window.scrollY).toBe(800)
  })

  it('does NOT restore — resets to top — when the signature changed (異狀態不還原)', () => {
    render(<TestHarness store={store} />)
    scroll.setScrollY(800)
    fireEvent.click(screen.getByText('go-b')) // signature a -> b; outgoing 'a' position (800) captured
    expect(window.scrollY).toBe(0) // 'b' has never been visited — no saved entry, defaults to top
  })

  it('remembers each signature independently across repeated switches (多等級各自記憶)', () => {
    render(<TestHarness store={store} />)
    scroll.setScrollY(300)
    fireEvent.click(screen.getByText('go-b')) // save a=300; b has nothing -> top
    scroll.setScrollY(150)
    fireEvent.click(screen.getByText('go-a')) // save b=150; restore a=300
    expect(window.scrollY).toBe(300)
    fireEvent.click(screen.getByText('go-b')) // save a=300 (unchanged); restore b=150
    expect(window.scrollY).toBe(150)
  })

  it('does not restore (or reset) until ready is true — waits for lazy-loaded content', () => {
    store.set('a', 500)
    const { rerender } = render(<TestHarness store={store} ready={false} />)
    expect(window.scrollY).toBe(0) // effect skipped entirely while not ready
    rerender(<TestHarness store={store} ready={true} />)
    expect(window.scrollY).toBe(500) // now restores once content is ready
  })

  it('does not touch scroll position while a detail view is active', () => {
    render(<TestHarness store={store} />)
    scroll.setScrollY(800)
    fireEvent.click(screen.getByText('enter-detail'))
    scroll.setScrollY(42) // simulate scrolling within the detail view itself
    expect(window.scrollY).toBe(42) // untouched — restore effect is inactive while active=false
  })
})

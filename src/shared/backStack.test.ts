import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pushLayer, goBack, resetBackStackForTests } from './backStack.ts'

function dispatchPop(depth: number | undefined) {
  window.dispatchEvent(new PopStateEvent('popstate', { state: depth === undefined ? null : { depth } }))
}

beforeEach(() => {
  resetBackStackForTests()
  vi.restoreAllMocks()
})

describe('pushLayer', () => {
  it('calls history.pushState with an incrementing depth for each layer', () => {
    const pushSpy = vi.spyOn(history, 'pushState')
    pushLayer(() => {})
    pushLayer(() => {})
    pushLayer(() => {})

    expect(pushSpy).toHaveBeenCalledTimes(3)
    expect(pushSpy).toHaveBeenNthCalledWith(1, { depth: 1 }, '')
    expect(pushSpy).toHaveBeenNthCalledWith(2, { depth: 2 }, '')
    expect(pushSpy).toHaveBeenNthCalledWith(3, { depth: 3 }, '')
  })
})

describe('popstate handling', () => {
  it('pops layers in LIFO order when the event depth matches one step back', () => {
    const first = vi.fn()
    const second = vi.fn()
    pushLayer(first)
    pushLayer(second)

    dispatchPop(1) // one step back from depth 2 -> depth 1
    expect(second).toHaveBeenCalledTimes(1)
    expect(first).not.toHaveBeenCalled()

    dispatchPop(0) // one step back from depth 1 -> depth 0 (home)
    expect(first).toHaveBeenCalledTimes(1)
  })

  it('does not invoke any handler and converges via replaceState on a depth mismatch (forward navigation)', () => {
    const handler = vi.fn()
    pushLayer(handler)
    const replaceSpy = vi.spyOn(history, 'replaceState')

    dispatchPop(5) // nothing was ever pushed to depth 5 — a stale/forward state
    expect(handler).not.toHaveBeenCalled()
    expect(replaceSpy).toHaveBeenCalledWith({ depth: 1 }, '')
  })

  it('treats a missing/null event.state as depth 0', () => {
    const handler = vi.fn()
    pushLayer(handler)

    dispatchPop(undefined) // matches "one step back from depth 1" (0 === 1 - 1)
    expect(handler).toHaveBeenCalledTimes(1)
  })
})

describe('goBack', () => {
  it('calls history.back() when a layer is pushed', () => {
    const backSpy = vi.spyOn(history, 'back').mockImplementation(() => {})
    pushLayer(() => {})

    goBack()
    expect(backSpy).toHaveBeenCalledTimes(1)
  })

  it('does not call history.back() when the stack is empty (already home)', () => {
    const backSpy = vi.spyOn(history, 'back').mockImplementation(() => {})

    goBack()
    expect(backSpy).not.toHaveBeenCalled()
  })
})

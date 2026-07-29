import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PullToRefresh } from './PullToRefresh.tsx'

function setScrollY(value: number) {
  Object.defineProperty(window, 'scrollY', { value, configurable: true })
}

function touchStart(clientY: number) {
  fireEvent.touchStart(window, { touches: [{ clientY }] })
}

function touchMove(clientY: number) {
  fireEvent.touchMove(window, { touches: [{ clientY }] })
}

function touchEnd() {
  fireEvent.touchEnd(window, { touches: [] })
}

/** Simulates a full pull gesture from y=0 down to y=`distance`, staying at the top the whole time. */
function pullDown(distance: number) {
  setScrollY(0)
  touchStart(0)
  touchMove(distance)
}

describe('PullToRefresh — rendering', () => {
  it('always renders children, indicator absent by default', () => {
    render(
      <PullToRefresh onRefresh={vi.fn(async () => {})}>
        <p>page content</p>
      </PullToRefresh>,
    )

    expect(screen.getByText('page content')).toBeInTheDocument()
    expect(screen.queryByText(/下拉以同步|放開以同步|同步中/)).not.toBeInTheDocument()
  })
})

describe('PullToRefresh — engaging the gesture', () => {
  it('a small movement within the dead zone (< 10px) shows no indicator', () => {
    render(
      <PullToRefresh onRefresh={vi.fn(async () => {})}>
        <p>content</p>
      </PullToRefresh>,
    )

    pullDown(5)

    expect(screen.queryByText(/下拉以同步/)).not.toBeInTheDocument()
  })

  it('pulling past the dead zone but under the 80px threshold shows "下拉以同步"', () => {
    render(
      <PullToRefresh onRefresh={vi.fn(async () => {})}>
        <p>content</p>
      </PullToRefresh>,
    )

    pullDown(40)

    expect(screen.getByText('↓ 下拉以同步')).toBeInTheDocument()
  })

  it('pulling past the 80px threshold shows "放開以同步"', () => {
    render(
      <PullToRefresh onRefresh={vi.fn(async () => {})}>
        <p>content</p>
      </PullToRefresh>,
    )

    // Raw delta needs to clear the dead zone AND, after the 0.5 resistance
    // factor, still exceed the 80px damped threshold — comfortably past
    // both with a large raw pull.
    pullDown(200)

    expect(screen.getByText('↑ 放開以同步')).toBeInTheDocument()
  })
})

describe('PullToRefresh — not at the top of the page', () => {
  it('a downward drag while scrolled away from the top never engages', () => {
    render(
      <PullToRefresh onRefresh={vi.fn(async () => {})}>
        <p>content</p>
      </PullToRefresh>,
    )

    setScrollY(500)
    touchStart(0)
    touchMove(200)

    expect(screen.queryByText(/下拉以同步|放開以同步/)).not.toBeInTheDocument()
  })
})

describe('PullToRefresh — pulling up', () => {
  it('a negative delta (finger moving up) never engages', () => {
    render(
      <PullToRefresh onRefresh={vi.fn(async () => {})}>
        <p>content</p>
      </PullToRefresh>,
    )

    setScrollY(0)
    touchStart(200)
    touchMove(50) // moved up, not down

    expect(screen.queryByText(/下拉以同步|放開以同步/)).not.toBeInTheDocument()
  })
})

describe('PullToRefresh — release below threshold', () => {
  it('releasing before reaching 80px does not call onRefresh, and the indicator disappears', async () => {
    const onRefresh = vi.fn(async () => {})
    render(
      <PullToRefresh onRefresh={onRefresh}>
        <p>content</p>
      </PullToRefresh>,
    )

    pullDown(40)
    touchEnd()

    expect(onRefresh).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByText(/下拉以同步/)).not.toBeInTheDocument())
  })
})

describe('PullToRefresh — release past threshold', () => {
  it('calls onRefresh once, shows 同步中…, and clears once onRefresh resolves', async () => {
    let resolveRefresh: () => void = () => {}
    const onRefresh = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRefresh = resolve
        }),
    )
    render(
      <PullToRefresh onRefresh={onRefresh}>
        <p>content</p>
      </PullToRefresh>,
    )

    pullDown(200)
    touchEnd()

    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(screen.getByText('同步中…')).toBeInTheDocument()

    resolveRefresh()
    await waitFor(() => expect(screen.queryByText('同步中…')).not.toBeInTheDocument())
  })
})

describe('PullToRefresh — no duplicate trigger while a refresh is in flight', () => {
  it('a second pull-and-release while onRefresh is still pending does not call it again', async () => {
    let resolveRefresh: () => void = () => {}
    const onRefresh = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRefresh = resolve
        }),
    )
    render(
      <PullToRefresh onRefresh={onRefresh}>
        <p>content</p>
      </PullToRefresh>,
    )

    pullDown(200)
    touchEnd()
    expect(onRefresh).toHaveBeenCalledTimes(1)

    // Try to trigger again while the first refresh is still in flight.
    pullDown(200)
    touchEnd()
    expect(onRefresh).toHaveBeenCalledTimes(1)

    resolveRefresh()
    await waitFor(() => expect(screen.queryByText('同步中…')).not.toBeInTheDocument())
  })
})

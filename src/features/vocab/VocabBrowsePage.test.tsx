import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { db } from '../../db/schema.ts'
import { resetBackStackForTests } from '../../shared/backStack.ts'
import type { VocabEntry } from '../../shared/contentTypes.ts'

const mockEntries: VocabEntry[] = [
  {
    id: 'v1',
    level: 'N5',
    kanji: '食べる',
    kana: 'たべる',
    usageNote: null,
    partOfSpeech: ['v1'],
    meaningEn: ['to eat'],
    meaningZh: '吃',
    sentences: [],
  },
]

vi.mock('../../shared/contentLoader.ts', () => ({
  loadVocabLevel: vi.fn(async () => mockEntries),
}))

const { VocabBrowsePage } = await import('./VocabBrowsePage.tsx')

// jsdom doesn't implement window.scrollTo/scrollY at all — same minimal
// controllable stand-in used in useScrollRestore.test.tsx.
function mockScroll() {
  let y = 0
  window.scrollTo = ((_x: number, newY: number) => {
    y = newY
  }) as typeof window.scrollTo
  Object.defineProperty(window, 'scrollY', { configurable: true, get: () => y })
  return { setScrollY: (v: number) => (y = v) }
}

function dispatchPop(depth: number) {
  window.dispatchEvent(new PopStateEvent('popstate', { state: { depth } }))
}

beforeEach(async () => {
  await db.cards.clear()
  await db.reviewLogs.clear()
  await db.settings.clear()
  await db.queuedItems.clear()
  resetBackStackForTests()
})

describe('VocabBrowsePage back navigation', () => {
  it('pushes a history layer on entering detail, and restores the list + scroll position on popstate', async () => {
    const scroll = mockScroll()
    const pushSpy = vi.spyOn(history, 'pushState')

    render(<VocabBrowsePage onBack={() => {}} />)
    await screen.findByText('食べる')

    scroll.setScrollY(842)
    fireEvent.click(screen.getByText('食べる'))

    // Entering detail pushed one layer.
    expect(pushSpy).toHaveBeenCalledWith({ depth: 1 }, '')
    expect(await screen.findByText('← 返回列表')).toBeInTheDocument()

    scroll.setScrollY(0) // simulates the detail view rendering at its own top
    dispatchPop(0) // one step back from depth 1

    await waitFor(() => expect(screen.getByText('食べる')).toBeInTheDocument())
    expect(window.scrollY).toBe(842)
  })
})

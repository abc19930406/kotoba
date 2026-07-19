import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { db } from '../../db/schema.ts'
import { resetBackStackForTests } from '../../shared/backStack.ts'
import type { GrammarEntry } from '../../shared/contentTypes.ts'

const mockEntries: GrammarEntry[] = [
  {
    id: 'g1',
    level: 'N5',
    title: '～ている',
    formation: '動詞て形 + いる',
    shortExplanation: 'ongoing action',
    longExplanation: '',
    zhShort: '正在進行',
    zhLong: null,
    sentences: [],
  },
]

const entriesByLevel: Record<string, GrammarEntry[]> = {
  N5: mockEntries,
  N4: [
    {
      id: 'g2',
      level: 'N4',
      title: '～ばよかった',
      formation: '動詞ば形 + よかった',
      shortExplanation: 'regret',
      longExplanation: '',
      zhShort: '早知道就～',
      zhLong: null,
      sentences: [],
    },
  ],
  N3: [],
  N2: [],
  N1: [],
}

vi.mock('../../shared/contentLoader.ts', () => ({
  loadGrammarLevel: vi.fn(async (level: string) => entriesByLevel[level] ?? []),
}))

const { GrammarBrowsePage } = await import('./GrammarBrowsePage.tsx')

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

describe('GrammarBrowsePage back navigation', () => {
  it('pushes a history layer on entering detail, and popstate closes it back to the list', async () => {
    const pushSpy = vi.spyOn(history, 'pushState')

    render(<GrammarBrowsePage onBack={() => {}} />)
    await screen.findByText('～ている')

    fireEvent.click(screen.getByText('～ている'))

    expect(pushSpy).toHaveBeenCalledWith({ depth: 1 }, '')
    expect(await screen.findByText('← 返回列表')).toBeInTheDocument()

    dispatchPop(0)

    await waitFor(() => expect(screen.getByText('～ている')).toBeInTheDocument())
    expect(screen.queryByText('← 返回列表')).not.toBeInTheDocument()
  })
})

describe('GrammarBrowsePage search', () => {
  it('finds entries from other levels while searching, showing a level badge, and returns to level-tab browsing when cleared', async () => {
    render(<GrammarBrowsePage onBack={() => {}} />)
    await screen.findByText('～ている') // N5 (current level) loaded

    const search = screen.getByRole('searchbox', { name: '搜尋文法' })
    fireEvent.change(search, { target: { value: 'ばよかった' } })

    // N4's entry only appears once its chunk has lazy-loaded via the search-triggered fetch-all.
    await screen.findByText('～ばよかった')
    expect(screen.queryByText('～ている')).not.toBeInTheDocument() // filtered out — doesn't match the query
    // Level badge on the result (distinct from the always-present "N4" level tab).
    expect(document.querySelector('.vocab-list-level')?.textContent).toBe('N4')

    fireEvent.change(search, { target: { value: '' } })

    await waitFor(() => expect(screen.getByText('～ている')).toBeInTheDocument())
    expect(screen.queryByText('～ばよかった')).not.toBeInTheDocument() // back to N5-only level-tab view
  })
})

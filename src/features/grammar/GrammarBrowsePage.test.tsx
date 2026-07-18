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

vi.mock('../../shared/contentLoader.ts', () => ({
  loadGrammarLevel: vi.fn(async () => mockEntries),
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

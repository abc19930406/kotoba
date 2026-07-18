import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { db } from './db/schema.ts'
import { getCard } from './db/cards.ts'
import { resetBackStackForTests } from './shared/backStack.ts'
import type { VocabEntry } from './shared/contentTypes.ts'

const mockEntry: VocabEntry = {
  id: 'v1',
  level: 'N5',
  kanji: '食べる',
  kana: 'たべる',
  usageNote: null,
  partOfSpeech: ['v1'],
  meaningEn: ['to eat'],
  meaningZh: '吃',
  sentences: [],
}

vi.mock('./shared/contentLoader.ts', () => ({
  loadVocabLevel: vi.fn(async () => []),
  findVocabEntry: vi.fn(async () => mockEntry),
  findGrammarEntry: vi.fn(async () => undefined),
  loadContentIndex: vi.fn(async () => ({ vocab: [], grammar: [] })),
}))

const { default: App } = await import('./App.tsx')

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

describe('App', () => {
  it('renders the placeholder home page', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'kotoba' })).toBeInTheDocument()
  })

  it('複習中按系統返回鍵會回首頁，且已評分卡片的進度不受影響', async () => {
    const seededDue = new Date('2020-01-01T00:00:00Z')
    await db.cards.put({
      itemId: 'v1',
      itemType: 'vocab',
      level: 'N5',
      due: seededDue,
      stability: 1,
      difficulty: 1,
      elapsed_days: 0,
      scheduled_days: 0,
      learning_steps: 0,
      reps: 1,
      lapses: 0,
      state: 2,
      suspended: false,
    })

    render(<App />)

    fireEvent.click(await screen.findByText('開始複習'))
    fireEvent.click(await screen.findByText('食べる')) // flips the card
    fireEvent.click(await screen.findByText('良好')) // grades it Good

    await waitFor(async () => {
      const card = await getCard('vocab', 'v1')
      expect(card?.due.getTime()).toBeGreaterThan(seededDue.getTime()) // schedule moved forward = graded
    })
    const gradedDue = (await getCard('vocab', 'v1'))!.due.getTime()

    dispatchPop(0) // system back: one step back from depth 1 (entering review pushed one layer)

    await waitFor(() => expect(screen.getByRole('heading', { name: 'kotoba' })).toBeInTheDocument())

    const cardAfterBack = await getCard('vocab', 'v1')
    expect(cardAfterBack!.due.getTime()).toBe(gradedDue) // untouched by navigating back
  })
})

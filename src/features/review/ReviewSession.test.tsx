import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { db } from '../../db/schema.ts'
import { getCard } from '../../db/cards.ts'
import type { VocabEntry } from '../../shared/contentTypes.ts'

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

vi.mock('../../shared/contentLoader.ts', () => ({
  loadVocabLevel: vi.fn(async () => []),
  findVocabEntry: vi.fn(async () => mockEntry),
  findGrammarEntry: vi.fn(async () => undefined),
}))

const { ReviewSession } = await import('./ReviewSession.tsx')

beforeEach(async () => {
  await db.cards.clear()
  await db.reviewLogs.clear()
  await db.settings.clear()
  await db.queuedItems.clear()
  // Seed a due card directly so the queue is deterministic regardless of FSRS timing.
  await db.cards.put({
    itemId: 'v1',
    itemType: 'vocab',
    level: 'N5',
    due: new Date('2020-01-01T00:00:00Z'),
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
})

describe('ReviewSession — 已熟悉 suspend + undo toast', () => {
  it('marking a card 已熟悉 shows a toast, and 撤銷 reverts the suspended flag', async () => {
    render(<ReviewSession onComplete={vi.fn()} />)

    const front = await screen.findByText('食べる')
    fireEvent.click(front)

    const suspendButton = await screen.findByText('已熟悉，不再出現')
    fireEvent.click(suspendButton)

    await screen.findByText('已標記熟悉')
    await waitFor(async () => {
      expect((await getCard('vocab', 'v1'))?.suspended).toBe(true)
    })

    fireEvent.click(screen.getByText('撤銷'))

    await waitFor(async () => {
      expect((await getCard('vocab', 'v1'))?.suspended).toBe(false)
    })
  })
})

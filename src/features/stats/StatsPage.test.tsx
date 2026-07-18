import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { Rating } from 'ts-fsrs'
import { db } from '../../db/schema.ts'
import { gradeItem, suspendCard } from '../../db/cards.ts'

vi.mock('../../shared/contentLoader.ts', () => ({
  loadContentIndex: vi.fn(async () => ({
    vocab: [
      { level: 'N5', count: 10 },
      { level: 'N4', count: 0 },
      { level: 'N3', count: 0 },
      { level: 'N2', count: 0 },
      { level: 'N1', count: 0 },
    ],
    grammar: [
      { level: 'N5', count: 5 },
      { level: 'N4', count: 0 },
      { level: 'N3', count: 0 },
      { level: 'N2', count: 0 },
      { level: 'N1', count: 0 },
    ],
  })),
}))

const { StatsPage } = await import('./StatsPage.tsx')

beforeEach(async () => {
  await db.cards.clear()
  await db.reviewLogs.clear()
  await db.settings.clear()
  await db.queuedItems.clear()
})

describe('StatsPage', () => {
  it('loads and renders streak, daily chart, and per-level progress numbers', async () => {
    const today = new Date()
    await gradeItem('vocab', 'v1', 'N5', Rating.Good, today)
    await gradeItem('vocab', 'v2', 'N5', Rating.Good, today)
    await suspendCard('vocab', 'v2', 'N5', today)

    render(<StatsPage onBack={() => {}} />)

    await waitFor(() => expect(screen.getByText('連續學習天數')).toBeInTheDocument())

    expect(screen.getByText('1')).toBeInTheDocument() // streak = today only
    expect(screen.getByText(/1 學習中 \/ 1 已熟悉 \/ 8 未開始/)).toBeInTheDocument() // N5 vocab: total 10
    expect(screen.getByText(/0 學習中 \/ 0 已熟悉 \/ 5 未開始/)).toBeInTheDocument() // N5 grammar: total 5, untouched
  })
})

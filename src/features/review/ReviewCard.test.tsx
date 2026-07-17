import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ReviewCard, type ReviewCardContent } from './ReviewCard.tsx'
import type { VocabEntry } from '../../shared/contentTypes.ts'

const vocabWithSentences: VocabEntry = {
  id: 'v1',
  level: 'N5',
  kanji: '作る',
  kana: 'つくる',
  usageNote: null,
  partOfSpeech: ['v5r', 'vt'],
  meaningEn: ['to make', 'to create'],
  meaningZh: '製作；創造',
  sentences: [
    { jp: '彼はケーキを作った。', en: 'He made a cake.', difficulty: 1 },
    { jp: '新しい規則を作る。', en: 'Create a new rule.', difficulty: 2 },
    { jp: '（第三句，不應顯示）', en: '(third sentence, should not show)', difficulty: 3 },
  ],
}

const vocabContent: ReviewCardContent = { itemType: 'vocab', entry: vocabWithSentences }

describe('ReviewCard', () => {
  it('shows only the front (kanji) before flipping', () => {
    render(<ReviewCard content={vocabContent} flipped={false} onFlip={vi.fn()} />)
    expect(screen.getByText('作る')).toBeInTheDocument()
    expect(screen.queryByText('つくる')).not.toBeInTheDocument()
  })

  it('shows kana, meaning, and up to 2 example sentences after flipping', () => {
    render(<ReviewCard content={vocabContent} flipped={true} onFlip={vi.fn()} />)
    expect(screen.getByText('つくる')).toBeInTheDocument()
    expect(screen.getByText('製作；創造')).toBeInTheDocument()
    expect(screen.getByText('彼はケーキを作った。')).toBeInTheDocument()
    expect(screen.getByText('新しい規則を作る。')).toBeInTheDocument()
    expect(screen.queryByText('（第三句，不應顯示）')).not.toBeInTheDocument()
  })

  it('calls onFlip when the card is clicked', () => {
    const onFlip = vi.fn()
    render(<ReviewCard content={vocabContent} flipped={false} onFlip={onFlip} />)
    screen.getByRole('button').click()
    expect(onFlip).toHaveBeenCalledOnce()
  })
})

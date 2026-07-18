import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ReviewCard, type ReviewCardContent } from './ReviewCard.tsx'
import type { VocabEntry, GrammarEntry } from '../../shared/contentTypes.ts'

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
    { jp: '彼はケーキを作った。', en: 'He made a cake.', difficulty: 1, jpSegments: [['彼'], ['はケーキを'], ['作', 'つく'], ['った。']] },
    { jp: '新しい規則を作る。', en: 'Create a new rule.', difficulty: 2, jpSegments: [['新しい規則を作る。']] },
    {
      jp: '（第三句，不應顯示）',
      en: '(third sentence, should not show)',
      difficulty: 3,
      jpSegments: [['（第三句，不應顯示）']],
    },
  ],
}

const vocabContent: ReviewCardContent = { itemType: 'vocab', entry: vocabWithSentences }

const grammarWithSentences: GrammarEntry = {
  id: 'g1',
  level: 'N5',
  title: '～てください',
  formation: '動詞て形 + ください',
  shortExplanation: 'Polite request.',
  longExplanation: 'Used to politely ask someone to do something.',
  zhShort: '請～（禮貌請求）',
  zhLong: '用於禮貌地請求對方做某事。',
  sentences: [
    { jp: 'ここに座ってください。', en: 'Please sit here.', difficulty: 1, jpSegments: [['ここに座ってください。']] },
    {
      jp: '（第二句，不應顯示）',
      en: '(second sentence, should not show)',
      difficulty: 2,
      jpSegments: [['（第二句，不應顯示）']],
    },
  ],
}
const grammarContent: ReviewCardContent = { itemType: 'grammar', entry: grammarWithSentences }

describe('ReviewCard', () => {
  it('shows only the front (kanji) before flipping', () => {
    render(<ReviewCard content={vocabContent} flipped={false} showFurigana={true} onFlip={vi.fn()} />)
    expect(screen.getByText('作る')).toBeInTheDocument()
    expect(screen.queryByText('つくる')).not.toBeInTheDocument()
  })

  it('shows kana, meaning, and up to 2 example sentences after flipping', () => {
    render(<ReviewCard content={vocabContent} flipped={true} showFurigana={false} onFlip={vi.fn()} />)
    expect(screen.getByText('つくる')).toBeInTheDocument()
    expect(screen.getByText('製作；創造')).toBeInTheDocument()
    expect(screen.getByText('彼はケーキを作った。')).toBeInTheDocument()
    expect(screen.getByText('新しい規則を作る。')).toBeInTheDocument()
    expect(screen.queryByText('（第三句，不應顯示）')).not.toBeInTheDocument()
  })

  it('renders ruby furigana markup for sentences when showFurigana is on', () => {
    const { container } = render(<ReviewCard content={vocabContent} flipped={true} showFurigana={true} onFlip={vi.fn()} />)
    expect(container.querySelectorAll('ruby')).toHaveLength(1)
    expect(screen.getByText('つく')).toBeInTheDocument() // the <rt> reading
  })

  it('calls onFlip when the card is clicked', () => {
    const onFlip = vi.fn()
    render(<ReviewCard content={vocabContent} flipped={false} showFurigana={true} onFlip={onFlip} />)
    screen.getByRole('button').click()
    expect(onFlip).toHaveBeenCalledOnce()
  })

  it('shows the title on the front and formation/meaning + only 1 example sentence for grammar', () => {
    const { rerender } = render(
      <ReviewCard content={grammarContent} flipped={false} showFurigana={true} onFlip={vi.fn()} />,
    )
    expect(screen.getByText('～てください')).toBeInTheDocument()
    expect(screen.queryByText('動詞て形 + ください')).not.toBeInTheDocument()

    rerender(<ReviewCard content={grammarContent} flipped={true} showFurigana={true} onFlip={vi.fn()} />)
    expect(screen.getByText('動詞て形 + ください')).toBeInTheDocument()
    expect(screen.getByText('請～（禮貌請求）')).toBeInTheDocument()
    expect(screen.getByText('ここに座ってください。')).toBeInTheDocument()
    expect(screen.queryByText('（第二句，不應顯示）')).not.toBeInTheDocument()
  })
})

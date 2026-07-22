import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { db, type DailyMaterialCacheRecord } from '../../db/schema.ts'
import { setCurrentLevel } from '../../db/cards.ts'
import { setDailyPasscode } from '../../shared/dailyPasscode.ts'
import { saveCachedMaterial } from '../../db/dailyMaterialCache.ts'
import type { VocabEntry, GrammarEntry } from '../../shared/contentTypes.ts'

const mockNewVocab: VocabEntry[] = [
  {
    id: 'v0',
    level: 'N5',
    kanji: '字0',
    kana: 'かな0',
    usageNote: null,
    partOfSpeech: [],
    meaningEn: [],
    meaningZh: null,
    sentences: [{ jp: '新字例句です。', en: 'a new-word example sentence', difficulty: 1, jpSegments: [['新字例句です。']] }],
  },
]

const mockNewGrammar: GrammarEntry[] = [
  {
    id: 'g0',
    level: 'N5',
    title: '文法0',
    formation: '動詞て形',
    shortExplanation: 'short',
    longExplanation: 'long',
    zhShort: '簡短說明',
    zhLong: '詳細說明',
    sentences: [{ jp: '文法例句です。', en: 'a grammar example sentence', difficulty: 1, jpSegments: [['文法例句です。']] }],
  },
]

const mockPkg = {
  date: '2026-03-01',
  level: 'N5' as const,
  newVocab: mockNewVocab,
  newGrammar: mockNewGrammar,
  reviewVocab: [],
}

vi.mock('../../db/dailyPackage.ts', () => ({
  buildDailyPackage: vi.fn(async () => mockPkg),
  buildKnownWordsSample: vi.fn(async () => []),
}))

const mockFetchDailyMaterial = vi.fn()
vi.mock('../../shared/dailyMaterialClient.ts', () => ({
  fetchDailyMaterial: (...args: unknown[]) => mockFetchDailyMaterial(...args),
}))

const { DailyMaterialPage } = await import('./DailyMaterialPage.tsx')

beforeEach(async () => {
  await db.cards.clear()
  await db.reviewLogs.clear()
  await db.settings.clear()
  await db.queuedItems.clear()
  await db.dailyMaterialCache.clear()
  setDailyPasscode('')
  mockFetchDailyMaterial.mockReset()
})

describe('DailyMaterialPage', () => {
  it('shows the package (always available) and no-passcode guidance, without ever calling fetchDailyMaterial', async () => {
    await setCurrentLevel('N5')

    render(<DailyMaterialPage onBack={() => {}} />)

    await screen.findByText('字0（かな0）')
    expect(screen.getByText(/尚未設定每日教材通行碼/)).toBeInTheDocument()
    expect(mockFetchDailyMaterial).not.toHaveBeenCalled()
  })

  it('renders vocab/grammar package items as collapsed-by-default <details> with their sentences already in the DOM', async () => {
    await setCurrentLevel('N5')

    render(<DailyMaterialPage onBack={() => {}} />)

    const vocabSummary = await screen.findByText('字0（かな0）')
    const vocabDetails = vocabSummary.closest('details')
    expect(vocabDetails).not.toBeNull()
    expect(vocabDetails).not.toHaveAttribute('open')
    expect(screen.getByText('新字例句です。')).toBeInTheDocument()

    const grammarSummary = screen.getByText('文法0')
    const grammarDetails = grammarSummary.closest('details')
    expect(grammarDetails).not.toBeNull()
    expect(grammarDetails).not.toHaveAttribute('open')
    expect(screen.getByText('動詞て形')).toBeInTheDocument()
    expect(screen.getByText('簡短說明')).toBeInTheDocument()
    expect(screen.getByText('文法例句です。')).toBeInTheDocument()
  })

  it('does not call fetchDailyMaterial when the essay is already cached for today+level (cache hit)', async () => {
    await setCurrentLevel('N5')
    setDailyPasscode('secret')
    await saveCachedMaterial('2026-03-01', 'N5', {
      paragraphs: [[['キャッシュ']]],
      zh: '快取內容',
      comprehensionPoints: ['a', 'b', 'c'],
    })

    render(<DailyMaterialPage onBack={() => {}} />)

    await screen.findByText('快取內容')
    expect(mockFetchDailyMaterial).not.toHaveBeenCalled()
  })

  it('shows the failure reason and keeps the package visible when generation fails', async () => {
    await setCurrentLevel('N5')
    setDailyPasscode('secret')
    mockFetchDailyMaterial.mockResolvedValue({ ok: false, error: { reason: 'network' } })

    render(<DailyMaterialPage onBack={() => {}} />)

    await screen.findByText('離線或網路連線失敗')
    expect(screen.getByText('字0（かな0）')).toBeInTheDocument()
  })

  it('shows generated content on a successful fetch and caches it under the versioned key', async () => {
    await setCurrentLevel('N5')
    setDailyPasscode('secret')
    mockFetchDailyMaterial.mockResolvedValue({
      ok: true,
      data: { paragraphs: [[['新內容']]], zh: '生成成功', comprehensionPoints: ['a', 'b', 'c'] },
    })

    render(<DailyMaterialPage onBack={() => {}} />)

    await screen.findByText('生成成功')
    const cached = await db.dailyMaterialCache.get('2026-03-01:N5:v2')
    expect(cached?.zh).toBe('生成成功')
  })

  it('shows the grammar-notes section with the quoted sentence when the essay includes them', async () => {
    await setCurrentLevel('N5')
    setDailyPasscode('secret')
    mockFetchDailyMaterial.mockResolvedValue({
      ok: true,
      data: {
        paragraphs: [[['テストの文です。']]],
        zh: '生成成功',
        comprehensionPoints: ['a', 'b', 'c'],
        grammarNotes: [{ sentence: [['テストの文']], grammarPoint: '〜の', explanation: '連體修飾' }],
      },
    })

    render(<DailyMaterialPage onBack={() => {}} />)

    await screen.findByText('文法解析')
    expect(screen.getByText('〜の')).toBeInTheDocument()
    expect(screen.getByText('連體修飾')).toBeInTheDocument()
  })

  it('renders without crashing and hides the grammar-notes section when a cached row is missing grammarNotes', async () => {
    await setCurrentLevel('N5')
    setDailyPasscode('secret')
    const rowWithoutGrammarNotes = {
      dateLevel: '2026-03-01:N5:v2',
      date: '2026-03-01',
      level: 'N5',
      paragraphs: [[['快取無文法解析']]],
      zh: '快取內容',
      comprehensionPoints: ['a', 'b', 'c'],
      regenerateCount: 0,
      createdAt: new Date(),
    }
    await db.dailyMaterialCache.put(rowWithoutGrammarNotes as unknown as DailyMaterialCacheRecord)

    render(<DailyMaterialPage onBack={() => {}} />)

    await screen.findByText('快取內容')
    expect(screen.queryByText('文法解析')).not.toBeInTheDocument()
  })
})

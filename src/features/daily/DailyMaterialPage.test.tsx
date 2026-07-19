import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { db } from '../../db/schema.ts'
import { setCurrentLevel } from '../../db/cards.ts'
import { setDailyPasscode } from '../../shared/dailyPasscode.ts'
import { saveCachedMaterial } from '../../db/dailyMaterialCache.ts'
import type { VocabEntry } from '../../shared/contentTypes.ts'

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
    sentences: [],
  },
]

const mockPkg = {
  date: '2026-03-01',
  level: 'N5' as const,
  newVocab: mockNewVocab,
  newGrammar: [],
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

  it('shows generated content on a successful fetch and caches it', async () => {
    await setCurrentLevel('N5')
    setDailyPasscode('secret')
    mockFetchDailyMaterial.mockResolvedValue({
      ok: true,
      data: { paragraphs: [[['新內容']]], zh: '生成成功', comprehensionPoints: ['a', 'b', 'c'] },
    })

    render(<DailyMaterialPage onBack={() => {}} />)

    await screen.findByText('生成成功')
    const cached = await db.dailyMaterialCache.get('2026-03-01:N5')
    expect(cached?.zh).toBe('生成成功')
  })
})

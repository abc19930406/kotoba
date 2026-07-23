import { beforeEach, describe, expect, it } from 'vitest'
import { db, type DailyMaterialCacheRecord } from './schema.ts'
import { getCachedMaterial, saveCachedMaterial, incrementRegenerateCount } from './dailyMaterialCache.ts'
import type { DailyMaterialResponseBody } from '../shared/dailyMaterialTypes.ts'

const sample: DailyMaterialResponseBody = {
  paragraphs: [[['今日は'], ['天気', 'てんき'], ['がいいです。']]],
  zh: '今天天氣很好。',
  comprehensionPoints: ['要點1', '要點2', '要點3'],
  grammarNotes: [{ sentence: [['今日は'], ['天気', 'てんき']], zh: '今天天氣', grammarPoint: '〜が', explanation: '主語標記' }],
}

beforeEach(async () => {
  await db.dailyMaterialCache.clear()
})

describe('dailyMaterialCache', () => {
  it('returns null when nothing is cached for a given date+level', async () => {
    expect(await getCachedMaterial('2026-03-01', 'N5')).toBeNull()
  })

  it('saves and retrieves a cached entry, starting regenerateCount at 0', async () => {
    await saveCachedMaterial('2026-03-01', 'N5', sample)
    const cached = await getCachedMaterial('2026-03-01', 'N5')
    expect(cached).not.toBeNull()
    expect(cached?.zh).toBe(sample.zh)
    expect(cached?.regenerateCount).toBe(0)
    expect(cached?.grammarNotes).toEqual(sample.grammarNotes)
  })

  it('defaults grammarNotes to [] when saving a response that omits it', async () => {
    const { grammarNotes: _omitted, ...withoutGrammarNotes } = sample
    await saveCachedMaterial('2026-03-01', 'N5', withoutGrammarNotes)
    const cached = await getCachedMaterial('2026-03-01', 'N5')
    expect(cached?.grammarNotes).toEqual([])
  })

  it('does not find a row written under the pre-versioning key format (old schema without grammarNotes/version suffix)', async () => {
    // Simulates a Phase 10 (pre-10.5) cache row left over in a real user's
    // IndexedDB — the key format itself changed (CACHE_CONTENT_VERSION),
    // so this should be an unreachable orphan, not read back as malformed
    // new-shape data.
    const oldFormatRow = {
      dateLevel: '2026-03-01:N5',
      date: '2026-03-01',
      level: 'N5',
      paragraphs: sample.paragraphs,
      zh: '舊格式資料',
      comprehensionPoints: sample.comprehensionPoints,
      regenerateCount: 0,
      createdAt: new Date(),
    }
    await db.dailyMaterialCache.put(oldFormatRow as unknown as DailyMaterialCacheRecord)

    expect(await getCachedMaterial('2026-03-01', 'N5')).toBeNull()
  })

  it('does not find a row written under the Phase 10.5 (:v2) key format now that the version is v3', async () => {
    // Simulates a Phase 10.5 cache row (grammarNotes existed, but without
    // the new zh field) left over in a real user's IndexedDB — Phase 10.6
    // bumped CACHE_CONTENT_VERSION again, so this is unreachable too.
    const phase10_5Row = {
      dateLevel: '2026-03-01:N5:v2',
      date: '2026-03-01',
      level: 'N5',
      paragraphs: sample.paragraphs,
      zh: 'Phase 10.5 格式資料',
      comprehensionPoints: sample.comprehensionPoints,
      grammarNotes: [{ sentence: sample.grammarNotes![0].sentence, grammarPoint: '〜が', explanation: '主語標記' }],
      regenerateCount: 0,
      createdAt: new Date(),
    }
    await db.dailyMaterialCache.put(phase10_5Row as unknown as DailyMaterialCacheRecord)

    expect(await getCachedMaterial('2026-03-01', 'N5')).toBeNull()
  })

  it('keeps different date+level entries independent', async () => {
    await saveCachedMaterial('2026-03-01', 'N5', sample)
    await saveCachedMaterial('2026-03-01', 'N4', { ...sample, zh: '不同等級' })
    await saveCachedMaterial('2026-03-02', 'N5', { ...sample, zh: '不同日期' })

    expect((await getCachedMaterial('2026-03-01', 'N5'))?.zh).toBe(sample.zh)
    expect((await getCachedMaterial('2026-03-01', 'N4'))?.zh).toBe('不同等級')
    expect((await getCachedMaterial('2026-03-02', 'N5'))?.zh).toBe('不同日期')
  })

  it('incrementRegenerateCount overwrites content and bumps the count each call', async () => {
    await saveCachedMaterial('2026-03-01', 'N5', sample)

    const first = await incrementRegenerateCount('2026-03-01', 'N5', { ...sample, zh: '第一次重新生成' })
    expect(first).toBe(1)
    expect((await getCachedMaterial('2026-03-01', 'N5'))?.zh).toBe('第一次重新生成')

    const second = await incrementRegenerateCount('2026-03-01', 'N5', { ...sample, zh: '第二次重新生成' })
    expect(second).toBe(2)
    expect((await getCachedMaterial('2026-03-01', 'N5'))?.regenerateCount).toBe(2)
  })
})

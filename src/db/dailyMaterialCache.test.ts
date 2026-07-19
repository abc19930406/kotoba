import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './schema.ts'
import { getCachedMaterial, saveCachedMaterial, incrementRegenerateCount } from './dailyMaterialCache.ts'
import type { DailyMaterialResponseBody } from '../shared/dailyMaterialTypes.ts'

const sample: DailyMaterialResponseBody = {
  paragraphs: [[['今日は'], ['天気', 'てんき'], ['がいいです。']]],
  zh: '今天天氣很好。',
  comprehensionPoints: ['要點1', '要點2', '要點3'],
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

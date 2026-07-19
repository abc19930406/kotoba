import { db, type DailyMaterialCacheRecord } from './schema.ts'
import type { JlptLevel } from '../shared/contentTypes.ts'
import type { DailyMaterialResponseBody } from '../shared/dailyMaterialTypes.ts'

function toDateLevel(date: string, level: JlptLevel): string {
  return `${date}:${level}`
}

export async function getCachedMaterial(date: string, level: JlptLevel): Promise<DailyMaterialCacheRecord | null> {
  const record = await db.dailyMaterialCache.get(toDateLevel(date, level))
  return record ?? null
}

export async function saveCachedMaterial(
  date: string,
  level: JlptLevel,
  data: DailyMaterialResponseBody,
  now: Date = new Date(),
): Promise<void> {
  await db.dailyMaterialCache.put({
    dateLevel: toDateLevel(date, level),
    date,
    level,
    paragraphs: data.paragraphs,
    zh: data.zh,
    comprehensionPoints: data.comprehensionPoints,
    regenerateCount: 0,
    createdAt: now,
  })
}

/** Overwrites the cached content with a freshly-regenerated result and bumps regenerateCount. Returns the new count. */
export async function incrementRegenerateCount(
  date: string,
  level: JlptLevel,
  data: DailyMaterialResponseBody,
  now: Date = new Date(),
): Promise<number> {
  const existing = await getCachedMaterial(date, level)
  const nextCount = (existing?.regenerateCount ?? 0) + 1
  await db.dailyMaterialCache.put({
    dateLevel: toDateLevel(date, level),
    date,
    level,
    paragraphs: data.paragraphs,
    zh: data.zh,
    comprehensionPoints: data.comprehensionPoints,
    regenerateCount: nextCount,
    createdAt: now,
  })
  return nextCount
}

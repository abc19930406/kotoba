import { db, type DailyMaterialCacheRecord } from './schema.ts'
import type { JlptLevel } from '../shared/contentTypes.ts'
import type { DailyMaterialResponseBody } from '../shared/dailyMaterialTypes.ts'

// Bump whenever DailyMaterialResponseBody's shape changes — this makes any
// cache row written under the old key format simply unreachable (not read
// back as malformed data), so a same-day reload after a schema change
// naturally falls through to fresh generation instead of crashing on
// missing fields. Old rows are harmless orphans (this table is excluded
// from backups), not worth a migration/cleanup routine.
const CACHE_CONTENT_VERSION = 2

function toDateLevel(date: string, level: JlptLevel): string {
  return `${date}:${level}:v${CACHE_CONTENT_VERSION}`
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
    grammarNotes: data.grammarNotes ?? [],
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
    grammarNotes: data.grammarNotes ?? [],
    regenerateCount: nextCount,
    createdAt: now,
  })
  return nextCount
}

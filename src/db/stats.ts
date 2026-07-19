import { db, type ItemType } from './schema.ts'
import { startOfDay, endOfDay } from './cards.ts'
import { LEVEL_ORDER, type JlptLevel } from '../shared/contentTypes.ts'

async function countReviewsOnDay(day: Date): Promise<number> {
  return db.reviewLogs.where('review').between(startOfDay(day), endOfDay(day), true, true).count()
}

export function toDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export interface DailyReviewCount {
  date: string
  count: number
}

/** Review counts for the `days` days ending today (oldest first), zero-filled for days with no reviews. */
export async function getDailyReviewCounts(days: number, now: Date = new Date()): Promise<DailyReviewCount[]> {
  const results: DailyReviewCount[] = []
  for (let offset = days - 1; offset >= 0; offset--) {
    const day = new Date(now)
    day.setDate(day.getDate() - offset)
    results.push({ date: toDateKey(day), count: await countReviewsOnDay(day) })
  }
  return results
}

export interface LevelProgress {
  level: JlptLevel
  active: number
  suspended: number
  notStarted: number
}

/** Per-level 學習中(active)/已熟悉(suspended)/未開始 breakdown for one item type. `totalsByLevel` comes from public/data/index.json's per-level counts. */
export async function getLevelProgress(
  itemType: ItemType,
  totalsByLevel: Record<JlptLevel, number>,
): Promise<LevelProgress[]> {
  const cards = await db.cards.where('itemType').equals(itemType).toArray()
  const buckets = new Map<JlptLevel, { active: number; suspended: number }>(
    LEVEL_ORDER.map((level) => [level, { active: 0, suspended: 0 }]),
  )
  for (const card of cards) {
    const bucket = buckets.get(card.level)
    if (!bucket) continue
    if (card.suspended) bucket.suspended++
    else bucket.active++
  }
  return LEVEL_ORDER.map((level) => {
    const { active, suspended } = buckets.get(level)!
    const notStarted = Math.max(0, (totalsByLevel[level] ?? 0) - active - suspended)
    return { level, active, suspended, notStarted }
  })
}

const MAX_STREAK_LOOKBACK_DAYS = 3650

/**
 * Consecutive days with at least one reviewLog, counting backward from
 * today. If today has no reviews yet, that alone doesn't break a streak
 * built up through yesterday — counting starts from yesterday instead.
 */
export async function getStreakDays(now: Date = new Date()): Promise<number> {
  let streak = (await countReviewsOnDay(now)) > 0 ? 1 : 0
  for (let offset = 1; offset < MAX_STREAK_LOOKBACK_DAYS; offset++) {
    const day = new Date(now)
    day.setDate(day.getDate() - offset)
    const count = await countReviewsOnDay(day)
    if (count === 0) break
    streak++
  }
  return streak
}

import { beforeEach, describe, expect, it } from 'vitest'
import { Rating } from 'ts-fsrs'
import { db } from './schema.ts'
import { gradeItem, suspendCard, addToReviewQueue, setDailyNewCardLimit, setCurrentLevel, setShowFurigana, setTheme } from './cards.ts'
import { exportBackup, importBackup } from './backup.ts'
import { backupSchema } from './backupSchema.ts'

beforeEach(async () => {
  await db.cards.clear()
  await db.reviewLogs.clear()
  await db.settings.clear()
  await db.queuedItems.clear()
})

function sortBy<T>(arr: T[], key: (t: T) => string): T[] {
  return [...arr].sort((a, b) => key(a).localeCompare(key(b)))
}

describe('exportBackup / importBackup round trip', () => {
  it('fully restores cards (incl. suspended), reviewLogs, queuedItems, and settings after export → clear → import', async () => {
    const now = new Date('2026-01-01T00:00:00Z')
    await gradeItem('vocab', 'v1', 'N5', Rating.Good, now)
    await gradeItem('vocab', 'v2', 'N4', Rating.Good, now)
    await suspendCard('vocab', 'v2', 'N4', now)
    await addToReviewQueue('grammar', 'g1', 'N3', now)
    await setDailyNewCardLimit(25)
    await setCurrentLevel('N3')
    await setShowFurigana(false)
    await setTheme('dark')

    const exported = await exportBackup()

    await Promise.all([db.cards.clear(), db.reviewLogs.clear(), db.queuedItems.clear(), db.settings.clear()])
    expect(await db.cards.count()).toBe(0)

    // Round-trip through JSON + zod, exactly like a real file-based import.
    const parsed = backupSchema.parse(JSON.parse(JSON.stringify(exported)))
    await importBackup(parsed)

    const restoredCards = sortBy(await db.cards.toArray(), (c) => `${c.itemType}:${c.itemId}`)
    const originalCards = sortBy(exported.cards, (c) => `${c.itemType}:${c.itemId}`)
    expect(restoredCards).toEqual(originalCards)
    expect(restoredCards.find((c) => c.itemId === 'v2')?.suspended).toBe(true)

    const restoredLogs = sortBy(await db.reviewLogs.toArray(), (l) => `${l.itemId}:${l.review.toISOString()}`)
    const originalLogs = sortBy(exported.reviewLogs, (l) => `${l.itemId}:${l.review.toISOString()}`)
    expect(restoredLogs).toEqual(originalLogs)

    const restoredQueued = await db.queuedItems.toArray()
    expect(restoredQueued).toEqual(exported.queuedItems)

    const restoredSettings = sortBy(await db.settings.toArray(), (s) => s.key)
    const originalSettings = sortBy(exported.settings, (s) => s.key)
    expect(restoredSettings).toEqual(originalSettings)
    expect(restoredSettings.find((s) => s.key === 'dailyNewCardLimit')?.value).toBe(25)
  })

  it('rejects a malformed backup missing required card fields', () => {
    const malformed = {
      schemaVersion: 3,
      exportedAt: new Date().toISOString(),
      cards: [{ itemId: 'v1', itemType: 'vocab', level: 'N5' }],
      reviewLogs: [],
      queuedItems: [],
      settings: [],
    }
    expect(backupSchema.safeParse(malformed).success).toBe(false)
  })

  it('rejects an invalid itemType enum value', () => {
    const malformed = {
      schemaVersion: 3,
      exportedAt: new Date().toISOString(),
      cards: [],
      reviewLogs: [],
      queuedItems: [{ itemId: 'x', itemType: 'not-a-real-type', level: 'N5', addedAt: new Date().toISOString() }],
      settings: [],
    }
    expect(backupSchema.safeParse(malformed).success).toBe(false)
  })
})

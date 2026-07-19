import { beforeEach, describe, expect, it } from 'vitest'
import { Rating } from 'ts-fsrs'
import { db } from './schema.ts'
import { gradeItem, suspendCard, addToReviewQueue, setDailyNewCardLimit, setCurrentLevel, setShowFurigana, setTheme } from './cards.ts'
import { saveNoteText } from './notes.ts'
import { createStandaloneNote } from './standaloneNotes.ts'
import { exportBackup, importBackup, blobToBase64, base64ToBlob } from './backup.ts'
import { backupSchema } from './backupSchema.ts'

beforeEach(async () => {
  await db.cards.clear()
  await db.reviewLogs.clear()
  await db.settings.clear()
  await db.queuedItems.clear()
  await db.notes.clear()
  await db.noteImages.clear()
  await db.standaloneNotes.clear()
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

  it('fully restores note text after export → clear → import', async () => {
    await saveNoteText('vocab', 'v1', '這是我的筆記')

    const exported = await exportBackup()
    expect(exported.notes).toHaveLength(1)

    await db.notes.clear()

    const parsed = backupSchema.parse(JSON.parse(JSON.stringify(exported)))
    await importBackup(parsed)

    const restoredNote = await db.notes.get(['vocab', 'v1'])
    expect(restoredNote?.text).toBe('這是我的筆記')
  })

  // fake-indexeddb (as used here, under jsdom) doesn't structured-clone Blob
  // values correctly — a stored Blob comes back out of db.noteImages as a
  // plain empty object, not a usable Blob (confirmed by direct inspection;
  // this is a test-environment gap, not a product bug — real IndexedDB in
  // actual browsers preserves Blobs correctly, which is why the feature
  // still needs real-device/browser verification per the plan). So instead
  // of round-tripping an image through the database, this exercises the
  // actual byte-preserving logic directly: blobToBase64/base64ToBlob is
  // exactly what exportBackup/importBackup use to carry image bytes through
  // JSON, and this proves it's lossless byte-for-byte, including a size well
  // past the 32KB chunking boundary (catches any off-by-one in the chunk loop).
  it('blobToBase64 → base64ToBlob round-trips image bytes exactly, including across the chunk boundary', async () => {
    const bytes = new Uint8Array(100_000)
    for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256

    const original = new Blob([bytes], { type: 'image/jpeg' })
    const encoded = await blobToBase64(original)
    const decoded = base64ToBlob(encoded, 'image/jpeg')

    expect(decoded.type).toBe('image/jpeg')
    const decodedBytes = new Uint8Array(await decoded.arrayBuffer())
    expect(Array.from(decodedBytes)).toEqual(Array.from(bytes))
  })

  it('fully restores a standalone note after export → clear → import', async () => {
    await createStandaloneNote('購物清單', '牛奶、雞蛋、麵包')

    const exported = await exportBackup()
    expect(exported.standaloneNotes).toHaveLength(1)

    await db.standaloneNotes.clear()

    const parsed = backupSchema.parse(JSON.parse(JSON.stringify(exported)))
    await importBackup(parsed)

    const restored = await db.standaloneNotes.toArray()
    expect(restored).toHaveLength(1)
    expect(restored[0]).toMatchObject({ title: '購物清單', text: '牛奶、雞蛋、麵包' })
  })

  it('accepts an old (pre-Phase-8) backup that has no notes/noteImages/standaloneNotes fields, defaulting them to empty', () => {
    const oldBackup = {
      schemaVersion: 3,
      exportedAt: new Date().toISOString(),
      cards: [],
      reviewLogs: [],
      queuedItems: [],
      settings: [],
    }
    const parsed = backupSchema.safeParse(oldBackup)
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.notes).toEqual([])
      expect(parsed.data.noteImages).toEqual([])
      expect(parsed.data.standaloneNotes).toEqual([])
    }
  })

  it('importing an old backup with no notes fields creates no notes/standaloneNotes and does not throw', async () => {
    await saveNoteText('vocab', 'stale', '應該被清空')
    await createStandaloneNote('也應該被清空', '')
    const oldBackup = {
      schemaVersion: 3,
      exportedAt: new Date().toISOString(),
      cards: [],
      reviewLogs: [],
      queuedItems: [],
      settings: [],
    }
    const parsed = backupSchema.parse(oldBackup)
    await expect(importBackup(parsed)).resolves.toBeUndefined()
    expect(await db.notes.count()).toBe(0)
    expect(await db.standaloneNotes.count()).toBe(0)
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

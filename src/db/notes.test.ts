import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Rating } from 'ts-fsrs'
import { db } from './schema.ts'
import { gradeItem, getCard } from './cards.ts'
import { getNote, saveNoteText, addNoteImage, removeNoteImage, deleteNote } from './notes.ts'

function makeBlob(byte: number): Blob {
  return new Blob([new Uint8Array([byte])], { type: 'image/jpeg' })
}

beforeEach(async () => {
  await db.cards.clear()
  await db.reviewLogs.clear()
  await db.settings.clear()
  await db.queuedItems.clear()
  await db.notes.clear()
  await db.noteImages.clear()
})

describe('getNote', () => {
  it('returns null for an item with no note', async () => {
    expect(await getNote('vocab', 'v1')).toBeNull()
  })

  it('returns text and images sorted by sort order', async () => {
    await saveNoteText('vocab', 'v1', '筆記內容')
    await addNoteImage('vocab', 'v1', makeBlob(1))
    await addNoteImage('vocab', 'v1', makeBlob(2))

    const note = await getNote('vocab', 'v1')
    expect(note?.text).toBe('筆記內容')
    expect(note?.images).toHaveLength(2)
    expect(note?.images.map((i) => i.sort)).toEqual([0, 1])
  })
})

describe('saveNoteText', () => {
  it('creates a new note record when none exists', async () => {
    await saveNoteText('vocab', 'v1', 'hello')
    const note = await getNote('vocab', 'v1')
    expect(note?.text).toBe('hello')
  })

  it('updates text and updatedAt on an existing note', async () => {
    await saveNoteText('vocab', 'v1', 'first')
    const first = await db.notes.get(['vocab', 'v1'])
    await saveNoteText('vocab', 'v1', 'second')
    const second = await db.notes.get(['vocab', 'v1'])

    expect(second?.text).toBe('second')
    expect(second?.updatedAt.getTime()).toBeGreaterThanOrEqual(first!.updatedAt.getTime())
  })
})

describe('addNoteImage', () => {
  it('allows up to 4 images and creates the note record if it did not exist yet', async () => {
    for (let i = 0; i < 4; i++) {
      const result = await addNoteImage('grammar', 'g1', makeBlob(i))
      expect(result.ok).toBe(true)
    }
    const note = await getNote('grammar', 'g1')
    expect(note?.text).toBe('')
    expect(note?.images).toHaveLength(4)
  })

  it('rejects a 5th image and does not write it', async () => {
    for (let i = 0; i < 4; i++) await addNoteImage('vocab', 'v1', makeBlob(i))

    const fifth = await addNoteImage('vocab', 'v1', makeBlob(99))
    expect(fifth).toEqual({ ok: false, reason: 'max-reached' })

    const note = await getNote('vocab', 'v1')
    expect(note?.images).toHaveLength(4)
  })
})

describe('removeNoteImage', () => {
  it('removes only the targeted image', async () => {
    await addNoteImage('vocab', 'v1', makeBlob(1))
    await addNoteImage('vocab', 'v1', makeBlob(2))
    const before = await getNote('vocab', 'v1')
    const [keep, remove] = before!.images

    await removeNoteImage(remove.id!)

    const after = await getNote('vocab', 'v1')
    expect(after?.images).toHaveLength(1)
    expect(after?.images[0].id).toBe(keep.id)
  })
})

describe('deleteNote', () => {
  it('removes the note and all its images, without touching a different item', async () => {
    await saveNoteText('vocab', 'v1', 'delete me')
    await addNoteImage('vocab', 'v1', makeBlob(1))
    await saveNoteText('vocab', 'v2', 'keep me')
    await addNoteImage('vocab', 'v2', makeBlob(2))

    await deleteNote('vocab', 'v1')

    expect(await getNote('vocab', 'v1')).toBeNull()
    expect(await db.noteImages.where('noteKey').equals('vocab:v1').count()).toBe(0)

    const kept = await getNote('vocab', 'v2')
    expect(kept?.text).toBe('keep me')
    expect(kept?.images).toHaveLength(1)
  })
})

describe('navigator.storage.persist() best-effort request', () => {
  it('does not throw or block the write when navigator.storage is absent', async () => {
    const original = navigator.storage
    Object.defineProperty(navigator, 'storage', { value: undefined, configurable: true })
    try {
      await expect(saveNoteText('vocab', 'v1', 'text')).resolves.toBeUndefined()
    } finally {
      Object.defineProperty(navigator, 'storage', { value: original, configurable: true })
    }
  })

  it('does not throw or block the write when persist() rejects', async () => {
    const persist = vi.fn().mockRejectedValue(new Error('denied'))
    Object.defineProperty(navigator, 'storage', { value: { persist }, configurable: true })

    await expect(addNoteImage('vocab', 'v2', makeBlob(1))).resolves.toEqual({ ok: true })
    expect(persist).toHaveBeenCalled()
  })
})

describe('coexistence with existing tables', () => {
  it('writing a card and a note in the same session does not disturb either', async () => {
    await gradeItem('vocab', 'v1', 'N5', Rating.Good, new Date())
    await saveNoteText('vocab', 'v1', 'a note on the same item')

    expect(await getCard('vocab', 'v1')).toBeDefined()
    expect((await getNote('vocab', 'v1'))?.text).toBe('a note on the same item')
  })
})

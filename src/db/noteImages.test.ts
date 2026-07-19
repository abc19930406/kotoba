import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './schema.ts'
import { listNoteImages, addNoteImageByKey, removeNoteImage, deleteNoteImagesByKey } from './noteImages.ts'

function makeBlob(byte: number): Blob {
  return new Blob([new Uint8Array([byte])], { type: 'image/jpeg' })
}

beforeEach(async () => {
  await db.noteImages.clear()
})

describe('addNoteImageByKey', () => {
  it('allows up to 4 images per key', async () => {
    for (let i = 0; i < 4; i++) {
      expect(await addNoteImageByKey('key-a', makeBlob(i))).toEqual({ ok: true })
    }
    expect(await listNoteImages('key-a')).toHaveLength(4)
  })

  it('rejects a 5th image for the same key', async () => {
    for (let i = 0; i < 4; i++) await addNoteImageByKey('key-a', makeBlob(i))
    expect(await addNoteImageByKey('key-a', makeBlob(99))).toEqual({ ok: false, reason: 'max-reached' })
    expect(await listNoteImages('key-a')).toHaveLength(4)
  })

  it('tracks limits independently per key', async () => {
    for (let i = 0; i < 4; i++) await addNoteImageByKey('key-a', makeBlob(i))
    expect(await addNoteImageByKey('key-b', makeBlob(0))).toEqual({ ok: true })
  })
})

describe('listNoteImages', () => {
  it('returns images sorted by sort order', async () => {
    await addNoteImageByKey('key-a', makeBlob(1))
    await addNoteImageByKey('key-a', makeBlob(2))
    const images = await listNoteImages('key-a')
    expect(images.map((i) => i.sort)).toEqual([0, 1])
  })
})

describe('removeNoteImage', () => {
  it('removes only the targeted image', async () => {
    await addNoteImageByKey('key-a', makeBlob(1))
    await addNoteImageByKey('key-a', makeBlob(2))
    const [keep, remove] = await listNoteImages('key-a')

    await removeNoteImage(remove.id!)

    const remaining = await listNoteImages('key-a')
    expect(remaining).toHaveLength(1)
    expect(remaining[0].id).toBe(keep.id)
  })
})

describe('deleteNoteImagesByKey', () => {
  it('removes all images for one key without touching another key', async () => {
    await addNoteImageByKey('key-a', makeBlob(1))
    await addNoteImageByKey('key-b', makeBlob(2))

    await deleteNoteImagesByKey('key-a')

    expect(await listNoteImages('key-a')).toHaveLength(0)
    expect(await listNoteImages('key-b')).toHaveLength(1)
  })
})

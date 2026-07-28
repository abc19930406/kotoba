import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from './schema.ts'
import { listNoteImages, addNoteImageByKey, removeNoteImage, deleteNoteImagesByKey } from './noteImages.ts'

// addNoteImageByKey's scheduleSyncPush() side effect fires a real 5s
// debounce timer otherwise — irrelevant to these tests and would leave a
// dangling timer.
vi.mock('../shared/syncEngine.ts', () => ({
  scheduleSyncPush: vi.fn(),
  syncNow: vi.fn(),
  initSyncEngine: vi.fn(),
}))

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

describe('Phase C4a: sync metadata', () => {
  it('assigns each image its own remoteId and leaves storagePath unset', async () => {
    await addNoteImageByKey('key-a', makeBlob(1))
    await addNoteImageByKey('key-a', makeBlob(2))

    const [first, second] = await listNoteImages('key-a')
    expect(first.remoteId).toEqual(expect.any(String))
    expect(second.remoteId).toEqual(expect.any(String))
    expect(first.remoteId).not.toBe(second.remoteId)
    expect(first.storagePath).toBeUndefined()
    expect(second.storagePath).toBeUndefined()
  })
})

describe('Phase C6: removeNoteImage tombstone/enqueue behavior', () => {
  beforeEach(async () => {
    await db.syncQueue.clear()
  })

  it('an image that was never uploaded (no storagePath) produces no sync queue entry at all', async () => {
    await addNoteImageByKey('key-a', makeBlob(1))
    const [image] = await listNoteImages('key-a')

    await removeNoteImage(image.id!)

    expect(await db.syncQueue.count()).toBe(0)
  })

  it('an already-uploaded image (storagePath set) enqueues a noteImages delete carrying its remoteId, deletedAt, and storagePath', async () => {
    const id = await db.noteImages.add({ noteKey: 'key-a', blob: makeBlob(1), sort: 0, remoteId: 'img-uuid-1', storagePath: 'vocab/abc/img-uuid-1.jpg' })

    await removeNoteImage(id)

    const queued = await db.syncQueue.toArray()
    expect(queued).toHaveLength(1)
    expect(queued[0]).toMatchObject({
      table: 'noteImages',
      key: 'img-uuid-1',
      op: 'delete',
      storagePath: 'vocab/abc/img-uuid-1.jpg',
    })
    expect(queued[0]!.deletedAt).toEqual(expect.any(String))
  })

  it('the local row is gone either way, regardless of whether it had been uploaded', async () => {
    const id = await db.noteImages.add({ noteKey: 'key-a', blob: makeBlob(1), sort: 0, remoteId: 'img-uuid-1', storagePath: 'vocab/abc/img-uuid-1.jpg' })

    await removeNoteImage(id)

    expect(await db.noteImages.get(id)).toBeUndefined()
  })

  it('deleteNoteImagesByKey enqueues one tombstone per uploaded image and none for never-uploaded ones', async () => {
    await db.noteImages.add({ noteKey: 'key-a', blob: makeBlob(1), sort: 0, remoteId: 'img-uploaded', storagePath: 'vocab/abc/img-uploaded.jpg' })
    await db.noteImages.add({ noteKey: 'key-a', blob: makeBlob(2), sort: 1, remoteId: 'img-not-uploaded' })

    await deleteNoteImagesByKey('key-a')

    expect(await listNoteImages('key-a')).toHaveLength(0)
    const queued = await db.syncQueue.where('table').equals('noteImages').toArray()
    expect(queued).toHaveLength(1)
    expect(queued[0]).toMatchObject({ key: 'img-uploaded', op: 'delete' })
  })
})

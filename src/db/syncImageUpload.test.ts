import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from './schema.ts'

const mockGetSession = vi.fn()
const mockUpload = vi.fn(async (_path: string, _blob: Blob, _opts: unknown) => ({ data: {}, error: null }) as { data: unknown; error: unknown })
const mockStorageFrom = vi.fn((bucket: string) => ({
  upload: (path: string, blob: Blob, opts: unknown) => mockUpload(`${bucket}::${path}`, blob, opts),
}))

vi.mock('./supabase.ts', () => ({
  supabase: {
    auth: { getSession: mockGetSession },
    storage: { from: mockStorageFrom },
  },
}))

const { uploadPendingImages } = await import('./syncImageUpload.ts')

const FAKE_SESSION = { data: { session: { user: { email: 'a@b.com' } } } }

function makeBlob(byte: number, size = 1): Blob {
  return new Blob([new Uint8Array(size).fill(byte)], { type: 'image/jpeg' })
}

beforeEach(async () => {
  await db.noteImages.clear()
  mockGetSession.mockReset().mockResolvedValue(FAKE_SESSION)
  mockUpload.mockReset().mockResolvedValue({ data: {}, error: null })
  mockStorageFrom.mockClear()
})

describe('uploadPendingImages — not logged in', () => {
  it('no-ops and leaves storagePath unset', async () => {
    await db.noteImages.add({ noteKey: 'vocab:v1', blob: makeBlob(1), sort: 0, remoteId: 'img-uuid-1' })
    mockGetSession.mockResolvedValue({ data: { session: null } })

    await uploadPendingImages()

    expect(mockStorageFrom).not.toHaveBeenCalled()
    const row = await db.noteImages.where('noteKey').equals('vocab:v1').first()
    expect(row!.storagePath).toBeUndefined()
  })
})

describe('uploadPendingImages — success', () => {
  it('uploads an item-note image with the expected path and marks storagePath', async () => {
    const id = await db.noteImages.add({ noteKey: 'vocab:v1', blob: makeBlob(1), sort: 0, remoteId: 'img-uuid-1' })

    await uploadPendingImages()

    expect(mockUpload).toHaveBeenCalledTimes(1)
    const [pathArg, , opts] = mockUpload.mock.calls[0]!
    expect(pathArg).toBe('kotoba-note-images::vocab/v1/img-uuid-1.jpg')
    expect(opts).toEqual({ upsert: true, contentType: 'image/jpeg' })
    const row = await db.noteImages.get(id)
    expect(row!.storagePath).toBe('vocab/v1/img-uuid-1.jpg')
  })

  it('uploads a standalone-note image with the standalone/{id}/ path prefix', async () => {
    const id = await db.noteImages.add({ noteKey: 'standalone:42', blob: makeBlob(1), sort: 0, remoteId: 'img-uuid-2' })

    await uploadPendingImages()

    const [pathArg] = mockUpload.mock.calls[0]!
    expect(pathArg).toBe('kotoba-note-images::standalone/42/img-uuid-2.jpg')
    const row = await db.noteImages.get(id)
    expect(row!.storagePath).toBe('standalone/42/img-uuid-2.jpg')
  })

  it('does not re-upload an image that already has a storagePath', async () => {
    await db.noteImages.add({ noteKey: 'vocab:v1', blob: makeBlob(1), sort: 0, remoteId: 'img-uuid-1', storagePath: 'vocab/v1/img-uuid-1.jpg' })

    await uploadPendingImages()

    expect(mockUpload).not.toHaveBeenCalled()
  })

  // fake-indexeddb (as used here, under jsdom) doesn't structured-clone Blob
  // values correctly — the same known limitation documented in Phase 8's
  // backup.test.ts. uploadPendingImages() necessarily reads the blob back
  // out of Dexie before uploading it, so this test can't verify byte
  // fidelity through the DB layer in this environment (real browsers are
  // unaffected); it instead proves the size doesn't trip up upload logic.
  it('a ~780KB blob (near the compressor cap) uploads successfully, not rejected or silently skipped for its size', async () => {
    const bigBlob = new Blob([new Uint8Array(780 * 1024)], { type: 'image/jpeg' })
    const id = await db.noteImages.add({ noteKey: 'vocab:v1', blob: bigBlob, sort: 0, remoteId: 'img-uuid-big' })

    await uploadPendingImages()

    expect(mockUpload).toHaveBeenCalledTimes(1)
    const row = await db.noteImages.get(id)
    expect(row!.storagePath).toBe('vocab/v1/img-uuid-big.jpg')
  })
})

describe('uploadPendingImages — failure', () => {
  it('leaves storagePath unset and the row otherwise intact when the upload throws', async () => {
    const id = await db.noteImages.add({ noteKey: 'vocab:v1', blob: makeBlob(7), sort: 0, remoteId: 'img-uuid-1' })
    mockUpload.mockRejectedValue(new Error('network down'))

    await expect(uploadPendingImages()).resolves.toBeUndefined()

    const row = await db.noteImages.get(id)
    expect(row!.storagePath).toBeUndefined()
    expect(row!.noteKey).toBe('vocab:v1')
    expect(row!.remoteId).toBe('img-uuid-1')
  })

  it('leaves storagePath unset when the API returns an error object', async () => {
    const id = await db.noteImages.add({ noteKey: 'vocab:v1', blob: makeBlob(1), sort: 0, remoteId: 'img-uuid-1' })
    mockUpload.mockResolvedValue({ data: null, error: { message: 'rejected' } })

    await uploadPendingImages()

    const row = await db.noteImages.get(id)
    expect(row!.storagePath).toBeUndefined()
  })

  it('one failing image does not block the others from uploading', async () => {
    const failId = await db.noteImages.add({ noteKey: 'vocab:v1', blob: makeBlob(1), sort: 0, remoteId: 'img-uuid-fail' })
    const okId = await db.noteImages.add({ noteKey: 'vocab:v2', blob: makeBlob(2), sort: 0, remoteId: 'img-uuid-ok' })
    mockUpload.mockImplementation(async (path) =>
      path.includes('img-uuid-fail') ? Promise.reject(new Error('down')) : { data: {}, error: null },
    )

    await uploadPendingImages()

    expect((await db.noteImages.get(failId))!.storagePath).toBeUndefined()
    expect((await db.noteImages.get(okId))!.storagePath).toBe('vocab/v2/img-uuid-ok.jpg')
  })

  it('is retried successfully on a later call after a prior failure', async () => {
    const id = await db.noteImages.add({ noteKey: 'vocab:v1', blob: makeBlob(1), sort: 0, remoteId: 'img-uuid-1' })
    mockUpload.mockRejectedValueOnce(new Error('network down'))

    await uploadPendingImages()
    expect((await db.noteImages.get(id))!.storagePath).toBeUndefined()

    await uploadPendingImages()
    expect((await db.noteImages.get(id))!.storagePath).toBe('vocab/v1/img-uuid-1.jpg')
  })
})

describe('uploadPendingImages — never loses or alters local images', () => {
  it('only storagePath changes; id/noteKey/sort/remoteId and the row count are untouched', async () => {
    const id = await db.noteImages.add({ noteKey: 'vocab:v1', blob: makeBlob(5), sort: 2, remoteId: 'img-uuid-1' })
    const before = await db.noteImages.get(id)

    await uploadPendingImages()

    const after = await db.noteImages.get(id)
    expect(after!.id).toBe(before!.id)
    expect(after!.noteKey).toBe(before!.noteKey)
    expect(after!.sort).toBe(before!.sort)
    expect(after!.remoteId).toBe(before!.remoteId)
    expect(await db.noteImages.count()).toBe(1)
  })
})

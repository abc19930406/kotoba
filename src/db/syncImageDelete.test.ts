import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from './schema.ts'

const mockGetSession = vi.fn()
const mockSelect = vi.fn(async (_table: string) => ({ data: [] as { remote_id: string }[] | null, error: null as unknown }))
const mockRemove = vi.fn(async (_paths: string[]) => ({ error: null as unknown }))

const mockFrom = vi.fn((table: string) => ({
  select: () => mockSelect(table),
}))
const mockStorageFrom = vi.fn((_bucket: string) => ({ remove: mockRemove }))

vi.mock('./supabase.ts', () => ({
  supabase: {
    auth: { getSession: mockGetSession },
    from: mockFrom,
    storage: { from: mockStorageFrom },
  },
}))

const { applyImageDeletions } = await import('./syncImageDelete.ts')

const FAKE_SESSION = { data: { session: { user: { email: 'a@b.com' } } } }

function makeBlob(byte: number): Blob {
  return new Blob([new Uint8Array([byte])], { type: 'image/jpeg' })
}

beforeEach(async () => {
  await db.noteImages.clear()
  mockGetSession.mockReset().mockResolvedValue(FAKE_SESSION)
  mockSelect.mockReset().mockResolvedValue({ data: [], error: null })
  mockRemove.mockReset().mockResolvedValue({ error: null })
  mockFrom.mockClear()
  mockStorageFrom.mockClear()
})

describe('applyImageDeletions — not logged in', () => {
  it('no-ops and touches nothing', async () => {
    await db.noteImages.add({ noteKey: 'vocab:v1', blob: makeBlob(1), sort: 0, remoteId: 'img-1', storagePath: 'vocab/x/img-1.jpg' })
    mockGetSession.mockResolvedValue({ data: { session: null } })

    await applyImageDeletions()

    expect(mockFrom).not.toHaveBeenCalled()
    expect(await db.noteImages.count()).toBe(1)
  })
})

describe('applyImageDeletions — tombstone matches a local image', () => {
  it('removes the Storage object first, then deletes the local row', async () => {
    await db.noteImages.add({ noteKey: 'vocab:v1', blob: makeBlob(1), sort: 0, remoteId: 'img-1', storagePath: 'vocab/x/img-1.jpg' })
    mockSelect.mockResolvedValue({ data: [{ remote_id: 'img-1' }], error: null })

    await applyImageDeletions()

    expect(mockStorageFrom).toHaveBeenCalledWith('kotoba-note-images')
    expect(mockRemove).toHaveBeenCalledWith(['vocab/x/img-1.jpg'])
    expect(await db.noteImages.where('remoteId').equals('img-1').first()).toBeUndefined()
  })

  it('deletes the local row even if it was never uploaded (no storagePath) — skips the Storage call', async () => {
    await db.noteImages.add({ noteKey: 'vocab:v1', blob: makeBlob(1), sort: 0, remoteId: 'img-1' })
    mockSelect.mockResolvedValue({ data: [{ remote_id: 'img-1' }], error: null })

    await applyImageDeletions()

    expect(mockRemove).not.toHaveBeenCalled()
    expect(await db.noteImages.where('remoteId').equals('img-1').first()).toBeUndefined()
  })
})

describe('applyImageDeletions — no matching local image', () => {
  it('is a no-op — never deletes an image with no matching tombstone', async () => {
    await db.noteImages.add({ noteKey: 'vocab:v1', blob: makeBlob(1), sort: 0, remoteId: 'img-local-only', storagePath: 'vocab/x/img-local-only.jpg' })
    // Tombstone exists for a totally different remoteId — the local image
    // here has no tombstone at all.
    mockSelect.mockResolvedValue({ data: [{ remote_id: 'img-somewhere-else' }], error: null })

    await applyImageDeletions()

    expect(mockRemove).not.toHaveBeenCalled()
    expect(await db.noteImages.where('remoteId').equals('img-local-only').first()).toBeDefined()
  })
})

describe('applyImageDeletions — resilience', () => {
  it('a failed Storage removal leaves the local row intact, so the next pull retries both steps', async () => {
    await db.noteImages.add({ noteKey: 'vocab:v1', blob: makeBlob(1), sort: 0, remoteId: 'img-1', storagePath: 'vocab/x/img-1.jpg' })
    mockSelect.mockResolvedValue({ data: [{ remote_id: 'img-1' }], error: null })
    mockRemove.mockResolvedValue({ error: { message: 'storage down' } })

    await applyImageDeletions()

    const local = await db.noteImages.where('remoteId').equals('img-1').first()
    expect(local).toBeDefined()
    expect(local!.storagePath).toBe('vocab/x/img-1.jpg')
  })

  it('one failing tombstone does not block the others from being applied', async () => {
    await db.noteImages.add({ noteKey: 'vocab:v1', blob: makeBlob(1), sort: 0, remoteId: 'img-bad', storagePath: 'vocab/x/img-bad.jpg' })
    await db.noteImages.add({ noteKey: 'vocab:v2', blob: makeBlob(2), sort: 0, remoteId: 'img-good', storagePath: 'vocab/x/img-good.jpg' })
    mockSelect.mockResolvedValue({ data: [{ remote_id: 'img-bad' }, { remote_id: 'img-good' }], error: null })
    mockRemove.mockImplementation(async (paths: string[]) =>
      paths[0] === 'vocab/x/img-bad.jpg' ? { error: { message: 'down' } } : { error: null },
    )

    await applyImageDeletions()

    expect(await db.noteImages.where('remoteId').equals('img-bad').first()).toBeDefined()
    expect(await db.noteImages.where('remoteId').equals('img-good').first()).toBeUndefined()
  })

  it('resolves without throwing when fetching the tombstone table itself fails', async () => {
    await db.noteImages.add({ noteKey: 'vocab:v1', blob: makeBlob(1), sort: 0, remoteId: 'img-1', storagePath: 'vocab/x/img-1.jpg' })
    mockSelect.mockResolvedValue({ data: null, error: { message: 'network down' } })

    await expect(applyImageDeletions()).resolves.toBeUndefined()
    expect(await db.noteImages.count()).toBe(1)
  })
})

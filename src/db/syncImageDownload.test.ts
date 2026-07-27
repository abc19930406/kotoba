import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from './schema.ts'

type ListResult = { data: { name: string }[] | null; error: unknown }
type DownloadResult = { data: Blob | null; error: unknown }

const mockGetSession = vi.fn()
const mockList = vi.fn(async (_pathArg: string): Promise<ListResult> => ({ data: [], error: null }))
const mockDownload = vi.fn(async (_pathArg: string): Promise<DownloadResult> => ({ data: null, error: null }))
const mockUpload = vi.fn(async (_pathArg: string, _blob: Blob, _opts: unknown) => ({ data: {}, error: null }) as { data: unknown; error: unknown })
const mockStorageFrom = vi.fn((bucket: string) => ({
  list: (path: string) => mockList(`${bucket}::${path}`),
  download: (path: string) => mockDownload(`${bucket}::${path}`),
  upload: (path: string, blob: Blob, opts: unknown) => mockUpload(`${bucket}::${path}`, blob, opts),
}))

vi.mock('./supabase.ts', () => ({
  supabase: {
    auth: { getSession: mockGetSession },
    storage: { from: mockStorageFrom },
  },
}))

const { downloadPendingImages } = await import('./syncImageDownload.ts')
const { uploadPendingImages } = await import('./syncImageUpload.ts')

const FAKE_SESSION = { data: { session: { user: { email: 'a@b.com' } } } }
const BUCKET_PREFIX = 'kotoba-note-images::'

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function itemPrefix(itemType: string, itemId: string): Promise<string> {
  const hash = (await sha256Hex(itemId)).slice(0, 16)
  return `${itemType}/${hash}`
}

function makeBlob(byte: number): Blob {
  return new Blob([new Uint8Array([byte])], { type: 'image/jpeg' })
}

/** Wires mockList/mockDownload so `prefix` behaves like a real Storage folder containing exactly `files` (name -> Blob). Any other prefix lists empty. */
function serveFolder(prefix: string, files: Record<string, Blob>) {
  mockList.mockImplementation(async (pathArg: string) => {
    if (pathArg === `${BUCKET_PREFIX}${prefix}`) {
      return { data: Object.keys(files).map((name) => ({ name })), error: null }
    }
    return { data: [], error: null }
  })
  mockDownload.mockImplementation(async (pathArg: string) => {
    for (const [name, blob] of Object.entries(files)) {
      if (pathArg === `${BUCKET_PREFIX}${prefix}/${name}`) return { data: blob, error: null }
    }
    return { data: null, error: null }
  })
}

beforeEach(async () => {
  await db.notes.clear()
  await db.noteImages.clear()
  await db.standaloneNotes.clear()
  mockGetSession.mockReset().mockResolvedValue(FAKE_SESSION)
  mockList.mockReset().mockResolvedValue({ data: [], error: null })
  mockDownload.mockReset().mockResolvedValue({ data: null, error: null })
  mockUpload.mockReset().mockResolvedValue({ data: {}, error: null })
  mockStorageFrom.mockClear()
})

describe('downloadPendingImages — not logged in', () => {
  it('no-ops and downloads nothing', async () => {
    await db.notes.add({ itemType: 'vocab', itemId: 'v1', text: '', updatedAt: new Date() })
    mockGetSession.mockResolvedValue({ data: { session: null } })

    await downloadPendingImages()

    expect(mockList).not.toHaveBeenCalled()
    expect(await db.noteImages.count()).toBe(0)
  })
})

describe('downloadPendingImages — local missing, cloud has it (vocab/grammar item notes)', () => {
  it('downloads the image and attaches it to the correct note with the right remoteId/storagePath', async () => {
    await db.notes.add({ itemType: 'vocab', itemId: 'v1', text: '筆記', updatedAt: new Date() })
    const prefix = await itemPrefix('vocab', 'v1')
    serveFolder(prefix, { 'img-remote-1.jpg': makeBlob(9) })

    await downloadPendingImages()

    // Asserts the download step itself ran (not just list()) — a Phase C4b
    // bug shipped where the code only ever listed the cloud folder and
    // silently never reached .download() for any listed file; a test that
    // only checked "images.length === 1" wouldn't have caught it if a mock
    // slip made that assertion pass some other way, so this checks the mock
    // call directly too.
    expect(mockDownload).toHaveBeenCalledWith(`${BUCKET_PREFIX}${prefix}/img-remote-1.jpg`)

    const images = await db.noteImages.where('noteKey').equals('vocab:v1').toArray()
    expect(images).toHaveLength(1)
    expect(images[0]!.remoteId).toBe('img-remote-1')
    expect(images[0]!.storagePath).toBe(`${prefix}/img-remote-1.jpg`)
  })

  it('also works for a grammar note (hash-based prefix, same as vocab)', async () => {
    const nastyItemId = 'N5-～（場所）に～があります'
    await db.notes.add({ itemType: 'grammar', itemId: nastyItemId, text: '', updatedAt: new Date() })
    const prefix = await itemPrefix('grammar', nastyItemId)
    serveFolder(prefix, { 'img-g1.jpg': makeBlob(1) })

    await downloadPendingImages()

    const images = await db.noteImages.where('noteKey').equals(`grammar:${nastyItemId}`).toArray()
    expect(images).toHaveLength(1)
    expect(images[0]!.storagePath).toBe(`${prefix}/img-g1.jpg`)
  })
})

describe('downloadPendingImages — local missing, cloud has it (standalone notes)', () => {
  it('downloads using the note\'s remoteId-based prefix, not its local id', async () => {
    const localId = await db.standaloneNotes.add({ remoteId: 'note-uuid-7', title: 't', text: '', updatedAt: new Date() })
    serveFolder('standalone/note-uuid-7', { 'img-s1.jpg': makeBlob(2) })

    await downloadPendingImages()

    const images = await db.noteImages.where('noteKey').equals(`standalone:${localId}`).toArray()
    expect(images).toHaveLength(1)
    expect(images[0]!.storagePath).toBe('standalone/note-uuid-7/img-s1.jpg')
  })
})

describe('downloadPendingImages — already local', () => {
  it('does not re-download an image whose remoteId already exists locally', async () => {
    await db.notes.add({ itemType: 'vocab', itemId: 'v1', text: '', updatedAt: new Date() })
    await db.noteImages.add({ noteKey: 'vocab:v1', blob: makeBlob(3), sort: 0, remoteId: 'already-here', storagePath: 'vocab/x/already-here.jpg' })
    const prefix = await itemPrefix('vocab', 'v1')
    serveFolder(prefix, { 'already-here.jpg': makeBlob(3) })

    await downloadPendingImages()

    expect(mockDownload).not.toHaveBeenCalled()
    expect(await db.noteImages.where('noteKey').equals('vocab:v1').count()).toBe(1)
  })
})

describe('downloadPendingImages — anti-loop', () => {
  it('a downloaded image is never picked up by uploadPendingImages afterwards', async () => {
    await db.notes.add({ itemType: 'vocab', itemId: 'v1', text: '', updatedAt: new Date() })
    const prefix = await itemPrefix('vocab', 'v1')
    serveFolder(prefix, { 'downloaded-1.jpg': makeBlob(5) })

    await downloadPendingImages()
    await uploadPendingImages()

    expect(mockUpload).not.toHaveBeenCalled()
  })
})

describe('downloadPendingImages — never deletes or alters local images', () => {
  it('an image missing from the cloud folder is left alone locally', async () => {
    await db.notes.add({ itemType: 'vocab', itemId: 'v1', text: '', updatedAt: new Date() })
    const id = await db.noteImages.add({ noteKey: 'vocab:v1', blob: makeBlob(4), sort: 0, remoteId: 'local-only', storagePath: 'vocab/x/local-only.jpg' })
    const prefix = await itemPrefix('vocab', 'v1')
    serveFolder(prefix, {}) // cloud folder empty — local-only isn't there

    await downloadPendingImages()

    const row = await db.noteImages.get(id)
    expect(row).toBeDefined()
    expect(row!.remoteId).toBe('local-only')
    expect(await db.noteImages.count()).toBe(1)
  })
})

describe('downloadPendingImages — interruption resilience', () => {
  it('a note whose .list() throws is skipped without losing local data or blocking other notes', async () => {
    await db.notes.add({ itemType: 'vocab', itemId: 'broken', text: '', updatedAt: new Date() })
    await db.notes.add({ itemType: 'vocab', itemId: 'fine', text: '', updatedAt: new Date() })
    const brokenPrefix = await itemPrefix('vocab', 'broken')
    const finePrefix = await itemPrefix('vocab', 'fine')
    mockList.mockImplementation(async (pathArg: string) => {
      if (pathArg === `${BUCKET_PREFIX}${brokenPrefix}`) throw new Error('network down')
      if (pathArg === `${BUCKET_PREFIX}${finePrefix}`) return { data: [{ name: 'ok.jpg' }], error: null }
      return { data: [], error: null }
    })
    mockDownload.mockImplementation(async (pathArg: string) => {
      if (pathArg === `${BUCKET_PREFIX}${finePrefix}/ok.jpg`) return { data: makeBlob(1), error: null }
      return { data: null, error: null }
    })

    await expect(downloadPendingImages()).resolves.toBeUndefined()

    expect(await db.noteImages.where('noteKey').equals('vocab:fine').count()).toBe(1)
    expect(await db.noteImages.where('noteKey').equals('vocab:broken').count()).toBe(0)
  })

  it('one image failing to .download() within a note does not block the note\'s other images', async () => {
    await db.notes.add({ itemType: 'vocab', itemId: 'v1', text: '', updatedAt: new Date() })
    const prefix = await itemPrefix('vocab', 'v1')
    mockList.mockResolvedValue({ data: [{ name: 'bad.jpg' }, { name: 'good.jpg' }], error: null })
    mockDownload.mockImplementation(async (pathArg: string) => {
      if (pathArg === `${BUCKET_PREFIX}${prefix}/bad.jpg`) throw new Error('download failed')
      if (pathArg === `${BUCKET_PREFIX}${prefix}/good.jpg`) return { data: makeBlob(2), error: null }
      return { data: null, error: null }
    })

    await downloadPendingImages()

    const images = await db.noteImages.where('noteKey').equals('vocab:v1').toArray()
    expect(images.map((i) => i.remoteId)).toEqual(['good'])
  })

  // Real Supabase Storage failures (e.g. an RLS policy that permits list()
  // but denies the actual object GET — plausible root cause for a Phase
  // C4b field report of "list succeeds, download never appears in Network")
  // resolve as { data: null, error: {...} } rather than throwing. The code
  // must catch this shape too, not just a thrown exception, and — since a
  // silently-swallowed failure here is indistinguishable from "download was
  // never attempted" from the outside — must actually surface it somewhere
  // observable (console.warn) instead of failing invisibly forever.
  it('a .download() that resolves with an error object (not a thrown exception) is treated as a failure and logged', async () => {
    await db.notes.add({ itemType: 'vocab', itemId: 'v1', text: '', updatedAt: new Date() })
    const prefix = await itemPrefix('vocab', 'v1')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockList.mockResolvedValue({ data: [{ name: 'denied.jpg' }], error: null })
    mockDownload.mockResolvedValue({ data: null, error: { message: 'permission denied' } })

    await expect(downloadPendingImages()).resolves.toBeUndefined()

    expect(await db.noteImages.where('noteKey').equals('vocab:v1').count()).toBe(0)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(`${prefix}/denied.jpg`), expect.anything())
    warnSpy.mockRestore()
  })
})

describe('downloadPendingImages — correct note association', () => {
  it('does not cross-contaminate images between two different notes', async () => {
    await db.notes.add({ itemType: 'vocab', itemId: 'v1', text: '', updatedAt: new Date() })
    await db.notes.add({ itemType: 'vocab', itemId: 'v2', text: '', updatedAt: new Date() })
    const prefix1 = await itemPrefix('vocab', 'v1')
    const prefix2 = await itemPrefix('vocab', 'v2')
    mockList.mockImplementation(async (pathArg: string) => {
      if (pathArg === `${BUCKET_PREFIX}${prefix1}`) return { data: [{ name: 'img-a.jpg' }], error: null }
      if (pathArg === `${BUCKET_PREFIX}${prefix2}`) return { data: [{ name: 'img-b.jpg' }], error: null }
      return { data: [], error: null }
    })
    mockDownload.mockImplementation(async (pathArg: string) => {
      if (pathArg === `${BUCKET_PREFIX}${prefix1}/img-a.jpg`) return { data: makeBlob(1), error: null }
      if (pathArg === `${BUCKET_PREFIX}${prefix2}/img-b.jpg`) return { data: makeBlob(2), error: null }
      return { data: null, error: null }
    })

    await downloadPendingImages()

    const notesImages1 = await db.noteImages.where('noteKey').equals('vocab:v1').toArray()
    const notesImages2 = await db.noteImages.where('noteKey').equals('vocab:v2').toArray()
    expect(notesImages1.map((i) => i.remoteId)).toEqual(['img-a'])
    expect(notesImages2.map((i) => i.remoteId)).toEqual(['img-b'])
  })
})

describe('downloadPendingImages — respects MAX_NOTE_IMAGES on download', () => {
  it('does not download a 5th image when the note already has 4 local images', async () => {
    await db.notes.add({ itemType: 'vocab', itemId: 'v1', text: '', updatedAt: new Date() })
    for (let i = 0; i < 4; i++) {
      await db.noteImages.add({ noteKey: 'vocab:v1', blob: makeBlob(i), sort: i, remoteId: `existing-${i}`, storagePath: `vocab/x/existing-${i}.jpg` })
    }
    const prefix = await itemPrefix('vocab', 'v1')
    serveFolder(prefix, { 'existing-0.jpg': makeBlob(0), 'a-5th-one.jpg': makeBlob(9) })

    await downloadPendingImages()

    expect(await db.noteImages.where('noteKey').equals('vocab:v1').count()).toBe(4)
    expect(await db.noteImages.where('remoteId').equals('a-5th-one').first()).toBeUndefined()
  })
})

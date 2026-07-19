import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './schema.ts'
import {
  listStandaloneNotes,
  getStandaloneNote,
  createStandaloneNote,
  updateStandaloneNote,
  addStandaloneNoteImage,
  removeStandaloneNoteImage,
  deleteStandaloneNote,
} from './standaloneNotes.ts'

function makeBlob(byte: number): Blob {
  return new Blob([new Uint8Array([byte])], { type: 'image/jpeg' })
}

beforeEach(async () => {
  await db.standaloneNotes.clear()
  await db.noteImages.clear()
})

describe('createStandaloneNote / getStandaloneNote', () => {
  it('creates a note and returns it with no images', async () => {
    const id = await createStandaloneNote('標題', '內文')
    const note = await getStandaloneNote(id)
    expect(note).toMatchObject({ id, title: '標題', text: '內文', images: [] })
  })

  it('returns null for a non-existent id', async () => {
    expect(await getStandaloneNote(999999)).toBeNull()
  })
})

describe('updateStandaloneNote', () => {
  it('updates title, text, and updatedAt', async () => {
    const id = await createStandaloneNote('原標題', '原內文')
    const before = await getStandaloneNote(id)

    await updateStandaloneNote(id, '新標題', '新內文')

    const after = await getStandaloneNote(id)
    expect(after).toMatchObject({ title: '新標題', text: '新內文' })
    expect(after!.updatedAt.getTime()).toBeGreaterThanOrEqual(before!.updatedAt.getTime())
  })
})

describe('listStandaloneNotes', () => {
  it('sorts by updatedAt descending, most recently updated first', async () => {
    const id1 = await createStandaloneNote('第一篇', '')
    await new Promise((r) => setTimeout(r, 5))
    const id2 = await createStandaloneNote('第二篇', '')
    await new Promise((r) => setTimeout(r, 5))
    await updateStandaloneNote(id1, '第一篇（已更新）', '')

    const list = await listStandaloneNotes()
    expect(list.map((n) => n.id)).toEqual([id1, id2])
  })

  it('includes the first image (sort=0) as firstImage when present', async () => {
    const id = await createStandaloneNote('有圖', '')
    await addStandaloneNoteImage(id, makeBlob(1))
    await addStandaloneNoteImage(id, makeBlob(2))

    const list = await listStandaloneNotes()
    expect(list[0].firstImage).not.toBeNull()
  })

  it('firstImage is null when the note has no images', async () => {
    await createStandaloneNote('沒圖', '')
    const list = await listStandaloneNotes()
    expect(list[0].firstImage).toBeNull()
  })
})

describe('addStandaloneNoteImage / removeStandaloneNoteImage', () => {
  it('allows up to 4 images and rejects a 5th', async () => {
    const id = await createStandaloneNote('筆記', '')
    for (let i = 0; i < 4; i++) {
      expect(await addStandaloneNoteImage(id, makeBlob(i))).toEqual({ ok: true })
    }
    expect(await addStandaloneNoteImage(id, makeBlob(99))).toEqual({ ok: false, reason: 'max-reached' })

    const note = await getStandaloneNote(id)
    expect(note!.images).toHaveLength(4)
  })

  it('two notes track their image limits independently (noteKey namespace isolation)', async () => {
    const id1 = await createStandaloneNote('筆記一', '')
    const id2 = await createStandaloneNote('筆記二', '')
    for (let i = 0; i < 4; i++) await addStandaloneNoteImage(id1, makeBlob(i))

    expect(await addStandaloneNoteImage(id2, makeBlob(0))).toEqual({ ok: true })
    expect((await getStandaloneNote(id1))!.images).toHaveLength(4)
    expect((await getStandaloneNote(id2))!.images).toHaveLength(1)
  })

  it('removeStandaloneNoteImage removes only the targeted image', async () => {
    const id = await createStandaloneNote('筆記', '')
    await addStandaloneNoteImage(id, makeBlob(1))
    await addStandaloneNoteImage(id, makeBlob(2))
    const [keep, remove] = (await getStandaloneNote(id))!.images

    await removeStandaloneNoteImage(remove.id!)

    const note = await getStandaloneNote(id)
    expect(note!.images).toHaveLength(1)
    expect(note!.images[0].id).toBe(keep.id)
  })
})

describe('deleteStandaloneNote', () => {
  it('removes the note and all its images, without touching another note', async () => {
    const id1 = await createStandaloneNote('要刪除', '')
    await addStandaloneNoteImage(id1, makeBlob(1))
    const id2 = await createStandaloneNote('要保留', '')
    await addStandaloneNoteImage(id2, makeBlob(2))

    await deleteStandaloneNote(id1)

    expect(await getStandaloneNote(id1)).toBeNull()
    const kept = await getStandaloneNote(id2)
    expect(kept?.title).toBe('要保留')
    expect(kept?.images).toHaveLength(1)
  })
})

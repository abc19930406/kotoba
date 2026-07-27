import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { db } from '../../db/schema.ts'
import { resetBackStackForTests } from '../../shared/backStack.ts'
import { getStandaloneNote } from '../../db/standaloneNotes.ts'
import { NotebookEditorPage } from './NotebookEditorPage.tsx'

// createStandaloneNote/updateStandaloneNote's enqueueSync() otherwise fires a
// real 5s debounce timer — irrelevant to these tests.
vi.mock('../../shared/syncEngine.ts', () => ({
  scheduleSyncPush: vi.fn(),
  syncNow: vi.fn(),
  initSyncEngine: vi.fn(),
}))

// compressImage() calls createImageBitmap(), which jsdom doesn't implement —
// no existing component test in this codebase exercises the real
// file-picker → compressImage path (image-adding is otherwise tested at the
// db layer directly), so this is the first to hit it. These tests check the
// component's orchestration (does it create the note, does it attach the
// image) rather than the compression algorithm itself, which already can't
// run in this environment regardless — mocked through, matching the
// established "test around the jsdom limitation" pattern used elsewhere for
// fake-indexeddb's Blob gap.
vi.mock('../../shared/imageCompression.ts', () => ({
  compressImage: vi.fn(async (file: Blob) => file),
}))

beforeEach(async () => {
  await db.standaloneNotes.clear()
  await db.noteImages.clear()
  resetBackStackForTests()
  // A Blob round-tripped through fake-indexeddb (as used here, under jsdom)
  // comes back corrupted — the same known Phase 8 limitation documented in
  // backup.test.ts. NoteImageThumb's URL.createObjectURL(blob) would throw
  // on it; neutralized here since these tests only need to confirm the
  // image record exists in the DB, not that the thumbnail visually renders.
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
})

describe('NotebookEditorPage — new note', () => {
  it('blocks save and shows an error when the title is empty', async () => {
    render(<NotebookEditorPage noteId={null} onBack={() => {}} />)

    fireEvent.click(screen.getByText('儲存'))

    expect(await screen.findByText('請輸入標題')).toBeInTheDocument()
    expect(await db.standaloneNotes.count()).toBe(0)
  })

  it('creates the note on save', async () => {
    render(<NotebookEditorPage noteId={null} onBack={() => {}} />)

    fireEvent.change(screen.getByPlaceholderText('標題'), { target: { value: '我的筆記' } })
    fireEvent.change(screen.getByPlaceholderText('寫點什麼…'), { target: { value: '內容' } })
    fireEvent.click(screen.getByText('儲存'))

    await waitFor(async () => expect(await db.standaloneNotes.count()).toBe(1))
  })

  it('shows the 加入圖片 control immediately, even before the note is ever saved (matches Phase 8 item notes)', async () => {
    render(<NotebookEditorPage noteId={null} onBack={() => {}} />)

    expect(screen.getByText('加入圖片')).toBeInTheDocument()
  })
})

function makeImageFile(): File {
  return new File([new Uint8Array([1, 2, 3])], 'photo.jpg', { type: 'image/jpeg' })
}

describe('NotebookEditorPage — adding an image before the note has ever been saved', () => {
  it('blocks the image and shows the same 請輸入標題 error when the title is empty', async () => {
    render(<NotebookEditorPage noteId={null} onBack={() => {}} />)

    const fileInput = document.querySelector('input[type="file"]')!
    fireEvent.change(fileInput, { target: { files: [makeImageFile()] } })

    expect(await screen.findByText('請輸入標題')).toBeInTheDocument()
    expect(await db.standaloneNotes.count()).toBe(0)
  })

  it('auto-creates the note (using the current title/text draft) and attaches the image', async () => {
    render(<NotebookEditorPage noteId={null} onBack={() => {}} />)
    fireEvent.change(screen.getByPlaceholderText('標題'), { target: { value: '拍照筆記' } })
    fireEvent.change(screen.getByPlaceholderText('寫點什麼…'), { target: { value: '內容' } })

    const fileInput = document.querySelector('input[type="file"]')!
    fireEvent.change(fileInput, { target: { files: [makeImageFile()] } })

    await waitFor(async () => expect(await db.standaloneNotes.count()).toBe(1))
    const notes = await db.standaloneNotes.toArray()
    expect(notes[0]).toMatchObject({ title: '拍照筆記', text: '內容' })
    const saved = await getStandaloneNote(notes[0].id!)
    expect(saved!.images).toHaveLength(1)
  })

  it('does not create a duplicate note if the user saves after the image already created it', async () => {
    render(<NotebookEditorPage noteId={null} onBack={() => {}} />)
    fireEvent.change(screen.getByPlaceholderText('標題'), { target: { value: '拍照筆記' } })

    const fileInput = document.querySelector('input[type="file"]')!
    fireEvent.change(fileInput, { target: { files: [makeImageFile()] } })
    await waitFor(async () => expect(await db.standaloneNotes.count()).toBe(1))

    fireEvent.click(screen.getByText('儲存'))

    await waitFor(async () => expect(await db.standaloneNotes.count()).toBe(1))
  })
})

describe('NotebookEditorPage — existing note deletion', () => {
  it('deletes the note only after the confirm dialog is confirmed, not before', async () => {
    render(<NotebookEditorPage noteId={null} onBack={() => {}} />)
    fireEvent.change(screen.getByPlaceholderText('標題'), { target: { value: '要刪除的筆記' } })
    fireEvent.click(screen.getByText('儲存'))
    await waitFor(() => screen.getByText('刪除整篇筆記'))

    fireEvent.click(screen.getByText('刪除整篇筆記'))
    expect(await screen.findByText(/確定要刪除「要刪除的筆記」嗎/)).toBeInTheDocument()
    expect(await db.standaloneNotes.count()).toBe(1)

    fireEvent.click(screen.getByText('取消'))
    await waitFor(() => expect(screen.queryByText(/確定要刪除/)).not.toBeInTheDocument())
    expect(await db.standaloneNotes.count()).toBe(1)

    fireEvent.click(screen.getByText('刪除整篇筆記'))
    await screen.findByText(/確定要刪除/)
    fireEvent.click(screen.getByText('確定刪除'))

    await waitFor(async () => expect(await db.standaloneNotes.count()).toBe(0))
  })
})

describe('NotebookEditorPage — editing an existing note', () => {
  it('loads the existing title and text', async () => {
    const { createStandaloneNote } = await import('../../db/standaloneNotes.ts')
    const id = await createStandaloneNote('既有標題', '既有內文')

    render(<NotebookEditorPage noteId={id} onBack={() => {}} />)

    await waitFor(() => expect(screen.getByDisplayValue('既有標題')).toBeInTheDocument())
    expect(screen.getByDisplayValue('既有內文')).toBeInTheDocument()
    expect(await getStandaloneNote(id)).not.toBeNull()
  })
})

import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { db } from '../../db/schema.ts'
import { resetBackStackForTests } from '../../shared/backStack.ts'
import { getStandaloneNote } from '../../db/standaloneNotes.ts'
import { NotebookEditorPage } from './NotebookEditorPage.tsx'

beforeEach(async () => {
  await db.standaloneNotes.clear()
  await db.noteImages.clear()
  resetBackStackForTests()
})

describe('NotebookEditorPage — new note', () => {
  it('blocks save and shows an error when the title is empty', async () => {
    render(<NotebookEditorPage noteId={null} onBack={() => {}} />)

    fireEvent.click(screen.getByText('儲存'))

    expect(await screen.findByText('請輸入標題')).toBeInTheDocument()
    expect(await db.standaloneNotes.count()).toBe(0)
  })

  it('creates the note on save and reveals image management (no add-image control before the first save)', async () => {
    render(<NotebookEditorPage noteId={null} onBack={() => {}} />)

    expect(screen.queryByText('加入圖片')).not.toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('標題'), { target: { value: '我的筆記' } })
    fireEvent.change(screen.getByPlaceholderText('寫點什麼…'), { target: { value: '內容' } })
    fireEvent.click(screen.getByText('儲存'))

    await waitFor(() => expect(screen.getByText('加入圖片')).toBeInTheDocument())
    expect(await db.standaloneNotes.count()).toBe(1)
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

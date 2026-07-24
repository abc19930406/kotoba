import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { db } from '../../db/schema.ts'
import { getNote } from '../../db/notes.ts'
import { resetBackStackForTests } from '../../shared/backStack.ts'
import { NoteSection } from './NoteSection.tsx'

beforeEach(async () => {
  await db.notes.clear()
  await db.noteImages.clear()
  resetBackStackForTests()
})

describe('NoteSection', () => {
  it('shows 新增筆記 when there is no note yet', async () => {
    render(<NoteSection itemType="vocab" itemId="v1" />)
    await waitFor(() => expect(screen.getByText('新增筆記')).toBeInTheDocument())
  })

  it('lets the user type text and save it, then shows the read-only view', async () => {
    render(<NoteSection itemType="vocab" itemId="v1" />)
    await waitFor(() => screen.getByText('新增筆記'))

    fireEvent.click(screen.getByText('新增筆記'))
    fireEvent.change(screen.getByPlaceholderText('寫點什麼…'), { target: { value: '我的筆記' } })
    fireEvent.click(screen.getByText('儲存'))

    await waitFor(() => expect(screen.queryByPlaceholderText('寫點什麼…')).not.toBeInTheDocument())
    expect(screen.getByText('我的筆記')).toBeInTheDocument()
    expect(await getNote('vocab', 'v1')).toMatchObject({ text: '我的筆記' })
  })

  it('cancelling the confirm dialog leaves the note untouched', async () => {
    render(<NoteSection itemType="vocab" itemId="v1" />)
    await waitFor(() => screen.getByText('新增筆記'))
    fireEvent.click(screen.getByText('新增筆記'))
    fireEvent.change(screen.getByPlaceholderText('寫點什麼…'), { target: { value: '保留' } })
    fireEvent.click(screen.getByText('儲存'))
    await waitFor(() => expect(screen.queryByPlaceholderText('寫點什麼…')).not.toBeInTheDocument())

    fireEvent.click(screen.getByText('刪除筆記'))
    await waitFor(() => expect(screen.getByText(/此操作無法復原/)).toBeInTheDocument())

    fireEvent.click(screen.getByText('取消'))

    await waitFor(() => expect(screen.queryByText(/此操作無法復原/)).not.toBeInTheDocument())
    expect(await getNote('vocab', 'v1')).not.toBeNull()
  })

  it('deletes the note only after the confirm dialog is confirmed, not before', async () => {
    render(<NoteSection itemType="vocab" itemId="v1" />)
    await waitFor(() => screen.getByText('新增筆記'))
    fireEvent.click(screen.getByText('新增筆記'))
    fireEvent.change(screen.getByPlaceholderText('寫點什麼…'), { target: { value: '要刪除的筆記' } })
    fireEvent.click(screen.getByText('儲存'))
    await waitFor(() => expect(screen.queryByPlaceholderText('寫點什麼…')).not.toBeInTheDocument())

    fireEvent.click(screen.getByText('刪除筆記'))
    await waitFor(() => expect(screen.getByText(/此操作無法復原/)).toBeInTheDocument())
    expect(await getNote('vocab', 'v1')).not.toBeNull()

    fireEvent.click(screen.getByText('確定刪除'))

    await waitFor(async () => expect(await getNote('vocab', 'v1')).toBeNull())
    await waitFor(() => expect(screen.getByText('新增筆記')).toBeInTheDocument())
  })
})

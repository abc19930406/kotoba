import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { db } from '../../db/schema.ts'
import { resetBackStackForTests } from '../../shared/backStack.ts'
import { createStandaloneNote } from '../../db/standaloneNotes.ts'
import { NotebookListPage } from './NotebookListPage.tsx'

beforeEach(async () => {
  await db.standaloneNotes.clear()
  await db.noteImages.clear()
  resetBackStackForTests()
})

describe('NotebookListPage', () => {
  it('shows an empty state when there are no notes', async () => {
    render(<NotebookListPage onBack={() => {}} />)
    await waitFor(() => expect(screen.getByText('沒有符合條件的筆記。')).toBeInTheDocument())
  })

  it('lists existing notes and filters them by search', async () => {
    await createStandaloneNote('購物清單', '牛奶、雞蛋')
    await createStandaloneNote('旅行計畫', '東京、京都')

    render(<NotebookListPage onBack={() => {}} />)
    await screen.findByText('購物清單')
    expect(screen.getByText('旅行計畫')).toBeInTheDocument()

    fireEvent.change(screen.getByRole('searchbox', { name: '搜尋筆記' }), { target: { value: '東京' } })

    await waitFor(() => expect(screen.queryByText('購物清單')).not.toBeInTheDocument())
    expect(screen.getByText('旅行計畫')).toBeInTheDocument()
  })

  it('opens the editor when 新增筆記 is clicked', async () => {
    render(<NotebookListPage onBack={() => {}} />)
    await waitFor(() => screen.getByText('新增筆記'))

    fireEvent.click(screen.getByText('新增筆記'))

    expect(await screen.findByText('← 返回筆記本')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('標題')).toBeInTheDocument()
  })
})

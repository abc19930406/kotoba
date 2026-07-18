import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Rating } from 'ts-fsrs'
import { db } from '../../db/schema.ts'
import { gradeItem, setDailyNewCardLimit } from '../../db/cards.ts'
import { exportBackup } from '../../db/backup.ts'
import { BackupSection } from './BackupSection.tsx'

beforeEach(async () => {
  await db.cards.clear()
  await db.reviewLogs.clear()
  await db.settings.clear()
  await db.queuedItems.clear()
})

describe('BackupSection import flow', () => {
  it('shows a confirm screen with correct counts, then replaces (not merges) all data on confirm', async () => {
    await gradeItem('vocab', 'v1', 'N5', Rating.Good, new Date('2026-01-01T00:00:00Z'))
    await setDailyNewCardLimit(10)
    const backup = await exportBackup()
    const file = new File([JSON.stringify(backup)], 'backup.json', { type: 'application/json' })

    // Different current state than the backup — import should replace it, not merge.
    await db.cards.clear()
    await db.settings.clear()
    await gradeItem('vocab', 'other', 'N4', Rating.Good, new Date('2026-01-02T00:00:00Z'))

    // jsdom's Location#reload is non-configurable, so vi.spyOn can't patch
    // it directly — replace the whole `window.location` reference instead
    // (the property on `window` itself is configurable).
    const reloadMock = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload: reloadMock },
    })

    render(<BackupSection />)

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(() => expect(screen.getByText(/現有進度將被清除且無法復原/)).toBeInTheDocument())
    expect(screen.getByText('1 張卡片')).toBeInTheDocument()

    fireEvent.click(screen.getByText('確認取代'))

    await waitFor(() => expect(reloadMock).toHaveBeenCalled())

    const cards = await db.cards.toArray()
    expect(cards).toHaveLength(1)
    expect(cards[0].itemId).toBe('v1')
  })

  it('shows an error and leaves existing data untouched when the file is not a valid backup', async () => {
    await gradeItem('vocab', 'keep-me', 'N5', Rating.Good, new Date('2026-01-01T00:00:00Z'))
    const badFile = new File([JSON.stringify({ not: 'a backup' })], 'bad.json', { type: 'application/json' })

    render(<BackupSection />)
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(fileInput, { target: { files: [badFile] } })

    await waitFor(() => expect(screen.getByText(/匯入失敗/)).toBeInTheDocument())

    const cards = await db.cards.toArray()
    expect(cards).toHaveLength(1)
    expect(cards[0].itemId).toBe('keep-me')
  })
})

import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NoteImageThumb } from './NoteImageThumb.tsx'

const blob = new Blob(['a'], { type: 'image/png' })

describe('NoteImageThumb', () => {
  it('renders a plain (non-clickable) image when onOpen is not provided', async () => {
    render(<NoteImageThumb blob={blob} />)
    await waitFor(() => screen.getByAltText('筆記圖片'))
    expect(screen.queryByLabelText('放大檢視圖片')).not.toBeInTheDocument()
  })

  it('wraps the image in a button and calls onOpen when clicked', async () => {
    const onOpen = vi.fn()
    render(<NoteImageThumb blob={blob} onOpen={onOpen} />)
    await waitFor(() => screen.getByLabelText('放大檢視圖片'))

    fireEvent.click(screen.getByLabelText('放大檢視圖片'))

    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('does not confuse onOpen with onRemove — both can be present as separate controls', async () => {
    const onOpen = vi.fn()
    const onRemove = vi.fn()
    render(<NoteImageThumb blob={blob} onOpen={onOpen} onRemove={onRemove} />)
    await waitFor(() => screen.getByLabelText('刪除這張圖片'))

    fireEvent.click(screen.getByLabelText('刪除這張圖片'))

    expect(onRemove).toHaveBeenCalledTimes(1)
    expect(onOpen).not.toHaveBeenCalled()
  })
})

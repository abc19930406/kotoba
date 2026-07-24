import { useState } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { pushLayer, resetBackStackForTests } from '../../shared/backStack.ts'
import { ImageLightbox } from './ImageLightbox.tsx'

function makeBlob(label: string): Blob {
  return new Blob([label], { type: 'image/png' })
}

/** Mirrors the real open/close wiring every call site uses (pushLayer on open, goBack-driven close). */
function LightboxHarness({ images }: { images: Blob[] }) {
  const [index, setIndex] = useState<number | null>(null)

  function open(i: number) {
    pushLayer(() => setIndex(null))
    setIndex(i)
  }

  return (
    <div>
      <button type="button" onClick={() => open(0)}>
        open first
      </button>
      {index !== null && <ImageLightbox images={images} initialIndex={index} />}
    </div>
  )
}

beforeEach(() => {
  resetBackStackForTests()
})

describe('ImageLightbox', () => {
  it('closes via the close button', async () => {
    render(<LightboxHarness images={[makeBlob('a')]} />)
    fireEvent.click(screen.getByText('open first'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('關閉'))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('closes via clicking the overlay background (not the image itself)', async () => {
    render(<LightboxHarness images={[makeBlob('a')]} />)
    fireEvent.click(screen.getByText('open first'))

    fireEvent.click(screen.getByRole('dialog'))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('does not close when clicking the image itself', () => {
    render(<LightboxHarness images={[makeBlob('a')]} />)
    fireEvent.click(screen.getByText('open first'))

    fireEvent.click(screen.getByAltText('筆記圖片放大檢視'))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('hides the image counter and arrows for a single image', () => {
    render(<LightboxHarness images={[makeBlob('a')]} />)
    fireEvent.click(screen.getByText('open first'))

    expect(screen.queryByText(/第 \d+ \/ 共 \d+ 張/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText('上一張')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('下一張')).not.toBeInTheDocument()
  })

  it('shows the counter and switches between images via the arrow buttons', () => {
    render(<LightboxHarness images={[makeBlob('a'), makeBlob('b'), makeBlob('c')]} />)
    fireEvent.click(screen.getByText('open first'))

    expect(screen.getByText('第 1 / 共 3 張')).toBeInTheDocument()
    expect(screen.queryByLabelText('上一張')).not.toBeInTheDocument()
    expect(screen.getByLabelText('下一張')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('下一張'))
    expect(screen.getByText('第 2 / 共 3 張')).toBeInTheDocument()
    expect(screen.getByLabelText('上一張')).toBeInTheDocument()
    expect(screen.getByLabelText('下一張')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('下一張'))
    expect(screen.getByText('第 3 / 共 3 張')).toBeInTheDocument()
    expect(screen.queryByLabelText('下一張')).not.toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('上一張'))
    expect(screen.getByText('第 2 / 共 3 張')).toBeInTheDocument()
  })
})

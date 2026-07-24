import { useEffect, useRef, useState, type TouchEvent as ReactTouchEvent } from 'react'
import { goBack } from '../../shared/backStack.ts'

interface ImageLightboxProps {
  images: Blob[]
  initialIndex: number
}

const MIN_SCALE = 1
const MAX_SCALE = 4
const SWIPE_THRESHOLD_PX = 50

interface TouchState {
  mode: 'pinch' | 'pan-or-swipe'
  startDistance: number
  startScale: number
  startX: number
  startY: number
  startTranslateX: number
  startTranslateY: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function touchDistance(a: React.Touch, b: React.Touch): number {
  const dx = a.clientX - b.clientX
  const dy = a.clientY - b.clientY
  return Math.sqrt(dx * dx + dy * dy)
}

/**
 * Manual pinch/pan/swipe via touch events + CSS transform — not native
 * touch-action/viewport zoom. This PWA's manifest is display: 'standalone',
 * and iOS Safari disables the native two-finger page-zoom gesture entirely
 * in standalone mode regardless of viewport meta settings; relying on it
 * would silently not work once installed to the home screen.
 */
export function ImageLightbox({ images, initialIndex }: ImageLightboxProps) {
  const [index, setIndex] = useState(initialIndex)
  const [scale, setScale] = useState(1)
  const [translate, setTranslate] = useState({ x: 0, y: 0 })
  const [urls, setUrls] = useState<string[]>([])
  const touchState = useRef<TouchState | null>(null)

  useEffect(() => {
    const created = images.map((blob) => URL.createObjectURL(blob))
    setUrls(created)
    return () => {
      created.forEach((url) => URL.revokeObjectURL(url))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Locks background scroll while open — overflow:hidden alone is known to
  // still let iOS Safari scroll content behind a `position: fixed` overlay
  // via touch, so this uses the more reliable fixed-body + restore technique.
  useEffect(() => {
    const scrollY = window.scrollY
    const body = document.body
    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.left = '0'
    body.style.right = '0'
    return () => {
      body.style.position = ''
      body.style.top = ''
      body.style.left = ''
      body.style.right = ''
      window.scrollTo(0, scrollY)
    }
  }, [])

  function goToIndex(next: number) {
    setIndex(next)
    setScale(1)
    setTranslate({ x: 0, y: 0 })
  }

  function handlePrev() {
    if (index > 0) goToIndex(index - 1)
  }

  function handleNext() {
    if (index < images.length - 1) goToIndex(index + 1)
  }

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) goBack()
  }

  function handleTouchStart(e: ReactTouchEvent) {
    if (e.touches.length === 2) {
      touchState.current = {
        mode: 'pinch',
        startDistance: touchDistance(e.touches[0], e.touches[1]),
        startScale: scale,
        startX: 0,
        startY: 0,
        startTranslateX: translate.x,
        startTranslateY: translate.y,
      }
    } else if (e.touches.length === 1) {
      touchState.current = {
        mode: 'pan-or-swipe',
        startDistance: 0,
        startScale: scale,
        startX: e.touches[0].clientX,
        startY: e.touches[0].clientY,
        startTranslateX: translate.x,
        startTranslateY: translate.y,
      }
    }
  }

  function handleTouchMove(e: ReactTouchEvent) {
    const state = touchState.current
    if (!state) return
    if (state.mode === 'pinch' && e.touches.length === 2) {
      const currentDistance = touchDistance(e.touches[0], e.touches[1])
      const nextScale = clamp((currentDistance / state.startDistance) * state.startScale, MIN_SCALE, MAX_SCALE)
      setScale(nextScale)
    } else if (state.mode === 'pan-or-swipe' && e.touches.length === 1 && state.startScale > 1) {
      const dx = e.touches[0].clientX - state.startX
      const dy = e.touches[0].clientY - state.startY
      setTranslate({ x: state.startTranslateX + dx, y: state.startTranslateY + dy })
    }
  }

  function handleTouchEnd(e: ReactTouchEvent) {
    const state = touchState.current
    if (state?.mode === 'pan-or-swipe' && state.startScale === 1) {
      const touch = e.changedTouches[0]
      if (touch) {
        const dx = touch.clientX - state.startX
        if (Math.abs(dx) > SWIPE_THRESHOLD_PX) {
          if (dx < 0) handleNext()
          else handlePrev()
        }
      }
    }
    touchState.current = null
  }

  return (
    <div className="image-lightbox-overlay" role="dialog" aria-modal="true" onClick={handleOverlayClick}>
      <button type="button" className="image-lightbox-close" onClick={() => goBack()} aria-label="關閉">
        ×
      </button>
      {images.length > 1 && index > 0 && (
        <button
          type="button"
          className="image-lightbox-arrow image-lightbox-arrow-left"
          onClick={handlePrev}
          aria-label="上一張"
        >
          ‹
        </button>
      )}
      {images.length > 1 && index < images.length - 1 && (
        <button
          type="button"
          className="image-lightbox-arrow image-lightbox-arrow-right"
          onClick={handleNext}
          aria-label="下一張"
        >
          ›
        </button>
      )}
      <div
        className="image-lightbox-image-wrap"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {urls[index] && (
          <img
            src={urls[index]}
            alt="筆記圖片放大檢視"
            style={{ transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})` }}
          />
        )}
      </div>
      {images.length > 1 && (
        <p className="image-lightbox-counter">
          第 {index + 1} / 共 {images.length} 張
        </p>
      )}
    </div>
  )
}

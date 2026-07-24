import { useEffect, useState } from 'react'

interface NoteImageThumbProps {
  blob: Blob
  onRemove?: () => void
  /** Opt-in — when provided, the thumbnail becomes a button that opens the full-screen lightbox. Omit for contexts where the thumbnail is itself part of a larger click target (e.g. NotebookListPage's card, which opens the editor). */
  onOpen?: () => void
}

export function NoteImageThumb({ blob, onRemove, onOpen }: NoteImageThumbProps) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    const objectUrl = URL.createObjectURL(blob)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [blob])

  if (!url) return null

  return (
    <div className="note-image-thumb">
      {onOpen ? (
        <button type="button" className="note-image-open" onClick={onOpen} aria-label="放大檢視圖片">
          <img src={url} alt="筆記圖片" />
        </button>
      ) : (
        <img src={url} alt="筆記圖片" />
      )}
      {onRemove && (
        <button type="button" className="note-image-remove" onClick={onRemove} aria-label="刪除這張圖片">
          ×
        </button>
      )}
    </div>
  )
}

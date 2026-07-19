import { useEffect, useState } from 'react'

interface NoteImageThumbProps {
  blob: Blob
  onRemove?: () => void
}

export function NoteImageThumb({ blob, onRemove }: NoteImageThumbProps) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    const objectUrl = URL.createObjectURL(blob)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [blob])

  if (!url) return null

  return (
    <div className="note-image-thumb">
      <img src={url} alt="筆記圖片" />
      {onRemove && (
        <button type="button" className="note-image-remove" onClick={onRemove} aria-label="刪除這張圖片">
          ×
        </button>
      )}
    </div>
  )
}

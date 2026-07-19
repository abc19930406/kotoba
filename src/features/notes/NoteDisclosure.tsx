import { useEffect, useState } from 'react'
import type { ItemType } from '../../db/schema.ts'
import { getNote, type NoteWithImages } from '../../db/notes.ts'
import { NoteImageThumb } from './NoteImageThumb.tsx'

interface NoteDisclosureProps {
  itemType: ItemType
  itemId: string
}

/** Read-only, collapsed-by-default note viewer for the review card back — renders nothing if the item has no note. */
export function NoteDisclosure({ itemType, itemId }: NoteDisclosureProps) {
  const [note, setNote] = useState<NoteWithImages | null>(null)

  useEffect(() => {
    let cancelled = false
    getNote(itemType, itemId).then((result) => {
      if (!cancelled) setNote(result)
    })
    return () => {
      cancelled = true
    }
  }, [itemType, itemId])

  if (!note) return null

  return (
    // stopPropagation: never let a tap inside this bubble up into the
    // review card's own onFlip (see the same reasoning on SpeakButton).
    <details className="note-disclosure" onClick={(e) => e.stopPropagation()}>
      <summary>筆記</summary>
      {note.text && <p className="note-text">{note.text}</p>}
      {note.images.length > 0 && (
        <div className="note-images">
          {note.images.map((img) => (
            <NoteImageThumb key={img.id} blob={img.blob} />
          ))}
        </div>
      )}
    </details>
  )
}

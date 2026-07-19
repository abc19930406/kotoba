import { db, type ItemType, type NoteImageRecord } from './schema.ts'
import { addNoteImageByKey, listNoteImages, removeNoteImage as removeNoteImageShared, deleteNoteImagesByKey, requestPersistentStorage, type AddImageResult } from './noteImages.ts'

function noteKeyOf(itemType: ItemType, itemId: string): string {
  return `${itemType}:${itemId}`
}

export interface NoteWithImages {
  text: string
  updatedAt: Date
  images: NoteImageRecord[]
}

export async function getNote(itemType: ItemType, itemId: string): Promise<NoteWithImages | null> {
  const note = await db.notes.get([itemType, itemId])
  if (!note) return null
  const images = await listNoteImages(noteKeyOf(itemType, itemId))
  return { text: note.text, updatedAt: note.updatedAt, images }
}

export async function saveNoteText(itemType: ItemType, itemId: string, text: string): Promise<void> {
  const existing = await db.notes.get([itemType, itemId])
  await db.notes.put({ itemType, itemId, text, updatedAt: new Date() })
  if (!existing) await requestPersistentStorage()
}

export type { AddImageResult }

export async function addNoteImage(itemType: ItemType, itemId: string, blob: Blob): Promise<AddImageResult> {
  const existingNote = await db.notes.get([itemType, itemId])
  const result = await db.transaction('rw', db.notes, db.noteImages, async () => {
    if (!existingNote) {
      await db.notes.put({ itemType, itemId, text: '', updatedAt: new Date() })
    }
    return addNoteImageByKey(noteKeyOf(itemType, itemId), blob)
  })
  if (result.ok && !existingNote) await requestPersistentStorage()
  return result
}

export const removeNoteImage = removeNoteImageShared

export async function deleteNote(itemType: ItemType, itemId: string): Promise<void> {
  const noteKey = noteKeyOf(itemType, itemId)
  await db.transaction('rw', db.notes, db.noteImages, async () => {
    await db.notes.delete([itemType, itemId])
    await deleteNoteImagesByKey(noteKey)
  })
}

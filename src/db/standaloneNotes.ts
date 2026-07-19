import { db, type NoteImageRecord } from './schema.ts'
import {
  addNoteImageByKey,
  listNoteImages,
  removeNoteImage,
  deleteNoteImagesByKey,
  requestPersistentStorage,
  type AddImageResult,
} from './noteImages.ts'

function noteKeyOf(id: number): string {
  return `standalone:${id}`
}

export interface StandaloneNoteSummary {
  id: number
  title: string
  text: string
  updatedAt: Date
  firstImage: NoteImageRecord | null
}

/** All standalone notes, most recently updated first — each with its first image (if any) for the list thumbnail. */
export async function listStandaloneNotes(): Promise<StandaloneNoteSummary[]> {
  const notes = await db.standaloneNotes.orderBy('updatedAt').reverse().toArray()
  return Promise.all(
    notes.map(async (note) => {
      const images = await listNoteImages(noteKeyOf(note.id!))
      return { id: note.id!, title: note.title, text: note.text, updatedAt: note.updatedAt, firstImage: images[0] ?? null }
    }),
  )
}

export interface StandaloneNoteWithImages {
  id: number
  title: string
  text: string
  updatedAt: Date
  images: NoteImageRecord[]
}

export async function getStandaloneNote(id: number): Promise<StandaloneNoteWithImages | null> {
  const note = await db.standaloneNotes.get(id)
  if (!note) return null
  const images = await listNoteImages(noteKeyOf(id))
  return { id: note.id!, title: note.title, text: note.text, updatedAt: note.updatedAt, images }
}

/** Creates a new standalone note and returns its id. Title requirement is validated by the UI, not here — there's only one call path. */
export async function createStandaloneNote(title: string, text: string): Promise<number> {
  const id = await db.standaloneNotes.add({ title, text, updatedAt: new Date() })
  await requestPersistentStorage()
  return id
}

export async function updateStandaloneNote(id: number, title: string, text: string): Promise<void> {
  await db.standaloneNotes.update(id, { title, text, updatedAt: new Date() })
}

export async function addStandaloneNoteImage(id: number, blob: Blob): Promise<AddImageResult> {
  return addNoteImageByKey(noteKeyOf(id), blob)
}

export const removeStandaloneNoteImage = removeNoteImage

export async function deleteStandaloneNote(id: number): Promise<void> {
  await db.transaction('rw', db.standaloneNotes, db.noteImages, async () => {
    await db.standaloneNotes.delete(id)
    await deleteNoteImagesByKey(noteKeyOf(id))
  })
}

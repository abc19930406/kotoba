import type { StandaloneNoteSummary } from '../../db/standaloneNotes.ts'

export function filterStandaloneNotes(notes: StandaloneNoteSummary[], search: string): StandaloneNoteSummary[] {
  const query = search.trim().toLowerCase()
  if (query.length === 0) return notes
  return notes.filter((note) => note.title.toLowerCase().includes(query) || note.text.toLowerCase().includes(query))
}

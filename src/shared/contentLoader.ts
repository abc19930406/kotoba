import type { JlptLevel, VocabEntry, GrammarEntry } from './contentTypes.ts'

const vocabCache = new Map<JlptLevel, Promise<VocabEntry[]>>()
const grammarCache = new Map<JlptLevel, Promise<GrammarEntry[]>>()

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/${path}`)
  if (!res.ok) {
    throw new Error(`Failed to load ${path}: ${res.status} ${res.statusText}`)
  }
  return res.json() as Promise<T>
}

/** Lazily fetches and caches a single level's vocab chunk. */
export function loadVocabLevel(level: JlptLevel): Promise<VocabEntry[]> {
  let promise = vocabCache.get(level)
  if (!promise) {
    promise = fetchJson<VocabEntry[]>(`vocab-${level.toLowerCase()}.json`)
    vocabCache.set(level, promise)
  }
  return promise
}

/** Lazily fetches and caches a single level's grammar chunk. */
export function loadGrammarLevel(level: JlptLevel): Promise<GrammarEntry[]> {
  let promise = grammarCache.get(level)
  if (!promise) {
    promise = fetchJson<GrammarEntry[]>(`grammar-${level.toLowerCase()}.json`)
    grammarCache.set(level, promise)
  }
  return promise
}

export async function findVocabEntry(level: JlptLevel, id: string): Promise<VocabEntry | undefined> {
  const entries = await loadVocabLevel(level)
  return entries.find((e) => e.id === id)
}

export async function findGrammarEntry(level: JlptLevel, id: string): Promise<GrammarEntry | undefined> {
  const entries = await loadGrammarLevel(level)
  return entries.find((e) => e.id === id)
}

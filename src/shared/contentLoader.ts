import type { JlptLevel, VocabEntry, GrammarEntry } from './contentTypes.ts'

const vocabCache = new Map<JlptLevel, Promise<VocabEntry[]>>()
const grammarCache = new Map<JlptLevel, Promise<GrammarEntry[]>>()
let contentIndexCache: Promise<ContentIndex> | undefined

/** The fields of public/data/index.json actually used by the frontend (per-level item totals for the stats page). */
export interface ContentIndex {
  vocab: { level: JlptLevel; count: number }[]
  grammar: { level: JlptLevel; count: number }[]
}

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

/** Lazily fetches and caches public/data/index.json (per-level item totals, ~1.8KB) — used for the stats page's 未開始 count without loading full vocab/grammar chunks. */
export function loadContentIndex(): Promise<ContentIndex> {
  if (!contentIndexCache) {
    contentIndexCache = fetchJson<ContentIndex>('index.json')
  }
  return contentIndexCache
}

export async function findVocabEntry(level: JlptLevel, id: string): Promise<VocabEntry | undefined> {
  const entries = await loadVocabLevel(level)
  return entries.find((e) => e.id === id)
}

export async function findGrammarEntry(level: JlptLevel, id: string): Promise<GrammarEntry | undefined> {
  const entries = await loadGrammarLevel(level)
  return entries.find((e) => e.id === id)
}

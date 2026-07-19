import { db } from './schema.ts'
import { listAddedItemIds, listDueCards, scheduler, toFsrsCard } from './cards.ts'
import { loadVocabLevel, loadGrammarLevel, findVocabEntry } from '../shared/contentLoader.ts'
import { toDateKey } from './stats.ts'
import type { JlptLevel, VocabEntry, GrammarEntry } from '../shared/contentTypes.ts'

const NEW_VOCAB_COUNT = 5
const NEW_GRAMMAR_COUNT = 2
const REVIEW_VOCAB_COUNT = 3
const KNOWN_WORDS_SAMPLE_SIZE = 80

export interface DailyPackage {
  date: string
  level: JlptLevel
  newVocab: VocabEntry[]
  newGrammar: GrammarEntry[]
  reviewVocab: VocabEntry[]
}

function hashSeed(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(h, 31) + seed.charCodeAt(i)) | 0
  }
  return h >>> 0
}

/** mulberry32 — a small, fast, deterministic PRNG seeded from a string hash. */
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Deterministic Fisher-Yates shuffle, stable for a given seed string. */
export function seededShuffle<T>(items: T[], seed: string): T[] {
  const rand = mulberry32(hashSeed(seed))
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

async function pickNewVocab(level: JlptLevel, date: string, count: number): Promise<VocabEntry[]> {
  const [entries, addedIds] = await Promise.all([loadVocabLevel(level), listAddedItemIds('vocab')])
  const notStarted = entries.filter((e) => !addedIds.has(e.id))
  return seededShuffle(notStarted, `${date}:${level}:newVocab`).slice(0, count)
}

async function pickNewGrammar(level: JlptLevel, date: string, count: number): Promise<GrammarEntry[]> {
  const [entries, addedIds] = await Promise.all([loadGrammarLevel(level), listAddedItemIds('grammar')])
  const notStarted = entries.filter((e) => !addedIds.has(e.id))
  return seededShuffle(notStarted, `${date}:${level}:newGrammar`).slice(0, count)
}

/** The `count` due vocab cards (any level) with the lowest FSRS retrievability — i.e. most at risk of being forgotten. */
async function pickReviewVocab(now: Date, count: number): Promise<VocabEntry[]> {
  const dueCards = (await listDueCards(now)).filter((c) => c.itemType === 'vocab')
  const withRetrievability = dueCards.map((card) => ({
    card,
    retrievability: scheduler.get_retrievability(toFsrsCard(card), now, false) as number,
  }))
  withRetrievability.sort((a, b) => a.retrievability - b.retrievability)
  const picked = withRetrievability.slice(0, count)
  const resolved = await Promise.all(picked.map((p) => findVocabEntry(p.card.level, p.card.itemId)))
  return resolved.filter((e): e is VocabEntry => e !== undefined)
}

export async function buildDailyPackage(level: JlptLevel, now: Date = new Date()): Promise<DailyPackage> {
  const date = toDateKey(now)
  const [newVocab, newGrammar, reviewVocab] = await Promise.all([
    pickNewVocab(level, date, NEW_VOCAB_COUNT),
    pickNewGrammar(level, date, NEW_GRAMMAR_COUNT),
    pickReviewVocab(now, REVIEW_VOCAB_COUNT),
  ])
  return { date, level, newVocab, newGrammar, reviewVocab }
}

/** A random (not date-seeded) sample of the user's known vocab (學習中+已熟悉, i.e. all vocab cards), for AI prompt context. */
export async function buildKnownWordsSample(
  maxCount: number = KNOWN_WORDS_SAMPLE_SIZE,
): Promise<{ kanji: string; kana: string }[]> {
  const cards = await db.cards.where('itemType').equals('vocab').toArray()
  const levelsNeeded = [...new Set(cards.map((c) => c.level))]
  const levelData = await Promise.all(levelsNeeded.map((lvl) => loadVocabLevel(lvl)))
  const byId = new Map<string, VocabEntry>()
  for (const entries of levelData) {
    for (const entry of entries) byId.set(entry.id, entry)
  }
  const resolved = cards.map((c) => byId.get(c.itemId)).filter((e): e is VocabEntry => e !== undefined)
  const shuffled = [...resolved].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, maxCount).map((e) => ({ kanji: e.kanji, kana: e.kana }))
}

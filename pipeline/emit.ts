import { mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { ZodError } from 'zod'
import type { LinkedData } from './link.ts'
import { loadTranslationCache } from './translate.ts'
import { loadGrammarTranslationCache } from './translateGrammar.ts'
import {
  LEVEL_ORDER,
  vocabFileSchema,
  grammarFileSchema,
  indexFileSchema,
  SOURCE_ATTRIBUTION,
  type IndexFile,
  type VocabEntry,
  type GrammarEntry,
} from './schemas.ts'

export const DATA_DIR = path.resolve(import.meta.dirname, '..', 'public', 'data')

function describeZodError(context: string, error: ZodError): string {
  const issues = error.issues
    .slice(0, 10)
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n')
  return `Schema validation failed for ${context}:\n${issues}`
}

/** Grammar ids must be unique across all five level files combined. */
function checkGrammarIdsUnique(entries: GrammarEntry[]): void {
  const firstSeenAt = new Map<string, number>()
  entries.forEach((g, i) => {
    const prev = firstSeenAt.get(g.id)
    if (prev !== undefined) {
      throw new Error(
        `Grammar id collision: "${g.id}" appears at entries #${prev} and #${i}. Grammar ids must be globally unique.`,
      )
    }
    firstSeenAt.set(g.id, i)
  })
}

// Vocab ids can legitimately repeat across level files — the Anki source
// assigns one GUID per note, and a word tagged with two JLPT levels keeps
// the same GUID in both decks (see KNOWN_ISSUES.md #4). `level` and
// `sentences` are expected to differ per occurrence (that's the whole point
// of the word appearing in two level files); everything else describing the
// word itself must match, or the "same id" assumption is wrong and Phase 2
// would silently merge two different words' SRS progress.
const VOCAB_IDENTITY_FIELDS = ['kanji', 'kana', 'usageNote', 'partOfSpeech', 'meaningEn', 'meaningZh'] as const

function checkVocabDuplicateIdsConsistent(entries: VocabEntry[]): void {
  const firstSeen = new Map<string, VocabEntry>()
  for (const v of entries) {
    const prev = firstSeen.get(v.id)
    if (!prev) {
      firstSeen.set(v.id, v)
      continue
    }
    for (const field of VOCAB_IDENTITY_FIELDS) {
      const a = JSON.stringify(prev[field])
      const b = JSON.stringify(v[field])
      if (a !== b) {
        throw new Error(
          `Vocab id "${v.id}" is duplicated across level files but field "${field}" differs (${a} vs ${b}). ` +
            `A shared id is only valid when it's genuinely the same word (see KNOWN_ISSUES.md #4).`,
        )
      }
    }
  }
}

export interface SourceVersions {
  tatoebaRelease: string
  jmdictVersion: string
}

export async function emit(data: LinkedData, sourceVersions: SourceVersions): Promise<IndexFile> {
  await mkdir(DATA_DIR, { recursive: true })

  const translationCache = await loadTranslationCache()
  const grammarTranslationCache = await loadGrammarTranslationCache()
  const vocabIndexEntries: IndexFile['vocab'] = []
  const grammarIndexEntries: IndexFile['grammar'] = []
  const allVocabEntries: VocabEntry[] = []
  const allGrammarEntries: GrammarEntry[] = []
  // Hashes the exact bytes written for every vocab/grammar file, in stable
  // (LEVEL_ORDER) order, so it's deterministic across reruns with unchanged
  // data — used as a Workbox runtime-cache version key on the frontend so
  // the browser cache invalidates only when the actual content changes.
  const dataVersionHash = createHash('sha256')

  for (const level of LEVEL_ORDER) {
    const file = `vocab-${level.toLowerCase()}.json`
    const withZhOverlay = data.vocab[level].map((v) => ({
      ...v,
      meaningZh: translationCache[v.id] ?? v.meaningZh,
    }))
    let validated
    try {
      validated = vocabFileSchema.parse(withZhOverlay)
    } catch (err) {
      if (err instanceof ZodError) throw new Error(describeZodError(file, err))
      throw err
    }
    const serialized = `${JSON.stringify(validated, null, 2)}\n`
    await writeFile(path.join(DATA_DIR, file), serialized, 'utf-8')
    dataVersionHash.update(serialized)
    allVocabEntries.push(...validated)
    const withSentences = validated.filter((v) => v.sentences.length > 0).length
    const withZhCount = validated.filter((v) => v.meaningZh !== null).length
    vocabIndexEntries.push({ file, level, count: validated.length, withSentences })
    console.log(
      `emit: ${file} (${validated.length} entries, ${withSentences} with sentences = ${((100 * withSentences) / validated.length).toFixed(1)}%, ${withZhCount} with zh = ${((100 * withZhCount) / validated.length).toFixed(1)}%)`,
    )
  }
  checkVocabDuplicateIdsConsistent(allVocabEntries)

  for (const level of LEVEL_ORDER) {
    const file = `grammar-${level.toLowerCase()}.json`
    const withZhOverlay = data.grammar[level].map((g) => {
      const translation = grammarTranslationCache[g.id]
      return {
        ...g,
        zhShort: translation?.zhShort ?? g.zhShort,
        zhLong: translation?.zhLong ?? g.zhLong,
      }
    })
    let validated
    try {
      validated = grammarFileSchema.parse(withZhOverlay)
    } catch (err) {
      if (err instanceof ZodError) throw new Error(describeZodError(file, err))
      throw err
    }
    const serialized = `${JSON.stringify(validated, null, 2)}\n`
    await writeFile(path.join(DATA_DIR, file), serialized, 'utf-8')
    dataVersionHash.update(serialized)
    allGrammarEntries.push(...validated)
    const withZhCount = validated.filter((g) => g.zhShort !== null && g.zhLong !== null).length
    grammarIndexEntries.push({ file, level, count: validated.length })
    console.log(
      `emit: ${file} (${validated.length} entries, ${withZhCount} with zh = ${((100 * withZhCount) / validated.length).toFixed(1)}%)`,
    )
  }
  checkGrammarIdsUnique(allGrammarEntries)

  const index: IndexFile = {
    vocab: vocabIndexEntries,
    grammar: grammarIndexEntries,
    sources: SOURCE_ATTRIBUTION,
    sourceVersions,
    dataVersion: dataVersionHash.digest('hex').slice(0, 16),
  }
  const validatedIndex = indexFileSchema.parse(index)
  await writeFile(
    path.join(DATA_DIR, 'index.json'),
    `${JSON.stringify(validatedIndex, null, 2)}\n`,
    'utf-8',
  )
  console.log('emit: index.json')
  return validatedIndex
}

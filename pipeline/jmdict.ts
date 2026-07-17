import { createReadStream } from 'node:fs'
import readline from 'node:readline'
import { RAW_PATHS } from './fetch.ts'

export interface JmdictInfo {
  partOfSpeech: string[]
}

interface JmdictWord {
  kanji: { text: string; common: boolean }[]
  kana: { text: string; common: boolean }[]
  sense: { partOfSpeech: string[] }[]
}

export interface VocabKey {
  expression: string
  reading: string
}

export function vocabKeyId(k: VocabKey): string {
  return `${k.expression} ${k.reading}`
}

export interface JmdictIndexes {
  /** vocabKeyId(expression, reading) -> POS backfill info, for known JLPT vocab only. */
  posByVocabKey: Map<string, JmdictInfo>
  /** Every kanji/kana surface text that jmdict marks as a "common" word/reading. */
  commonWords: Set<string>
  /** Every kanji/kana surface text that appears anywhere in jmdict (existence check). */
  allWords: Set<string>
}

/**
 * jmdict-eng.json is ~117MB with one word entry per line inside the
 * top-level "words" array, so we stream it line-by-line rather than
 * JSON.parse the whole file. A single pass builds three indexes: a
 * targeted POS backfill for known JLPT vocab, and two broader sets
 * (common / all surface forms) used by the grader's unknown-word fallback.
 */
export async function buildJmdictIndexes(vocabKeys: VocabKey[]): Promise<JmdictIndexes> {
  const wantedReadingsByExpression = new Map<string, Set<string>>()
  for (const k of vocabKeys) {
    let set = wantedReadingsByExpression.get(k.expression)
    if (!set) {
      set = new Set()
      wantedReadingsByExpression.set(k.expression, set)
    }
    set.add(k.reading)
  }

  const posByVocabKey = new Map<string, JmdictInfo>()
  const commonWords = new Set<string>()
  const allWords = new Set<string>()

  const rl = readline.createInterface({
    input: createReadStream(RAW_PATHS.jmdictJson, 'utf-8'),
    crlfDelay: Infinity,
  })

  let inWordsArray = false
  for await (const rawLine of rl) {
    const line = rawLine.trim()
    if (!inWordsArray) {
      if (line === '"words": [') inWordsArray = true
      continue
    }
    if (line.startsWith(']')) break

    // Every entry line ends with a trailing "," except the very last one,
    // which instead has the array's closing "]" appended directly (no comma,
    // no separating newline) — strip whichever trailer is present.
    let isLastEntry = false
    let jsonText = line
    if (jsonText.endsWith(',')) {
      jsonText = jsonText.slice(0, -1)
    } else if (jsonText.endsWith(']')) {
      jsonText = jsonText.slice(0, -1)
      isLastEntry = true
    }
    if (!jsonText) continue

    const entry = JSON.parse(jsonText) as JmdictWord

    for (const k of entry.kanji) {
      allWords.add(k.text)
      if (k.common) commonWords.add(k.text)
    }
    for (const k of entry.kana) {
      allWords.add(k.text)
      if (k.common) commonWords.add(k.text)
    }

    const kanjiTexts = entry.kanji.map((k) => k.text)
    const kanaTexts = entry.kana.map((k) => k.text)
    const candidateExpressions = kanjiTexts.length > 0 ? kanjiTexts : kanaTexts

    for (const expr of candidateExpressions) {
      const wantedReadings = wantedReadingsByExpression.get(expr)
      if (!wantedReadings) continue
      for (const reading of kanaTexts) {
        if (!wantedReadings.has(reading)) continue
        const id = vocabKeyId({ expression: expr, reading })
        if (posByVocabKey.has(id)) continue
        const partOfSpeech = Array.from(new Set(entry.sense.flatMap((s) => s.partOfSpeech)))
        posByVocabKey.set(id, { partOfSpeech })
      }
    }
    if (isLastEntry) break
  }

  return { posByVocabKey, commonWords, allWords }
}

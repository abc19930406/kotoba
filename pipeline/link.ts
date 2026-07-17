import { readFile } from 'node:fs/promises'
import { RAW_PATHS } from './fetch.ts'
import { loadVocabRows, buildLevelMap } from './parseVocab.ts'
import { createGrader, type GradeResult } from './grade.ts'
import { loadTatoebaSentences, buildHeadwordIndex, type TatoebaSentence, type SentenceCandidate } from './tatoeba.ts'
import { buildJmdictIndexes, vocabKeyId } from './jmdict.ts'
import {
  LEVEL_TO_NUMBER,
  LEVEL_ORDER,
  type JlptLevel,
  type VocabEntry,
  type GrammarEntry,
  type GradedSentence,
} from './schemas.ts'

const MAX_SENTENCES_PER_WORD = 8
const MAX_CANDIDATES_TO_GRADE = 40

interface HanabiraExample {
  jp: string
  romaji: string
  en: string
}
interface HanabiraGrammarRaw {
  title: string
  short_explanation: string
  long_explanation: string
  formation: string
  examples: HanabiraExample[]
}

export interface LinkedData {
  vocab: Record<JlptLevel, VocabEntry[]>
  grammar: Record<JlptLevel, GrammarEntry[]>
  gradedSentences: Map<string, GradeResult>
  /** Re-grade an arbitrary sentence with this run's grader (cache-backed). */
  grade: (text: string) => GradeResult
}

function selectSentencesForWord(
  candidates: SentenceCandidate[],
  sentenceById: Map<string, TatoebaSentence>,
  gradeCached: (text: string) => GradeResult,
  wordLevel: number,
  max: number,
): GradedSentence[] {
  if (candidates.length === 0) return []

  const checkedCandidates = candidates.filter((c) => c.checked)
  const pool = checkedCandidates.length > 0 ? checkedCandidates : candidates

  const seenIds = new Set<string>()
  const uniquePool = pool.filter((c) => {
    if (seenIds.has(c.id)) return false
    seenIds.add(c.id)
    return true
  })

  const graded: GradedSentence[] = []
  const seenText = new Set<string>()
  for (const c of uniquePool.slice(0, MAX_CANDIDATES_TO_GRADE)) {
    const sentence = sentenceById.get(c.id)
    if (!sentence || !sentence.text || !sentence.translation) continue
    if (seenText.has(sentence.text)) continue
    seenText.add(sentence.text)
    const result = gradeCached(sentence.text)
    graded.push({ jp: sentence.text, en: sentence.translation, difficulty: result.difficulty })
  }

  graded.sort((a, b) => {
    const da = Math.abs(a.difficulty - wordLevel)
    const db = Math.abs(b.difficulty - wordLevel)
    if (da !== db) return da - db
    return a.jp.localeCompare(b.jp)
  })

  return graded.slice(0, max)
}

export async function buildLinkedData(): Promise<LinkedData> {
  console.log('link: loading vocab CSVs...')
  const vocabRows = await loadVocabRows()
  const levelMap = buildLevelMap(vocabRows)

  console.log('link: building jmdict indexes...')
  const allVocabKeys = LEVEL_ORDER.flatMap((level) =>
    vocabRows[level].map((r) => ({ expression: r.expression, reading: r.reading })),
  )
  const jmdictIndexes = await buildJmdictIndexes(allVocabKeys)

  console.log('link: initializing kuromoji grader...')
  const grade = await createGrader(levelMap, jmdictIndexes.commonWords, jmdictIndexes.allWords)
  const gradeCache = new Map<string, GradeResult>()
  const gradeCached = (text: string): GradeResult => {
    let result = gradeCache.get(text)
    if (!result) {
      result = grade(text)
      gradeCache.set(text, result)
    }
    return result
  }

  console.log('link: loading tatoeba sentences...')
  const sentences = await loadTatoebaSentences()
  const sentenceById = new Map(sentences.map((s) => [s.id, s]))
  const headwordIndex = buildHeadwordIndex(sentences)

  console.log('link: attaching example sentences to vocab...')
  const vocab: Record<JlptLevel, VocabEntry[]> = { N5: [], N4: [], N3: [], N2: [], N1: [] }
  for (const level of LEVEL_ORDER) {
    const wordLevel = LEVEL_TO_NUMBER[level]
    for (const row of vocabRows[level]) {
      const candidates = headwordIndex.get(row.expression) ?? []
      const selected = selectSentencesForWord(candidates, sentenceById, gradeCached, wordLevel, MAX_SENTENCES_PER_WORD)
      const jmInfo = jmdictIndexes.posByVocabKey.get(
        vocabKeyId({ expression: row.expression, reading: row.reading }),
      )
      vocab[level].push({
        id: row.guid || `${level}-${row.expression}-${row.reading}`,
        level,
        kanji: row.expression,
        kana: row.reading,
        usageNote: row.usageNote,
        partOfSpeech: jmInfo?.partOfSpeech ?? [],
        meaningEn: row.meaning.split(/,\s*/).filter(Boolean),
        meaningZh: null,
        sentences: selected,
      })
    }
    vocab[level].sort((a, b) => a.kana.localeCompare(b.kana) || a.kanji.localeCompare(b.kanji))
  }

  console.log('link: grading grammar example sentences...')
  const grammar: Record<JlptLevel, GrammarEntry[]> = { N5: [], N4: [], N3: [], N2: [], N1: [] }
  for (const level of LEVEL_ORDER) {
    const file = level.toLowerCase() as 'n1' | 'n2' | 'n3' | 'n4' | 'n5'
    const raw = JSON.parse(await readFile(RAW_PATHS.grammarJson(file), 'utf-8')) as HanabiraGrammarRaw[]
    // Titles are usually unique within a level, but the source data has at
    // least one exception — disambiguate by source-file order so id stays
    // stable across reruns instead of silently colliding.
    const titleOccurrences = new Map<string, number>()
    for (const g of raw) {
      const occurrence = (titleOccurrences.get(g.title) ?? 0) + 1
      titleOccurrences.set(g.title, occurrence)
      const id = occurrence === 1 ? `${level}-${g.title}` : `${level}-${g.title}-${occurrence}`

      const gradedSentences: GradedSentence[] = g.examples.map((ex) => ({
        jp: ex.jp,
        en: ex.en,
        difficulty: gradeCached(ex.jp).difficulty,
      }))
      grammar[level].push({
        id,
        level,
        title: g.title,
        formation: g.formation,
        shortExplanation: g.short_explanation,
        longExplanation: g.long_explanation,
        zhShort: null,
        zhLong: null,
        sentences: gradedSentences,
      })
    }
    grammar[level].sort((a, b) => a.title.localeCompare(b.title))
  }

  return { vocab, grammar, gradedSentences: gradeCache, grade: gradeCached }
}

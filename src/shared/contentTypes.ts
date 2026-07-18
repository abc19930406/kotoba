export type JlptLevel = 'N5' | 'N4' | 'N3' | 'N2' | 'N1'

export const LEVEL_ORDER: JlptLevel[] = ['N5', 'N4', 'N3', 'N2', 'N1']

/** Matches pipeline/grade.ts's difficulty scale (N5=1 .. N1=5), so grammar example sentences can be sorted by closeness to the user's current level. */
export const LEVEL_TO_DIFFICULTY: Record<JlptLevel, number> = { N5: 1, N4: 2, N3: 3, N2: 4, N1: 5 }

/** A furigana segment: `[text]` plain, or `[text, reading]` kanji + hiragana reading. Produced by pipeline/furigana.ts. */
export type FuriganaSegment = [string] | [string, string]

export interface GradedSentence {
  jp: string
  en: string
  difficulty: number
  jpSegments: FuriganaSegment[]
}

export interface VocabEntry {
  id: string
  level: JlptLevel
  kanji: string
  kana: string
  usageNote: string | null
  partOfSpeech: string[]
  meaningEn: string[]
  meaningZh: string | null
  sentences: GradedSentence[]
}

export interface GrammarEntry {
  id: string
  level: JlptLevel
  title: string
  formation: string
  shortExplanation: string
  longExplanation: string
  zhShort: string | null
  zhLong: string | null
  sentences: GradedSentence[]
}

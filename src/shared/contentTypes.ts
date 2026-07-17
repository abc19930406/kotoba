export type JlptLevel = 'N5' | 'N4' | 'N3' | 'N2' | 'N1'

export const LEVEL_ORDER: JlptLevel[] = ['N5', 'N4', 'N3', 'N2', 'N1']

export interface GradedSentence {
  jp: string
  en: string
  difficulty: number
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

import type { FuriganaSegment, JlptLevel } from './contentTypes.ts'

export interface DailyMaterialWordRef {
  kanji: string
  kana: string
}

export interface DailyMaterialRequestBody {
  level: JlptLevel
  knownWords: DailyMaterialWordRef[]
  newWords: DailyMaterialWordRef[]
}

export interface GrammarNote {
  sentence: FuriganaSegment[]
  grammarPoint: string
  explanation: string
}

export interface DailyMaterialResponseBody {
  paragraphs: FuriganaSegment[][]
  zh: string
  comprehensionPoints: string[]
  /** Optional — older cached rows and some test fixtures may not have this field. */
  grammarNotes?: GrammarNote[]
}

export const DAILY_PASSCODE_HEADER = 'X-Daily-Passcode'

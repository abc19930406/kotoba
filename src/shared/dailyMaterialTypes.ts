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

export interface DailyMaterialResponseBody {
  paragraphs: FuriganaSegment[][]
  zh: string
  comprehensionPoints: string[]
}

export const DAILY_PASSCODE_HEADER = 'X-Daily-Passcode'

// Deliberately self-contained (not imported from ../src/shared/) — Vercel's
// Node function builder only bundles files inside api/, so a cross-directory
// import here fails at deploy time with ERR_MODULE_NOT_FOUND even though it
// type-checks locally. These shapes mirror src/shared/dailyMaterialTypes.ts
// and src/shared/contentTypes.ts's FuriganaSegment/JlptLevel — small and
// stable enough that duplication is an acceptable, deliberate trade-off.

export type FuriganaSegment = [string] | [string, string]
export type JlptLevel = 'N5' | 'N4' | 'N3' | 'N2' | 'N1'

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

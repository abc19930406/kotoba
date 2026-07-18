import { z } from 'zod'

export const jlptLevelSchema = z.enum(['N5', 'N4', 'N3', 'N2', 'N1'])
export type JlptLevel = z.infer<typeof jlptLevelSchema>

export const LEVEL_ORDER: JlptLevel[] = ['N5', 'N4', 'N3', 'N2', 'N1']
export const LEVEL_TO_NUMBER: Record<JlptLevel, number> = {
  N5: 1,
  N4: 2,
  N3: 3,
  N2: 4,
  N1: 5,
}

/**
 * A furigana segment: `[text]` for a plain (unannotated) span, or
 * `[text, reading]` for a kanji span with its hiragana reading. Produced by
 * pipeline/furigana.ts from kuroshiro (mode: furigana, to: hiragana).
 */
export const furiganaSegmentSchema = z.union([z.tuple([z.string()]), z.tuple([z.string(), z.string()])])
export type FuriganaSegment = z.infer<typeof furiganaSegmentSchema>

export const gradedSentenceSchema = z.object({
  jp: z.string().min(1),
  en: z.string().min(1),
  difficulty: z.number().int().min(1).max(6),
  /** Required so a forgotten furigana fill-in aborts the build instead of shipping an empty value. */
  jpSegments: z.array(furiganaSegmentSchema).min(1),
})
export type GradedSentence = z.infer<typeof gradedSentenceSchema>

export const vocabEntrySchema = z.object({
  id: z.string().min(1),
  level: jlptLevelSchema,
  kanji: z.string().min(1),
  kana: z.string().min(1),
  usageNote: z.string().nullable(),
  partOfSpeech: z.array(z.string()),
  meaningEn: z.array(z.string().min(1)).min(1),
  meaningZh: z.string().nullable(),
  sentences: z.array(gradedSentenceSchema).max(8),
})
export type VocabEntry = z.infer<typeof vocabEntrySchema>
export const vocabFileSchema = z.array(vocabEntrySchema)

export const grammarEntrySchema = z.object({
  id: z.string().min(1),
  level: jlptLevelSchema,
  title: z.string().min(1),
  formation: z.string().min(1),
  shortExplanation: z.string().min(1),
  longExplanation: z.string().min(1),
  zhShort: z.string().nullable(),
  zhLong: z.string().nullable(),
  sentences: z.array(gradedSentenceSchema),
})
export type GrammarEntry = z.infer<typeof grammarEntrySchema>
export const grammarFileSchema = z.array(grammarEntrySchema)

export const sourceAttributionSchema = z.object({
  name: z.string(),
  repo: z.string(),
  license: z.string(),
})
export type SourceAttribution = z.infer<typeof sourceAttributionSchema>

export const indexFileSchema = z.object({
  vocab: z.array(
    z.object({
      file: z.string(),
      level: jlptLevelSchema,
      count: z.number().int().nonnegative(),
      withSentences: z.number().int().nonnegative(),
    }),
  ),
  grammar: z.array(
    z.object({
      file: z.string(),
      level: jlptLevelSchema,
      count: z.number().int().nonnegative(),
    }),
  ),
  sources: z.object({
    vocab: sourceAttributionSchema,
    sentences: sourceAttributionSchema,
    grammar: sourceAttributionSchema,
    dictionary: sourceAttributionSchema,
  }),
  sourceVersions: z.object({
    tatoebaRelease: z.string(),
    jmdictVersion: z.string(),
  }),
  /** sha256 (truncated) of every emitted vocab/grammar file's exact bytes, in stable order — changes only when data content actually changes. Used by vite.config.ts to version the frontend's Workbox runtime cache for public/data/*.json. */
  dataVersion: z.string().min(1),
})
export type IndexFile = z.infer<typeof indexFileSchema>

export const SOURCE_ATTRIBUTION = {
  vocab: {
    name: 'JLPT 單字 N5–N1',
    repo: 'jamsinclair/open-anki-jlpt-decks',
    license: '開源（見來源 repo）',
  },
  sentences: {
    name: '日英例句',
    repo: 'mwhirls/tatoeba-json',
    license: 'CC BY 2.0 FR',
  },
  grammar: {
    name: '文法點內容',
    repo: 'tristcoil/hanabira.org-japanese-content',
    license: 'Creative Commons（從嚴依 CC BY-SA 4.0 對待）',
  },
  dictionary: {
    name: '字典補充',
    repo: 'scriptin/jmdict-simplified',
    license: 'CC BY-SA 4.0',
  },
} as const satisfies IndexFile['sources']

import { readFile } from 'node:fs/promises'
import Papa from 'papaparse'
import { RAW_PATHS } from './fetch.ts'
import { LEVEL_TO_NUMBER, type JlptLevel } from './schemas.ts'

export interface VocabRow {
  level: JlptLevel
  expression: string
  reading: string
  usageNote: string | null
  meaning: string
  tags: string
  guid: string
}

interface AnkiCsvRow {
  expression: string
  reading: string
  meaning: string
  tags: string
  guid: string
}

const LEVEL_FILES: Array<{ file: 'n1' | 'n2' | 'n3' | 'n4' | 'n5'; level: JlptLevel }> = [
  { file: 'n5', level: 'N5' },
  { file: 'n4', level: 'N4' },
  { file: 'n3', level: 'N3' },
  { file: 'n2', level: 'N2' },
  { file: 'n1', level: 'N1' },
]

/**
 * The Anki deck's reading column sometimes carries a parenthetical usage
 * note anywhere in the string (leading, trailing, or with no space), e.g.
 * "(〜を) とお", "けっこん (する)", "げひん(な)". Split it out so `reading`
 * is pure kana and the note is preserved separately.
 */
function splitUsageNote(reading: string): { reading: string; usageNote: string | null } {
  const match = reading.match(/\([^)]*\)/)
  if (!match || match.index === undefined) {
    return { reading, usageNote: null }
  }
  const usageNote = match[0]
  const cleaned = (reading.slice(0, match.index) + reading.slice(match.index + usageNote.length))
    .replace(/\s+/g, ' ')
    .trim()
  return { reading: cleaned, usageNote }
}

async function parseCsvFile(level: JlptLevel, filePath: string): Promise<VocabRow[]> {
  const text = await readFile(filePath, 'utf-8')
  const result = Papa.parse<AnkiCsvRow>(text, { header: true, skipEmptyLines: true })
  if (result.errors.length > 0) {
    throw new Error(
      `Failed to parse ${filePath}: ${result.errors.map((e) => e.message).join('; ')}`,
    )
  }
  return result.data
    .filter((row) => row.expression && row.reading)
    .map((row) => {
      const { reading, usageNote } = splitUsageNote(row.reading.trim())
      return {
        level,
        expression: row.expression.trim(),
        reading,
        usageNote,
        meaning: row.meaning?.trim() ?? '',
        tags: row.tags?.trim() ?? '',
        guid: row.guid?.trim() ?? '',
      }
    })
}

export async function loadVocabRows(): Promise<Record<JlptLevel, VocabRow[]>> {
  const entries = await Promise.all(
    LEVEL_FILES.map(async ({ file, level }) => [level, await parseCsvFile(level, RAW_PATHS.vocabCsv(file))] as const),
  )
  return Object.fromEntries(entries) as Record<JlptLevel, VocabRow[]>
}

/** Builds a lookup of expression/reading -> numeric JLPT level (1=N5 .. 5=N1) for the difficulty grader. */
export function buildLevelMap(rowsByLevel: Record<JlptLevel, VocabRow[]>): Map<string, number> {
  const map = new Map<string, number>()
  // LEVEL_FILES is ordered N5 -> N1, so when the same reading is shared by
  // multiple kanji (homophones), the easier level wins the ambiguous key.
  for (const { level } of LEVEL_FILES) {
    for (const row of rowsByLevel[level]) {
      const numericLevel = LEVEL_TO_NUMBER[level]
      if (!map.has(row.expression)) map.set(row.expression, numericLevel)
      if (!map.has(row.reading)) map.set(row.reading, numericLevel)
    }
  }
  return map
}

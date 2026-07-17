import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { ZodError } from 'zod'
import type { LinkedData } from './link.ts'
import {
  LEVEL_ORDER,
  vocabFileSchema,
  grammarFileSchema,
  indexFileSchema,
  SOURCE_ATTRIBUTION,
  type IndexFile,
} from './schemas.ts'

export const DATA_DIR = path.resolve(import.meta.dirname, '..', 'public', 'data')

function describeZodError(context: string, error: ZodError): string {
  const issues = error.issues
    .slice(0, 10)
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n')
  return `Schema validation failed for ${context}:\n${issues}`
}

export interface SourceVersions {
  tatoebaRelease: string
  jmdictVersion: string
}

export async function emit(data: LinkedData, sourceVersions: SourceVersions): Promise<IndexFile> {
  await mkdir(DATA_DIR, { recursive: true })

  const vocabIndexEntries: IndexFile['vocab'] = []
  const grammarIndexEntries: IndexFile['grammar'] = []

  for (const level of LEVEL_ORDER) {
    const file = `vocab-${level.toLowerCase()}.json`
    let validated
    try {
      validated = vocabFileSchema.parse(data.vocab[level])
    } catch (err) {
      if (err instanceof ZodError) throw new Error(describeZodError(file, err))
      throw err
    }
    await writeFile(path.join(DATA_DIR, file), `${JSON.stringify(validated, null, 2)}\n`, 'utf-8')
    const withSentences = validated.filter((v) => v.sentences.length > 0).length
    vocabIndexEntries.push({ file, level, count: validated.length, withSentences })
    console.log(
      `emit: ${file} (${validated.length} entries, ${withSentences} with sentences = ${((100 * withSentences) / validated.length).toFixed(1)}%)`,
    )
  }

  for (const level of LEVEL_ORDER) {
    const file = `grammar-${level.toLowerCase()}.json`
    let validated
    try {
      validated = grammarFileSchema.parse(data.grammar[level])
    } catch (err) {
      if (err instanceof ZodError) throw new Error(describeZodError(file, err))
      throw err
    }
    await writeFile(path.join(DATA_DIR, file), `${JSON.stringify(validated, null, 2)}\n`, 'utf-8')
    grammarIndexEntries.push({ file, level, count: validated.length })
    console.log(`emit: ${file} (${validated.length} entries)`)
  }

  const index: IndexFile = {
    vocab: vocabIndexEntries,
    grammar: grammarIndexEntries,
    sources: SOURCE_ATTRIBUTION,
    sourceVersions,
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

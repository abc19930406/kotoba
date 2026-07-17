import { readFile } from 'node:fs/promises'
import { RAW_PATHS } from './fetch.ts'

export interface TatoebaWord {
  headword: string
  reading?: string
  sense?: string
  surfaceForm?: string
  checked?: boolean
}

export interface TatoebaSentence {
  id: string
  text: string
  translation: string
  words: TatoebaWord[]
}

export async function loadTatoebaSentences(): Promise<TatoebaSentence[]> {
  const raw = await readFile(RAW_PATHS.tatoebaJson, 'utf-8')
  return JSON.parse(raw) as TatoebaSentence[]
}

export interface SentenceCandidate {
  id: string
  checked: boolean
}

/** Maps a vocab expression (dictionary headword) to candidate sentence ids that use it. */
export function buildHeadwordIndex(sentences: TatoebaSentence[]): Map<string, SentenceCandidate[]> {
  const index = new Map<string, SentenceCandidate[]>()
  for (const sentence of sentences) {
    for (const word of sentence.words) {
      if (!word.headword) continue
      let list = index.get(word.headword)
      if (!list) {
        list = []
        index.set(word.headword, list)
      }
      list.push({ id: sentence.id, checked: word.checked === true })
    }
  }
  return index
}

import { describe, expect, it } from 'vitest'
import { sortSentencesByCurrentLevel } from './sortSentences.ts'
import type { GradedSentence } from '../../shared/contentTypes.ts'

const sentences: GradedSentence[] = [
  { jp: 'L1 sentence', en: 'L1', difficulty: 1, jpSegments: [['L1 sentence']] },
  { jp: 'L3 sentence', en: 'L3', difficulty: 3, jpSegments: [['L3 sentence']] },
  { jp: 'L5 sentence', en: 'L5', difficulty: 5, jpSegments: [['L5 sentence']] },
  { jp: 'L2 sentence', en: 'L2', difficulty: 2, jpSegments: [['L2 sentence']] },
]

describe('sortSentencesByCurrentLevel', () => {
  it('puts the sentence closest in difficulty to the current level first', () => {
    const sorted = sortSentencesByCurrentLevel(sentences, 'N3') // N3 = difficulty 3
    expect(sorted.map((s) => s.difficulty)).toEqual([3, 2, 1, 5])
  })

  it('re-sorts differently for a different current level', () => {
    const sorted = sortSentencesByCurrentLevel(sentences, 'N1') // N1 = difficulty 5
    expect(sorted.map((s) => s.difficulty)).toEqual([5, 3, 2, 1])
  })

  it('does not mutate the input array', () => {
    const original = [...sentences]
    sortSentencesByCurrentLevel(sentences, 'N2')
    expect(sentences).toEqual(original)
  })

  it('returns an empty array unchanged', () => {
    expect(sortSentencesByCurrentLevel([], 'N5')).toEqual([])
  })
})
